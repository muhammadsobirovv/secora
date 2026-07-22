//! Local RAG. Two layers, both fully local:
//!
//! 1. **Keyword search (SQLite FTS5)** — always available, works
//!    completely offline, no AI provider required. This is the
//!    guaranteed baseline the spec calls for ("Search must work
//!    completely offline").
//! 2. **Semantic search (embeddings)** — opportunistic: if an
//!    embedding-capable AI provider is configured (OpenAI, Gemini,
//!    Ollama with an embedding model), `reindex_embeddings` computes and
//!    stores vectors; `search` blends FTS5 + cosine-similarity results
//!    when embeddings exist, and falls back to pure FTS5 when they don't
//!    (e.g. Anthropic/Groq/DeepSeek/OpenRouter-only setups, or fully
//!    offline with no provider at all).
//!
//! Indexes seven content types: Notes, Reports, Findings (recon + scan),
//! Payloads, Evidence (filename/tags/OCR'd text if any), Markdown files,
//! and Chat history — one `rag_index` FTS5 virtual table keyed by
//! `(source_type, source_id)`, re-population is idempotent (delete then
//! insert) so callers never have to diff old vs new content themselves.

pub mod indexer;

use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

use crate::error::{AppError, AppResult};

pub struct RagIndex {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagSearchResult {
    pub source_type: String,
    pub source_id: String,
    pub project_id: Option<String>,
    pub snippet: String,
    pub score: f64,
}

impl RagIndex {
    /// Opens a second connection to the *same* SQLite file the main
    /// `sqlx` pool uses — SQLite handles multiple connections to one file
    /// natively (WAL mode, enabled below, is what makes concurrent
    /// readers/writers from two different driver libraries safe).
    pub fn open(db_path: &Path) -> AppResult<Self> {
        let conn = Connection::open(db_path).map_err(AppError::from)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
            .map_err(AppError::from)?;
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS rag_index USING fts5(
                source_type, source_id UNINDEXED, project_id UNINDEXED, content
            );
            CREATE TABLE IF NOT EXISTS rag_embeddings (
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                project_id TEXT,
                vector BLOB NOT NULL,
                PRIMARY KEY (source_type, source_id)
            );",
        )
        .map_err(AppError::from)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn upsert(&self, source_type: &str, source_id: &str, project_id: Option<&str>, content: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("rag index mutex poisoned");
        conn.execute(
            "DELETE FROM rag_index WHERE source_type = ?1 AND source_id = ?2",
            rusqlite::params![source_type, source_id],
        )
        .map_err(AppError::from)?;
        conn.execute(
            "INSERT INTO rag_index (source_type, source_id, project_id, content) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![source_type, source_id, project_id, content],
        )
        .map_err(AppError::from)?;
        Ok(())
    }

    pub fn remove(&self, source_type: &str, source_id: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("rag index mutex poisoned");
        conn.execute(
            "DELETE FROM rag_index WHERE source_type = ?1 AND source_id = ?2",
            rusqlite::params![source_type, source_id],
        )
        .map_err(AppError::from)?;
        conn.execute(
            "DELETE FROM rag_embeddings WHERE source_type = ?1 AND source_id = ?2",
            rusqlite::params![source_type, source_id],
        )
        .map_err(AppError::from)?;
        Ok(())
    }

    pub fn store_embedding(&self, source_type: &str, source_id: &str, project_id: Option<&str>, vector: &[f32]) -> AppResult<()> {
        let bytes: Vec<u8> = vector.iter().flat_map(|f| f.to_le_bytes()).collect();
        let conn = self.conn.lock().expect("rag index mutex poisoned");
        conn.execute(
            "INSERT INTO rag_embeddings (source_type, source_id, project_id, vector) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(source_type, source_id) DO UPDATE SET vector = excluded.vector",
            rusqlite::params![source_type, source_id, project_id, bytes],
        )
        .map_err(AppError::from)?;
        Ok(())
    }

    /// FTS5 keyword search — the offline-guaranteed path. `source_types`
    /// empty means "search everything"; non-empty filters to just those
    /// (e.g. `["NOTE", "FINDING"]`).
    pub fn search_keyword(&self, query: &str, project_id: Option<&str>, limit: i64) -> AppResult<Vec<RagSearchResult>> {
        let conn = self.conn.lock().expect("rag index mutex poisoned");
        let sql = "SELECT source_type, source_id, project_id, snippet(rag_index, 3, '[', ']', '…', 12), bm25(rag_index)
                    FROM rag_index WHERE rag_index MATCH ?1
                    AND (?2 IS NULL OR project_id = ?2)
                    ORDER BY bm25(rag_index) LIMIT ?3";
        let mut stmt = conn.prepare(sql).map_err(AppError::from)?;
        let rows = stmt
            .query_map(rusqlite::params![query, project_id, limit], |row| {
                Ok(RagSearchResult {
                    source_type: row.get(0)?,
                    source_id: row.get(1)?,
                    project_id: row.get(2)?,
                    snippet: row.get(3)?,
                    score: row.get::<_, f64>(4)?,
                })
            })
            .map_err(AppError::from)?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(AppError::from)?);
        }
        Ok(out)
    }

    /// Lists everything currently in the FTS5 index (source_type, source_id,
    /// project_id, content) — used by `indexer::reindex_embeddings` to
    /// compute vectors for the whole corpus without needing to re-query the
    /// original `sqlx` tables a second time.
    pub fn list_all(&self) -> AppResult<Vec<(String, String, Option<String>, String)>> {
        let conn = self.conn.lock().expect("rag index mutex poisoned");
        let mut stmt = conn
            .prepare("SELECT source_type, source_id, project_id, content FROM rag_index")
            .map_err(AppError::from)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?))
            })
            .map_err(AppError::from)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(AppError::from)?);
        }
        Ok(out)
    }

    /// Semantic search over stored embeddings via brute-force cosine
    /// similarity — appropriate at the data volumes a single-user desktop
    /// app's local index reaches (thousands, not millions, of rows); a
    /// proper ANN index (e.g. usearch/hnsw) is a future optimization, not
    /// a correctness requirement.
    pub fn search_semantic(&self, query_vector: &[f32], project_id: Option<&str>, limit: usize) -> AppResult<Vec<RagSearchResult>> {
        let conn = self.conn.lock().expect("rag index mutex poisoned");
        let mut stmt = conn
            .prepare("SELECT source_type, source_id, project_id, vector FROM rag_embeddings WHERE (?1 IS NULL OR project_id = ?1)")
            .map_err(AppError::from)?;
        let rows = stmt
            .query_map(rusqlite::params![project_id], |row| {
                let source_type: String = row.get(0)?;
                let source_id: String = row.get(1)?;
                let project_id: Option<String> = row.get(2)?;
                let bytes: Vec<u8> = row.get(3)?;
                Ok((source_type, source_id, project_id, bytes))
            })
            .map_err(AppError::from)?;

        let mut scored: Vec<(f64, RagSearchResult)> = Vec::new();
        for row in rows {
            let (source_type, source_id, project_id, bytes) = row.map_err(AppError::from)?;
            let vector: Vec<f32> = bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
            let score = cosine_similarity(query_vector, &vector);
            scored.push((
                score,
                RagSearchResult { source_type, source_id, project_id, snippet: String::new(), score },
            ));
        }
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        Ok(scored.into_iter().take(limit).map(|(_, r)| r).collect())
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    (dot / (norm_a * norm_b)) as f64
}

#[cfg(test)]
mod tests {
    use super::cosine_similarity;

    #[test]
    fn identical_vectors_score_one() {
        let v = [1.0, 2.0, 3.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn orthogonal_vectors_score_zero() {
        assert!((cosine_similarity(&[1.0, 0.0], &[0.0, 1.0])).abs() < 1e-6);
    }

    #[test]
    fn opposite_vectors_score_negative_one() {
        assert!((cosine_similarity(&[1.0, 0.0], &[-1.0, 0.0]) + 1.0).abs() < 1e-6);
    }

    #[test]
    fn mismatched_lengths_or_empty_score_zero_rather_than_panicking() {
        assert_eq!(cosine_similarity(&[1.0, 2.0], &[1.0]), 0.0);
        assert_eq!(cosine_similarity(&[], &[]), 0.0);
    }

    #[test]
    fn zero_vector_scores_zero_rather_than_dividing_by_zero() {
        assert_eq!(cosine_similarity(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
    }
}

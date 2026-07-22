//! Pulls content from the main `sqlx` tables and pushes it into
//! `RagIndex`'s FTS5 table — the "indexing" half of Local RAG. Called
//! once at startup (full reindex) and incrementally whenever a note/
//! finding/report/payload/evidence row is created or updated (each
//! repository's write path calls the matching `index_*` function so the
//! search index never drifts out of sync with the source of truth).

use sqlx::SqlitePool;
use std::sync::Arc;

use super::RagIndex;
use crate::ai::providers::{AiProvider, ResolvedCredential};
use crate::error::AppResult;

/// Embedding batch size — kept small and conservative since remote
/// providers (OpenAI/Gemini) impose per-request payload limits and this
/// runs on-demand from a Settings button, not on a hot path.
const EMBED_BATCH_SIZE: usize = 32;

pub async fn reindex_all(db: &SqlitePool, rag: &Arc<RagIndex>) -> AppResult<usize> {
    let mut count = 0;

    // notes.title is nullable, notes.project_id is NOT NULL (see
    // migrations/0001_init.sql) — decode order/optionality must match the
    // schema exactly or sqlx returns a decode error for any row with a
    // NULL title.
    let notes: Vec<(String, String, Option<String>, String)> =
        sqlx::query_as("SELECT id, project_id, title, content FROM notes WHERE deleted_at IS NULL")
            .fetch_all(db)
            .await?;
    for (id, project_id, title, content) in notes {
        let text = format!("{}\n\n{}", title.unwrap_or_default(), content);
        rag.upsert("NOTE", &id, Some(&project_id), &text)?;
        count += 1;
    }

    let reports: Vec<(String, String, String, Option<String>)> =
        sqlx::query_as("SELECT id, project_id, title, content FROM reports")
            .fetch_all(db)
            .await?;
    for (id, project_id, title, content) in reports {
        let text = format!("{}\n\n{}", title, content.unwrap_or_default());
        rag.upsert("REPORT", &id, Some(&project_id), &text)?;
        count += 1;
    }

    let recon: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT rr.id, j.project_id, rr.finding_type, rr.value FROM recon_results rr JOIN jobs j ON j.id = rr.job_id",
    )
    .fetch_all(db)
    .await?;
    for (id, project_id, finding_type, value) in recon {
        rag.upsert("RECON_FINDING", &id, Some(&project_id), &format!("{finding_type}: {value}"))?;
        count += 1;
    }

    let scans: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT sr.id, j.project_id, sr.title, sr.description FROM scan_results sr JOIN jobs j ON j.id = sr.job_id",
    )
    .fetch_all(db)
    .await?;
    for (id, project_id, title, description) in scans {
        let text = format!("{}\n\n{}", title, description.unwrap_or_default());
        rag.upsert("SCAN_FINDING", &id, Some(&project_id), &text)?;
        count += 1;
    }

    let evidence: Vec<(String, String, String, String)> =
        sqlx::query_as("SELECT id, project_id, file_name, tags FROM evidence")
            .fetch_all(db)
            .await?;
    for (id, project_id, file_name, tags) in evidence {
        rag.upsert("EVIDENCE", &id, Some(&project_id), &format!("{file_name} {tags}"))?;
        count += 1;
    }

    let payloads: Vec<(String, String, String, Option<String>, String)> =
        sqlx::query_as("SELECT id, category, title, description, example FROM payloads")
            .fetch_all(db)
            .await?;
    for (id, category, title, description, example) in payloads {
        let text = format!("{category} {title}\n{}\n{example}", description.unwrap_or_default());
        rag.upsert("PAYLOAD", &id, None, &text)?;
        count += 1;
    }

    let messages: Vec<(String, Option<String>, String)> = sqlx::query_as(
        "SELECT m.id, c.project_id, m.content FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id",
    )
    .fetch_all(db)
    .await?;
    for (id, project_id, content) in messages {
        rag.upsert("CONVERSATION_MESSAGE", &id, project_id.as_deref(), &content)?;
        count += 1;
    }

    Ok(count)
}

/// Computes embeddings for every row currently in the FTS5 index and
/// stores them in `rag_embeddings`, batching requests to `EMBED_BATCH_SIZE`
/// at a time. Called on explicit user action (Settings > AI > "Enable
/// semantic search" or a manual "Recompute embeddings" button), never
/// automatically — it costs real API calls/time against whatever provider
/// is configured, unlike `reindex_all` which is pure local SQL.
pub async fn reindex_embeddings(
    _db: &SqlitePool,
    rag: &Arc<RagIndex>,
    provider: &dyn AiProvider,
    credential: &ResolvedCredential,
) -> AppResult<usize> {
    let rows = rag.list_all()?;
    let mut count = 0;

    for chunk in rows.chunks(EMBED_BATCH_SIZE) {
        let texts: Vec<String> = chunk.iter().map(|(_, _, _, content)| content.clone()).collect();
        let vectors = provider.embed(&texts, credential).await?;
        for ((source_type, source_id, project_id, _content), vector) in chunk.iter().zip(vectors.iter()) {
            rag.store_embedding(source_type, source_id, project_id.as_deref(), vector)?;
            count += 1;
        }
    }

    Ok(count)
}

//! Freeform project notes — Markdown content, indexed into Local RAG (see
//! `rag::indexer::reindex_all`'s `NOTE` handling) and synced via the
//! `NOTE` entity in `sync::ENTITIES`.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct NoteRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub project_id: String,
    pub title: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub sync_status: String,
}

pub struct NotesRepository {
    pool: SqlitePool,
    rag: Option<std::sync::Arc<crate::rag::RagIndex>>,
}

impl NotesRepository {
    pub fn new(pool: SqlitePool, rag: Option<std::sync::Arc<crate::rag::RagIndex>>) -> Self {
        Self { pool, rag }
    }

    fn reindex(&self, note: &NoteRecord) {
        if let Some(rag) = &self.rag {
            let text = format!("{}\n\n{}", note.title.clone().unwrap_or_default(), note.content);
            let _ = rag.upsert("NOTE", &note.id, Some(&note.project_id), &text);
        }
    }

    pub async fn create(&self, id: &str, project_id: &str, title: Option<&str>, content: &str) -> AppResult<NoteRecord> {
        sqlx::query("INSERT INTO notes (id, project_id, title, content) VALUES (?1, ?2, ?3, ?4)")
            .bind(id)
            .bind(project_id)
            .bind(title)
            .bind(content)
            .execute(&self.pool)
            .await?;
        let note = self.get(id).await?.ok_or_else(|| crate::error::AppError::new("NOTE_NOT_FOUND", "Note vanished immediately after insert."))?;
        self.reindex(&note);
        Ok(note)
    }

    pub async fn update(&self, id: &str, title: Option<&str>, content: &str) -> AppResult<NoteRecord> {
        sqlx::query(
            "UPDATE notes SET title = ?1, content = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sync_status = 'PENDING'
             WHERE id = ?3 AND deleted_at IS NULL",
        )
        .bind(title)
        .bind(content)
        .bind(id)
        .execute(&self.pool)
        .await?;
        let note = self.get(id).await?.ok_or_else(|| crate::error::AppError::new("NOTE_NOT_FOUND", "Note not found."))?;
        self.reindex(&note);
        Ok(note)
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<NoteRecord>> {
        let row = sqlx::query_as::<_, NoteRecord>(
            "SELECT id, remote_id, project_id, title, content, created_at, updated_at, sync_status
             FROM notes WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list(&self, project_id: &str) -> AppResult<Vec<NoteRecord>> {
        let rows = sqlx::query_as::<_, NoteRecord>(
            "SELECT id, remote_id, project_id, title, content, created_at, updated_at, sync_status
             FROM notes WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn soft_delete(&self, id: &str) -> AppResult<()> {
        sqlx::query(
            "UPDATE notes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sync_status = 'PENDING' WHERE id = ?1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        if let Some(rag) = &self.rag {
            let _ = rag.remove("NOTE", id);
        }
        Ok(())
    }
}

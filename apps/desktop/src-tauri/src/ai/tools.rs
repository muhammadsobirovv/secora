//! Tool Calling — local tools the AI can invoke mid-conversation, mirroring
//! `apps/api/src/modules/ai/tools/*` (search_findings, search_notes, …)
//! but reading from the Desktop Agent's own SQLite tables instead of the
//! backend's Postgres. Kept intentionally small for this pass — extended
//! as Local RAG (task #140) comes online, since most of these tools are
//! "search the local index" queries.

use async_trait::async_trait;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::providers::ToolDefinition;
use crate::error::AppResult;

#[async_trait]
pub trait DesktopTool: Send + Sync {
    fn definition(&self) -> ToolDefinition;
    async fn execute(&self, input: &Value, db: &SqlitePool) -> AppResult<Value>;
}

pub struct SearchNotesTool;

#[async_trait]
impl DesktopTool for SearchNotesTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "search_notes".into(),
            description: "Full-text search this workspace's local notes.".into(),
            parameters: json!({
                "type": "object",
                "properties": { "query": { "type": "string" } },
                "required": ["query"]
            }),
        }
    }

    async fn execute(&self, input: &Value, db: &SqlitePool) -> AppResult<Value> {
        let query = input["query"].as_str().unwrap_or_default();
        let pattern = format!("%{query}%");
        let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
            "SELECT id, content, title FROM notes WHERE deleted_at IS NULL AND content LIKE ?1 LIMIT 10",
        )
        .bind(pattern)
        .fetch_all(db)
        .await?;

        Ok(json!(rows
            .into_iter()
            .map(|(id, content, title)| json!({ "id": id, "title": title, "excerpt": content.chars().take(200).collect::<String>() }))
            .collect::<Vec<_>>()))
    }
}

pub struct SearchReconResultsTool;

#[async_trait]
impl DesktopTool for SearchReconResultsTool {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "search_recon_results".into(),
            description: "Search this project's local recon findings (subdomains, URLs, ports, etc.).".into(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "project_id": { "type": "string" },
                    "query": { "type": "string" }
                },
                "required": ["project_id", "query"]
            }),
        }
    }

    async fn execute(&self, input: &Value, db: &SqlitePool) -> AppResult<Value> {
        let project_id = input["project_id"].as_str().unwrap_or_default();
        let query = input["query"].as_str().unwrap_or_default();
        let pattern = format!("%{query}%");
        let rows: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT rr.tool, rr.finding_type, rr.value FROM recon_results rr
             JOIN jobs j ON j.id = rr.job_id
             WHERE j.project_id = ?1 AND rr.value LIKE ?2 LIMIT 20",
        )
        .bind(project_id)
        .bind(pattern)
        .fetch_all(db)
        .await?;

        Ok(json!(rows
            .into_iter()
            .map(|(tool, finding_type, value)| json!({ "tool": tool, "type": finding_type, "value": value }))
            .collect::<Vec<_>>()))
    }
}

pub struct ToolRegistry {
    tools: Vec<Box<dyn DesktopTool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: vec![Box::new(SearchNotesTool), Box::new(SearchReconResultsTool)],
        }
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools.iter().map(|t| t.definition()).collect()
    }

    pub async fn execute(&self, name: &str, input: &Value, db: &SqlitePool) -> AppResult<Value> {
        for tool in &self.tools {
            if tool.definition().name == name {
                return tool.execute(input, db).await;
            }
        }
        Err(crate::error::AppError::new("TOOL_NOT_FOUND", format!("Unknown AI tool \"{name}\".")))
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

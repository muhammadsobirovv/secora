//! Aggregates everything a report needs straight from SQLite. Read-only —
//! deliberately raw `sqlx::query_as` rather than going through
//! `ProjectsRepository`/etc. since the report only ever needs a handful of
//! columns per table and building full repository types for
//! `recon_results`/`scan_results` (which nothing else needs yet) would be
//! pure ceremony.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TargetSummary {
    pub id: String,
    #[sqlx(rename = "type")]
    pub target_type: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ReconFindingRow {
    pub tool: String,
    pub finding_type: String,
    pub value: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ScanFindingRow {
    pub tool: String,
    pub severity: String,
    pub title: String,
    pub description: Option<String>,
    pub endpoint: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct NoteSummary {
    pub title: Option<String>,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct EvidenceSummary {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub mime_type: Option<String>,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportData {
    pub project: ProjectSummary,
    pub targets: Vec<TargetSummary>,
    pub recon_findings: Vec<ReconFindingRow>,
    pub scan_findings: Vec<ScanFindingRow>,
    pub notes: Vec<NoteSummary>,
    pub evidence: Vec<EvidenceSummary>,
    pub generated_at: String,
}

/// Fixed severity ordering (worst first) — matches the web app's
/// `SEVERITY_ORDER` (Modules 4/6) so reports read the same way regardless
/// of which client generated them.
pub const SEVERITY_ORDER: &[&str] = &["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

pub async fn collect(db: &SqlitePool, project_id: &str) -> AppResult<ReportData> {
    let project: ProjectSummary = sqlx::query_as("SELECT id, name, description, status FROM projects WHERE id = ?1")
        .bind(project_id)
        .fetch_one(db)
        .await?;

    let targets: Vec<TargetSummary> = sqlx::query_as("SELECT id, type, value FROM targets WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY value")
        .bind(project_id)
        .fetch_all(db)
        .await?;

    let mut recon_findings: Vec<ReconFindingRow> = sqlx::query_as(
        "SELECT rr.tool, rr.finding_type, rr.value, rr.created_at
         FROM recon_results rr JOIN jobs j ON j.id = rr.job_id
         WHERE j.project_id = ?1 ORDER BY rr.created_at DESC",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;
    recon_findings.truncate(2000); // sanity cap — a report isn't meant to be a raw data dump

    let mut scan_findings: Vec<ScanFindingRow> = sqlx::query_as(
        "SELECT sr.tool, sr.severity, sr.title, sr.description, sr.endpoint, sr.created_at
         FROM scan_results sr JOIN jobs j ON j.id = sr.job_id
         WHERE j.project_id = ?1",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;
    scan_findings.sort_by_key(|f| SEVERITY_ORDER.iter().position(|s| *s == f.severity).unwrap_or(SEVERITY_ORDER.len()));

    let notes: Vec<NoteSummary> = sqlx::query_as(
        "SELECT title, content, updated_at FROM notes WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    let evidence: Vec<EvidenceSummary> =
        sqlx::query_as("SELECT id, file_name, file_path, mime_type, sha256 FROM evidence WHERE project_id = ?1 ORDER BY created_at DESC")
            .bind(project_id)
            .fetch_all(db)
            .await?;

    Ok(ReportData {
        project,
        targets,
        recon_findings,
        scan_findings,
        notes,
        evidence,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

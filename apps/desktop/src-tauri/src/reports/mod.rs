//! Report Generator — every format is produced entirely on-device from
//! `data::ReportData` (one aggregation query, seven renderers), matching
//! the local-first posture of the rest of Module 7: no server round-trip
//! to generate a report, and the report generator keeps working with zero
//! connectivity.

pub mod data;
pub mod docx;
pub mod html;
pub mod json;
pub mod markdown;
pub mod pdf;
pub mod txt;
pub mod zip;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReportFormat {
    Pdf,
    Markdown,
    Html,
    Docx,
    Txt,
    Json,
    Zip,
}

impl ReportFormat {
    fn extension(&self) -> &'static str {
        match self {
            ReportFormat::Pdf => "pdf",
            ReportFormat::Markdown => "md",
            ReportFormat::Html => "html",
            ReportFormat::Docx => "docx",
            ReportFormat::Txt => "txt",
            ReportFormat::Json => "json",
            ReportFormat::Zip => "zip",
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ReportFormat::Pdf => "PDF",
            ReportFormat::Markdown => "MARKDOWN",
            ReportFormat::Html => "HTML",
            ReportFormat::Docx => "DOCX",
            ReportFormat::Txt => "TXT",
            ReportFormat::Json => "JSON",
            ReportFormat::Zip => "ZIP",
        }
    }
}

/// Generates a report for `project_id` in the given format, writes it
/// under `output_dir`, and returns the file path (content also inlined
/// for the text-based formats so the caller can store it in the `reports`
/// table's `content` column for quick preview without re-reading the
/// file).
pub async fn generate(db: &SqlitePool, project_id: &str, format: ReportFormat, output_dir: &Path) -> AppResult<(PathBuf, Option<String>)> {
    let report_data = data::collect(db, project_id).await?;
    let slug = slugify(&report_data.project.name);
    let file_name = format!("{slug}-{}.{}", chrono::Utc::now().format("%Y%m%d-%H%M%S"), format.extension());
    let output_path = output_dir.join(file_name);

    if let Some(parent) = output_path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(AppError::from)?;
    }

    let content = match format {
        ReportFormat::Markdown => {
            let text = markdown::render(&report_data);
            tokio::fs::write(&output_path, &text).await.map_err(AppError::from)?;
            Some(text)
        }
        ReportFormat::Html => {
            let text = html::render(&report_data);
            tokio::fs::write(&output_path, &text).await.map_err(AppError::from)?;
            Some(text)
        }
        ReportFormat::Txt => {
            let text = txt::render(&report_data);
            tokio::fs::write(&output_path, &text).await.map_err(AppError::from)?;
            Some(text)
        }
        ReportFormat::Json => {
            let text = json::render(&report_data);
            tokio::fs::write(&output_path, &text).await.map_err(AppError::from)?;
            Some(text)
        }
        ReportFormat::Pdf => {
            // printpdf/docx-rs/zip are synchronous, CPU-bound writers —
            // run them on the blocking thread pool so a large report
            // doesn't stall the async runtime's worker threads.
            let path = output_path.clone();
            tokio::task::spawn_blocking(move || pdf::render(&report_data, &path))
                .await
                .map_err(|e| AppError::new("TASK_JOIN_ERROR", e.to_string()))??;
            None
        }
        ReportFormat::Docx => {
            let path = output_path.clone();
            tokio::task::spawn_blocking(move || docx::render(&report_data, &path))
                .await
                .map_err(|e| AppError::new("TASK_JOIN_ERROR", e.to_string()))??;
            None
        }
        ReportFormat::Zip => {
            let path = output_path.clone();
            tokio::task::spawn_blocking(move || zip::render(&report_data, &path))
                .await
                .map_err(|e| AppError::new("TASK_JOIN_ERROR", e.to_string()))??;
            None
        }
    };

    Ok((output_path, content))
}

fn slugify(s: &str) -> String {
    let slug: String = s.to_lowercase().chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect();
    let collapsed = regex::Regex::new(r"-+").unwrap().replace_all(&slug, "-").trim_matches('-').to_string();
    if collapsed.is_empty() {
        "report".to_string()
    } else {
        collapsed
    }
}

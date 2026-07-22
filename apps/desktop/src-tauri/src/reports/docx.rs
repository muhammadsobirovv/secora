//! DOCX export via `docx-rs` — a pure-Rust, write-only Office Open XML
//! writer (no LibreOffice/MS Word dependency). Same "walk the Markdown
//! line-by-line, map headings/bullets/paragraphs" approach as `pdf.rs`
//! rather than a full Markdown AST, since the report content only ever
//! uses headings/paragraphs/bullets/bold (see `markdown.rs`).
//!
//! NOTE: written against `docx-rs` 0.4's documented API from training
//! knowledge, without a compiler available in this sandbox — run `cargo
//! check` on a real machine and adjust call sites if the API has drifted.

use std::path::Path;

use docx_rs::{Docx, Paragraph, Run, RunFonts};

use super::data::ReportData;
use crate::error::{AppError, AppResult};

pub fn render(data: &ReportData, output_path: &Path) -> AppResult<()> {
    let md = super::markdown::render(data);
    let mut docx = Docx::new();

    for raw_line in md.lines() {
        let trimmed = raw_line.trim_start();
        let paragraph = if let Some(rest) = trimmed.strip_prefix("# ") {
            heading_paragraph(rest, 32)
        } else if let Some(rest) = trimmed.strip_prefix("## ") {
            heading_paragraph(rest, 26)
        } else if let Some(rest) = trimmed.strip_prefix("### ") {
            heading_paragraph(rest, 22)
        } else if let Some(rest) = trimmed.strip_prefix("#### ") {
            heading_paragraph(rest, 20)
        } else if let Some(rest) = trimmed.strip_prefix("- ") {
            Paragraph::new().add_run(Run::new().add_text(format!("•  {}", strip_markup(rest))).size(21))
        } else if trimmed.is_empty() {
            Paragraph::new().add_run(Run::new().add_text(""))
        } else {
            Paragraph::new().add_run(Run::new().add_text(strip_markup(trimmed)).size(21))
        };
        docx = docx.add_paragraph(paragraph);
    }

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    let file = std::fs::File::create(output_path).map_err(AppError::from)?;
    docx.build().pack(file).map_err(|e| AppError::new("DOCX_ERROR", format!("{e:?}")))?;
    Ok(())
}

fn heading_paragraph(text: &str, size: usize) -> Paragraph {
    Paragraph::new().add_run(Run::new().add_text(strip_markup(text)).bold().size(size).fonts(RunFonts::new().ascii("Calibri")))
}

fn strip_markup(s: &str) -> String {
    s.replace("**", "").replace('`', "")
}

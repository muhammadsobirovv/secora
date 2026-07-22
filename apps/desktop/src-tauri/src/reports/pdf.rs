//! PDF export via `printpdf` — a pure-Rust PDF writer (no system PDF
//! engine/wkhtmltopdf/Chromium dependency, keeping the desktop binary
//! self-contained). Lays out the Markdown render as plain paragraphs with
//! simple heading-size bumps; this is a text-flow renderer, not a full
//! Markdown-to-PDF typesetter — good enough for a pentest report's actual
//! content (headings, paragraphs, bullet lists), not attempting tables/
//! inline code styling in this pass.
//!
//! NOTE: written against `printpdf` 0.7's documented API from training
//! knowledge, without a compiler available in this sandbox to verify
//! against the exact crate version `cargo` resolves — run `cargo check`
//! on a real machine and adjust call sites if the API has drifted.

use std::io::BufWriter;
use std::path::Path;

use printpdf::{BuiltinFont, Mm, PdfDocument};

use super::data::ReportData;
use crate::error::{AppError, AppResult};

const PAGE_WIDTH_MM: f64 = 210.0; // A4
const PAGE_HEIGHT_MM: f64 = 297.0;
const MARGIN_MM: f64 = 20.0;
const LINE_HEIGHT_MM: f64 = 6.0;
const CHARS_PER_LINE: usize = 95; // rough wrap width for 11pt Helvetica on an A4 page with 20mm margins

pub fn render(data: &ReportData, output_path: &Path) -> AppResult<()> {
    let md = super::markdown::render(data);

    let (doc, page1, layer1) = PdfDocument::new(&data.project.name, Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Content");
    let font = doc.add_builtin_font(BuiltinFont::Helvetica).map_err(|e| AppError::new("PDF_ERROR", e.to_string()))?;
    let font_bold = doc.add_builtin_font(BuiltinFont::HelveticaBold).map_err(|e| AppError::new("PDF_ERROR", e.to_string()))?;

    let mut current_layer = doc.get_page(page1).get_layer(layer1);
    let mut y = PAGE_HEIGHT_MM - MARGIN_MM;

    for raw_line in md.lines() {
        let (text, size, bold) = classify_line(raw_line);
        if text.is_empty() {
            y -= LINE_HEIGHT_MM / 2.0;
            continue;
        }

        for wrapped in wrap_text(&text, CHARS_PER_LINE) {
            if y < MARGIN_MM {
                let (page, layer) = doc.add_page(Mm(PAGE_WIDTH_MM), Mm(PAGE_HEIGHT_MM), "Content");
                current_layer = doc.get_page(page).get_layer(layer);
                y = PAGE_HEIGHT_MM - MARGIN_MM;
            }
            let use_font = if bold { &font_bold } else { &font };
            current_layer.use_text(&wrapped, size, Mm(MARGIN_MM), Mm(y), use_font);
            y -= LINE_HEIGHT_MM.max(size * 0.4);
        }
    }

    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    let file = std::fs::File::create(output_path).map_err(AppError::from)?;
    doc.save(&mut BufWriter::new(file)).map_err(|e| AppError::new("PDF_ERROR", e.to_string()))?;
    Ok(())
}

/// Maps a Markdown line to (text-without-markup, font-size, bold).
fn classify_line(line: &str) -> (String, f64, bool) {
    let trimmed = line.trim_start();
    if let Some(rest) = trimmed.strip_prefix("# ") {
        (rest.to_string(), 20.0, true)
    } else if let Some(rest) = trimmed.strip_prefix("## ") {
        (rest.to_string(), 16.0, true)
    } else if let Some(rest) = trimmed.strip_prefix("### ") {
        (rest.to_string(), 13.0, true)
    } else if let Some(rest) = trimmed.strip_prefix("#### ") {
        (rest.to_string(), 11.5, true)
    } else if let Some(rest) = trimmed.strip_prefix("- ") {
        (format!("•  {}", strip_inline_markup(rest)), 10.5, false)
    } else {
        (strip_inline_markup(trimmed), 10.5, false)
    }
}

fn strip_inline_markup(s: &str) -> String {
    s.replace("**", "").replace('`', "")
}

fn wrap_text(text: &str, width: usize) -> Vec<String> {
    if text.len() <= width {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.len() + word.len() + 1 > width && !current.is_empty() {
            lines.push(current.clone());
            current.clear();
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

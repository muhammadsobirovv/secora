//! ZIP export — bundles every other report format plus the project's
//! evidence files into one archive, so a user can hand a single file to a
//! client/teammate that contains the report *and* its supporting exhibits.

use std::io::Write;
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::data::ReportData;
use crate::error::{AppError, AppResult};

pub fn render(data: &ReportData, output_path: &Path) -> AppResult<()> {
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(AppError::from)?;
    }
    let file = std::fs::File::create(output_path).map_err(AppError::from)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let slug = slugify(&data.project.name);

    zip.start_file(format!("{slug}.md"), options).map_err(zip_err)?;
    zip.write_all(super::markdown::render(data).as_bytes()).map_err(AppError::from)?;

    zip.start_file(format!("{slug}.html"), options).map_err(zip_err)?;
    zip.write_all(super::html::render(data).as_bytes()).map_err(AppError::from)?;

    zip.start_file(format!("{slug}.txt"), options).map_err(zip_err)?;
    zip.write_all(super::txt::render(data).as_bytes()).map_err(AppError::from)?;

    zip.start_file(format!("{slug}.json"), options).map_err(zip_err)?;
    zip.write_all(super::json::render(data).as_bytes()).map_err(AppError::from)?;

    if !data.evidence.is_empty() {
        for evidence in &data.evidence {
            let source = Path::new(&evidence.file_path);
            if !source.exists() {
                continue; // file moved/deleted since import — skip rather than fail the whole export
            }
            let bytes = std::fs::read(source).map_err(AppError::from)?;
            zip.start_file(format!("evidence/{}", evidence.file_name), options).map_err(zip_err)?;
            zip.write_all(&bytes).map_err(AppError::from)?;
        }
    }

    zip.finish().map_err(zip_err)?;
    Ok(())
}

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::new("ZIP_ERROR", e.to_string())
}

fn slugify(s: &str) -> String {
    let slug: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let collapsed = regex::Regex::new(r"-+").unwrap().replace_all(&slug, "-").trim_matches('-').to_string();
    if collapsed.is_empty() {
        "report".to_string()
    } else {
        collapsed
    }
}

//! JSON export — the raw `ReportData` struct, already `Serialize`. This is
//! the "feed it into another tool" format, so it's structured data rather
//! than the prose the other six formats produce.

use super::data::ReportData;

pub fn render(data: &ReportData) -> String {
    serde_json::to_string_pretty(data).unwrap_or_else(|e| format!(r#"{{"error":"serialization failed: {e}"}}"#))
}

//! Plain-text export — the Markdown render with the lightweight-markup
//! syntax stripped out. Intentionally simple (line-based regex passes,
//! not a full Markdown AST walk) since TXT is the "paste into an email"
//! format, not something that needs perfect fidelity.

use regex::Regex;

use super::data::ReportData;

pub fn render(data: &ReportData) -> String {
    let md = super::markdown::render(data);

    let heading_re = Regex::new(r"(?m)^#{1,6}\s+").unwrap();
    let bold_re = Regex::new(r"\*\*(.*?)\*\*").unwrap();
    let italic_re = Regex::new(r"_(.*?)_").unwrap();
    let code_re = Regex::new(r"`([^`]*)`").unwrap();
    let bullet_re = Regex::new(r"(?m)^-\s+").unwrap();

    let mut text = heading_re.replace_all(&md, "").to_string();
    text = bold_re.replace_all(&text, "$1").to_string();
    text = italic_re.replace_all(&text, "$1").to_string();
    text = code_re.replace_all(&text, "$1").to_string();
    text = bullet_re.replace_all(&text, "  * ").to_string();

    text
}

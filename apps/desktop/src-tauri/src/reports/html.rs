//! Markdown -> styled, self-contained HTML (inline `<style>`, no external
//! assets, so the file opens correctly from anywhere it's copied to).

use pulldown_cmark::{html, Options, Parser};

use super::data::ReportData;

pub fn render(data: &ReportData) -> String {
    let md = super::markdown::render(data);

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    let parser = Parser::new_ext(&md, options);

    let mut body_html = String::new();
    html::push_html(&mut body_html, parser);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title} — Secora AI Report</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.6; }}
  h1 {{ border-bottom: 3px solid #dc2626; padding-bottom: 12px; }}
  h2 {{ border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; margin-top: 40px; }}
  h3 {{ color: #dc2626; }}
  code {{ background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }}
  pre {{ background: #18181b; color: #f4f4f5; padding: 16px; border-radius: 8px; overflow-x: auto; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #e5e5e5; padding: 8px 12px; text-align: left; }}
  th {{ background: #f4f4f5; }}
  .meta {{ color: #71717a; font-size: 0.9em; }}
</style>
</head>
<body>
{body}
</body>
</html>
"#,
        title = html_escape(&data.project.name),
        body = body_html
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

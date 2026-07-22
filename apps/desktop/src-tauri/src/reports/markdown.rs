//! Renders `ReportData` to Markdown — the canonical intermediate format
//! every other export (HTML via `pulldown-cmark`, TXT via a stripped
//! render, and the text laid out into PDF/DOCX) derives from, so there's
//! exactly one place that decides "what does a report say," not seven.

use super::data::ReportData;

pub fn render(data: &ReportData) -> String {
    let mut md = String::new();

    md.push_str(&format!("# {}\n\n", data.project.name));
    if let Some(desc) = &data.project.description {
        if !desc.is_empty() {
            md.push_str(&format!("{desc}\n\n"));
        }
    }
    md.push_str(&format!("**Status:** {}  \n**Generated:** {}\n\n", data.project.status, data.generated_at));

    md.push_str("## Scope\n\n");
    if data.targets.is_empty() {
        md.push_str("_No targets defined._\n\n");
    } else {
        for t in &data.targets {
            md.push_str(&format!("- `{}` ({})\n", t.value, t.target_type));
        }
        md.push('\n');
    }

    md.push_str("## Findings\n\n");
    if data.scan_findings.is_empty() {
        md.push_str("_No vulnerability findings recorded._\n\n");
    } else {
        for severity in super::data::SEVERITY_ORDER {
            let group: Vec<_> = data.scan_findings.iter().filter(|f| f.severity == *severity).collect();
            if group.is_empty() {
                continue;
            }
            md.push_str(&format!("### {} ({})\n\n", title_case(severity), group.len()));
            for f in group {
                md.push_str(&format!("#### {}\n\n", f.title));
                md.push_str(&format!("- **Tool:** {}\n", f.tool));
                if let Some(endpoint) = &f.endpoint {
                    md.push_str(&format!("- **Endpoint:** `{endpoint}`\n"));
                }
                md.push_str(&format!("- **Found:** {}\n", f.created_at));
                if let Some(desc) = &f.description {
                    if !desc.is_empty() {
                        md.push_str(&format!("\n{desc}\n"));
                    }
                }
                md.push('\n');
            }
        }
    }

    md.push_str("## Reconnaissance Summary\n\n");
    if data.recon_findings.is_empty() {
        md.push_str("_No recon findings recorded._\n\n");
    } else {
        let mut by_type: std::collections::BTreeMap<&str, Vec<&super::data::ReconFindingRow>> = std::collections::BTreeMap::new();
        for f in &data.recon_findings {
            by_type.entry(f.finding_type.as_str()).or_default().push(f);
        }
        for (finding_type, items) in by_type {
            md.push_str(&format!("### {} ({})\n\n", title_case(finding_type), items.len()));
            for item in items.iter().take(500) {
                md.push_str(&format!("- `{}` _(via {})_\n", item.value, item.tool));
            }
            if items.len() > 500 {
                md.push_str(&format!("- _...and {} more_\n", items.len() - 500));
            }
            md.push('\n');
        }
    }

    if !data.notes.is_empty() {
        md.push_str("## Notes\n\n");
        for n in &data.notes {
            if let Some(title) = &n.title {
                md.push_str(&format!("### {title}\n\n"));
            }
            md.push_str(&format!("{}\n\n", n.content));
        }
    }

    if !data.evidence.is_empty() {
        md.push_str("## Evidence\n\n");
        for e in &data.evidence {
            md.push_str(&format!("- {} (`{}`)\n", e.file_name, e.mime_type.clone().unwrap_or_else(|| "unknown".to_string())));
        }
        md.push('\n');
    }

    md
}

fn title_case(s: &str) -> String {
    s.split('_')
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(first) => first.to_uppercase().collect::<String>() + &c.as_str().to_lowercase(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

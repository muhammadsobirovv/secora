use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `nuclei -u <url> -silent -jsonl -severity low,medium,high,critical` —
/// template-based vuln scanner, one JSON finding per line.
pub struct Nuclei;

#[async_trait]
impl ToolRunner for Nuclei {
    fn name(&self) -> &'static str {
        "NUCLEI"
    }
    fn binary(&self) -> &'static str {
        "nuclei"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url, TargetType::Domain, TargetType::Subdomain]
    }
    fn default_timeout_seconds(&self) -> u64 {
        1800
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-u".into(),
            target.value.clone(),
            "-silent".into(),
            "-jsonl".into(),
            "-severity".into(),
            "low,medium,high,critical".into(),
        ]
    }
}

use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `sqlmap -u <url> --batch --output-format=json --disable-coloring` —
/// SQL injection scanner. `--batch` avoids interactive prompts, which
/// would otherwise hang a headless spawned process indefinitely.
pub struct Sqlmap;

#[async_trait]
impl ToolRunner for Sqlmap {
    fn name(&self) -> &'static str {
        "SQLMAP"
    }
    fn binary(&self) -> &'static str {
        "sqlmap"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url]
    }
    fn default_timeout_seconds(&self) -> u64 {
        1800
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-u".into(),
            target.value.clone(),
            "--batch".into(),
            "--disable-coloring".into(),
        ]
    }
}

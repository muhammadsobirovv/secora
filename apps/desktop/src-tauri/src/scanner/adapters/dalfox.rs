use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `dalfox url <url> --silence --format json` — XSS scanner, JSON to
/// stdout.
pub struct Dalfox;

#[async_trait]
impl ToolRunner for Dalfox {
    fn name(&self) -> &'static str {
        "DALFOX"
    }
    fn binary(&self) -> &'static str {
        "dalfox"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url]
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "url".into(),
            target.value.clone(),
            "--silence".into(),
            "--format".into(),
            "json".into(),
        ]
    }
}

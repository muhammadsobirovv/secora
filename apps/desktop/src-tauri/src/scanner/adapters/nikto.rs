use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `nikto -h <url> -Format json -output -` — web server misconfiguration
/// scan, JSON report to stdout.
pub struct Nikto;

#[async_trait]
impl ToolRunner for Nikto {
    fn name(&self) -> &'static str {
        "NIKTO"
    }
    fn binary(&self) -> &'static str {
        "nikto"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url]
    }
    fn default_timeout_seconds(&self) -> u64 {
        1800
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-h".into(),
            target.value.clone(),
            "-Format".into(),
            "json".into(),
            "-output".into(),
            "-".into(),
        ]
    }
}

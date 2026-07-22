use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `subfinder -d <domain> -silent -oJ` — one JSON object per line
/// (`{"host": "...", "source": "..."}`), parsed by
/// `recon::normalizers::subfinder::parse` into subdomain findings.
pub struct Subfinder;

#[async_trait]
impl ToolRunner for Subfinder {
    fn name(&self) -> &'static str {
        "SUBFINDER"
    }

    fn binary(&self) -> &'static str {
        "subfinder"
    }

    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Domain]
    }

    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-d".into(),
            target.value.clone(),
            "-silent".into(),
            "-oJ".into(),
        ]
    }
}

use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `waybackurls <domain>` — Wayback Machine archived URLs, one per line.
pub struct Waybackurls;

#[async_trait]
impl ToolRunner for Waybackurls {
    fn name(&self) -> &'static str {
        "WAYBACKURLS"
    }
    fn binary(&self) -> &'static str {
        "waybackurls"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Domain, TargetType::Subdomain]
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![target.value.clone()]
    }
}

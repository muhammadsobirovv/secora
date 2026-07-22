use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `gau <domain>` — historical URLs from AlienVault OTX/Wayback/Common
/// Crawl, one URL per stdout line.
pub struct Gau;

#[async_trait]
impl ToolRunner for Gau {
    fn name(&self) -> &'static str {
        "GAU"
    }
    fn binary(&self) -> &'static str {
        "gau"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Domain, TargetType::Subdomain]
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![target.value.clone()]
    }
}

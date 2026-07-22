use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `dnsx -d <target> -silent -json -resp` — resolves A/AAAA/CNAME records.
pub struct Dnsx;

#[async_trait]
impl ToolRunner for Dnsx {
    fn name(&self) -> &'static str {
        "DNSX"
    }
    fn binary(&self) -> &'static str {
        "dnsx"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Domain, TargetType::Subdomain]
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec!["-d".into(), target.value.clone(), "-silent".into(), "-json".into(), "-resp".into()]
    }
}

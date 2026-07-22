use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `httpx -u <target> -silent -json -tech-detect -status-code -title` —
/// probes a host/URL over HTTP(S) and reports live status, title, and
/// detected technologies as one JSON object.
pub struct Httpx;

#[async_trait]
impl ToolRunner for Httpx {
    fn name(&self) -> &'static str {
        "HTTPX"
    }

    fn binary(&self) -> &'static str {
        "httpx"
    }

    fn supported_target_types(&self) -> &'static [TargetType] {
        &[
            TargetType::Domain,
            TargetType::Subdomain,
            TargetType::Url,
            TargetType::IpAddress,
        ]
    }

    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-u".into(),
            target.value.clone(),
            "-silent".into(),
            "-json".into(),
            "-tech-detect".into(),
            "-status-code".into(),
            "-title".into(),
        ]
    }
}

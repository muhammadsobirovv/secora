use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `naabu -host <target> -silent -json -top-ports 1000` — fast port scan,
/// one JSON object per open port.
pub struct Naabu;

#[async_trait]
impl ToolRunner for Naabu {
    fn name(&self) -> &'static str {
        "NAABU"
    }

    fn binary(&self) -> &'static str {
        "naabu"
    }

    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::IpAddress, TargetType::Cidr, TargetType::Domain, TargetType::Subdomain]
    }

    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-host".into(),
            target.value.clone(),
            "-silent".into(),
            "-json".into(),
            "-top-ports".into(),
            "1000".into(),
        ]
    }
}

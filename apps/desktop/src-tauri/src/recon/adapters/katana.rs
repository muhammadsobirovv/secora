use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `katana -u <url> -silent -jc -jsonl` — crawls the target and emits one
/// JSON object per discovered URL, parsed by
/// `recon::normalizers::katana::parse`.
pub struct Katana;

#[async_trait]
impl ToolRunner for Katana {
    fn name(&self) -> &'static str {
        "KATANA"
    }

    fn binary(&self) -> &'static str {
        "katana"
    }

    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url, TargetType::Domain, TargetType::Subdomain]
    }

    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-u".into(),
            target.value.clone(),
            "-silent".into(),
            "-jc".into(),
            "-jsonl".into(),
        ]
    }
}

use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `amass enum -d <domain> -json <stdout via -jsonfile /dev/stdout not
/// portable> -passive` — Amass has no native stdout-JSON stream flag
/// portable across OSes, so this runs passive enumeration with `-silent`
/// and one hostname per line (`-noalts`), matching the backend adapter's
/// same pragmatic choice (see `amass.tool-runner.ts`).
pub struct Amass;

#[async_trait]
impl ToolRunner for Amass {
    fn name(&self) -> &'static str {
        "AMASS"
    }

    fn binary(&self) -> &'static str {
        "amass"
    }

    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Domain]
    }

    fn default_timeout_seconds(&self) -> u64 {
        900
    }

    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "enum".into(),
            "-passive".into(),
            "-silent".into(),
            "-noalts".into(),
            "-d".into(),
            target.value.clone(),
        ]
    }
}

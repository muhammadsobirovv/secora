use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

const DEFAULT_WORDLIST: &str = "/usr/share/seclists/Discovery/Web-Content/common.txt";

/// `dirsearch -u <url> -w <wordlist> --format=json -o -` — content
/// discovery, JSON to stdout.
pub struct Dirsearch;

#[async_trait]
impl ToolRunner for Dirsearch {
    fn name(&self) -> &'static str {
        "DIRSEARCH"
    }
    fn binary(&self) -> &'static str {
        "dirsearch"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url]
    }
    fn default_timeout_seconds(&self) -> u64 {
        1800
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec![
            "-u".into(),
            target.value.clone(),
            "-w".into(),
            DEFAULT_WORDLIST.into(),
            "--format=json".into(),
            "-o".into(),
            "-".into(),
        ]
    }
}

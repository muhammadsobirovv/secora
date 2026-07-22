use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

const DEFAULT_WORDLIST: &str = "/usr/share/seclists/Discovery/Web-Content/common.txt";

/// `feroxbuster -u <url> -w <wordlist> --json --silent` — recursive
/// content discovery, one JSON object per line.
pub struct Feroxbuster;

#[async_trait]
impl ToolRunner for Feroxbuster {
    fn name(&self) -> &'static str {
        "FEROXBUSTER"
    }
    fn binary(&self) -> &'static str {
        "feroxbuster"
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
            "--json".into(),
            "--silent".into(),
        ]
    }
}

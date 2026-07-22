use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// Default wordlist when the user hasn't set one in Settings > Tools —
/// SecLists' common.txt path on a typical Kali install. Overridable per
/// job via `ToolTarget`'s job metadata in a future iteration (tracked in
/// `queue::Job::tool_options`).
const DEFAULT_WORDLIST: &str = "/usr/share/seclists/Discovery/Web-Content/common.txt";

/// `ffuf -u <url>/FUZZ -w <wordlist> -of json -o - -s` — directory/file
/// fuzzing, JSON report to stdout.
pub struct Ffuf;

#[async_trait]
impl ToolRunner for Ffuf {
    fn name(&self) -> &'static str {
        "FFUF"
    }
    fn binary(&self) -> &'static str {
        "ffuf"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url]
    }
    fn default_timeout_seconds(&self) -> u64 {
        1800
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        let url = target.value.trim_end_matches('/');
        vec![
            "-u".into(),
            format!("{url}/FUZZ"),
            "-w".into(),
            DEFAULT_WORDLIST.into(),
            "-of".into(),
            "json".into(),
            "-o".into(),
            "-".into(),
            "-s".into(),
        ]
    }
}

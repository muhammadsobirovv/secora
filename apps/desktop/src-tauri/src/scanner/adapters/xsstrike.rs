use async_trait::async_trait;
use crate::services::tool_runner::{TargetType, ToolRunner, ToolTarget};

/// `xsstrike -u <url> --skip-dom` — XSS scanner (Python tool, invoked
/// directly if installed as a console-script entry point on PATH).
pub struct Xsstrike;

#[async_trait]
impl ToolRunner for Xsstrike {
    fn name(&self) -> &'static str {
        "XSSTRIKE"
    }
    fn binary(&self) -> &'static str {
        "xsstrike"
    }
    fn supported_target_types(&self) -> &'static [TargetType] {
        &[TargetType::Url]
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String> {
        vec!["-u".into(), target.value.clone(), "--skip-dom".into()]
    }
}

pub mod adapters;

use crate::services::tool_runner::ToolRegistry;
use std::sync::Arc;

/// Registers every recon tool adapter into the shared `ToolRegistry`.
/// Called once from `AppState::new`. Adding a 9th recon tool later means
/// writing one adapter file + one line here — nothing else changes.
pub fn register_all(registry: &mut ToolRegistry) {
    registry.register(Arc::new(adapters::subfinder::Subfinder));
    registry.register(Arc::new(adapters::amass::Amass));
    registry.register(Arc::new(adapters::katana::Katana));
    registry.register(Arc::new(adapters::httpx::Httpx));
    registry.register(Arc::new(adapters::naabu::Naabu));
    registry.register(Arc::new(adapters::dnsx::Dnsx));
    registry.register(Arc::new(adapters::gau::Gau));
    registry.register(Arc::new(adapters::waybackurls::Waybackurls));
}

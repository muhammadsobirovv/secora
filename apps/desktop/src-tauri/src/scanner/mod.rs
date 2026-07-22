pub mod adapters;

use crate::services::tool_runner::ToolRegistry;
use std::sync::Arc;

/// Registers every vulnerability-scanner tool adapter. Same pattern as
/// `recon::register_all` — one shared `ToolRegistry`, `ToolRunner` trait
/// applies uniformly whether the tool discovers assets or finds bugs.
pub fn register_all(registry: &mut ToolRegistry) {
    registry.register(Arc::new(adapters::nuclei::Nuclei));
    registry.register(Arc::new(adapters::ffuf::Ffuf));
    registry.register(Arc::new(adapters::dirsearch::Dirsearch));
    registry.register(Arc::new(adapters::feroxbuster::Feroxbuster));
    registry.register(Arc::new(adapters::nikto::Nikto));
    registry.register(Arc::new(adapters::dalfox::Dalfox));
    registry.register(Arc::new(adapters::sqlmap::Sqlmap));
    registry.register(Arc::new(adapters::xsstrike::Xsstrike));
}

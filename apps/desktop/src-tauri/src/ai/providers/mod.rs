//! Local AI provider abstraction. Mirrors
//! `apps/api/src/modules/ai/providers/ai-provider.interface.ts` one-to-one
//! (same "every feature talks to the trait, never a concrete client"
//! seam) but calls providers directly from the Desktop Agent instead of
//! through the NestJS backend — this is what makes Local AI actually
//! local: no request ever touches Secora's servers unless the user
//! explicitly enables Sync.

pub mod anthropic;
pub mod gemini;
pub mod ollama;
pub mod openai_compatible;
pub mod registry;
pub mod types;

pub use registry::ProviderRegistry;
pub use types::*;

//! Local AI — provider connectors (Ollama, LM Studio, OpenAI, Claude,
//! Gemini, OpenRouter, Groq, DeepSeek, Azure OpenAI), OS-keychain-backed
//! BYOK credential storage, and conversation/message persistence +
//! streaming orchestration for the Desktop Chat UI.

pub mod chat;
pub mod credentials;
pub mod providers;
pub mod tools;

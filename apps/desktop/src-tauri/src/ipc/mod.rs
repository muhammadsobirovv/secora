//! Secure IPC helpers shared by `commands/*` beyond what Tauri's
//! generated `invoke_handler` already provides.
//!
//! The Job Queue (`job://{id}/log`), AI Chat (`ai://{id}/stream`), and
//! Plugin Manager (`plugin://{id}/log`) all emit events using the same
//! `"{scheme}://{id}/{topic}"` naming convention, built ad hoc with
//! `format!` at each call site today. `event_name` centralizes that
//! naming so it can't drift (e.g. a typo turning `job://` into `jobs://`
//! silently breaking the frontend's `listen()` call with no compiler
//! error on either side of the IPC boundary) — every call site should
//! prefer this over its own `format!`.
//!
//! This module doesn't wrap `AppHandle::emit` itself (i.e. it's not a
//! blanket "all IPC events go through one function" chokepoint) because
//! the emit call sites already differ meaningfully in payload shape
//! (`StreamEvent` for chat, `{level, message}` for job logs, `{stderr,
//! line}` for plugin logs) — forcing them through one generic wrapper
//! would just be an extra indirection with no safety benefit. What *is*
//! shared and worth centralizing is the event-name string itself, since
//! that's the part a typo can silently break.

/// Scheme used by a Tauri event name — determines which subsystem emitted
/// it, mirroring the URL-scheme-like convention already in use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventScheme {
    Job,
    Ai,
    Plugin,
}

impl EventScheme {
    fn as_str(&self) -> &'static str {
        match self {
            EventScheme::Job => "job",
            EventScheme::Ai => "ai",
            EventScheme::Plugin => "plugin",
        }
    }
}

/// Builds `"{scheme}://{id}/{topic}"`, e.g.
/// `event_name(EventScheme::Job, job_id, "log")` -> `"job://{job_id}/log"`.
pub fn event_name(scheme: EventScheme, id: &str, topic: &str) -> String {
    format!("{}://{id}/{topic}", scheme.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_expected_event_names() {
        assert_eq!(event_name(EventScheme::Job, "abc-123", "log"), "job://abc-123/log");
        assert_eq!(event_name(EventScheme::Ai, "conv-1", "stream"), "ai://conv-1/stream");
        assert_eq!(event_name(EventScheme::Plugin, "plugin-9", "log"), "plugin://plugin-9/log");
    }
}

//! Plugin Manager — lets users register external tool integrations
//! (Burp Suite, Nmap, OWASP ZAP, Metasploit) and arbitrary custom scripts
//! without a code change or app update. Backed by the `plugins` table
//! (`migrations/0001_init.sql`); execution reuses
//! `services::tool_process::spawn_tool` — the exact same argv-only,
//! never-a-shell-string spawn path the 16 built-in recon/scanner tools
//! use, so a plugin can't do anything more dangerous to the host than a
//! built-in tool can (see `security::mod`'s "Sandboxed process execution"
//! note for the honest limitation: this is process-boundary isolation,
//! not a full OS sandbox).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::services::tool_process::{spawn_tool, SpawnOptions, ToolRunResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PluginKind {
    ToolIntegration,
    CustomScript,
}

/// A plugin's manifest — what `plugins.manifest` (JSON) deserializes to.
/// `args_template` supports two placeholders substituted at run time:
/// `{target}` (the value the plugin is being run against) and
/// `{project}` (the current project's name, for tools that want it in a
/// report/output-file name).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub kind: PluginKind,
    pub description: String,
    /// Binary name (resolved via PATH, same as built-in tools) or an
    /// absolute path the user pointed the plugin at (e.g. Burp Suite's
    /// `burpsuite_pro.jar` run via a `java -jar` wrapper script, or
    /// Metasploit's `msfconsole`).
    pub binary: String,
    pub args_template: Vec<String>,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub manifest: PluginManifest,
    pub installed_at: String,
}

/// Built-in templates offered in the "Add Plugin" UI — not installed by
/// default (no bundled Burp/Nmap/ZAP/Metasploit binaries ship with the
/// app), just pre-filled manifests so the user only has to point
/// `binary` at their local install rather than write the args template
/// from scratch. "Custom Script" is the escape hatch for anything not
/// covered by name.
pub fn builtin_templates() -> Vec<(&'static str, PluginManifest)> {
    vec![
        (
            "Nmap",
            PluginManifest {
                kind: PluginKind::ToolIntegration,
                description: "Network mapper — port scanning and service/version detection.",
                binary: "nmap".to_string(),
                args_template: vec!["-sV".to_string(), "-oN".to_string(), "-".to_string(), "{target}".to_string()],
                timeout_seconds: 900,
            },
        ),
        (
            "Burp Suite (CLI)",
            PluginManifest {
                kind: PluginKind::ToolIntegration,
                description: "Runs a Burp Suite scan via its command-line/REST-driver wrapper script. Point `binary` at your wrapper script — Burp itself doesn't ship a stable bare CLI.".to_string(),
                binary: "burp-cli".to_string(),
                args_template: vec!["--target".to_string(), "{target}".to_string()],
                timeout_seconds: 1800,
            },
        ),
        (
            "OWASP ZAP",
            PluginManifest {
                kind: PluginKind::ToolIntegration,
                description: "OWASP ZAP baseline scan via `zap-baseline.py`.".to_string(),
                binary: "zap-baseline.py".to_string(),
                args_template: vec!["-t".to_string(), "{target}".to_string()],
                timeout_seconds: 1800,
            },
        ),
        (
            "Metasploit",
            PluginManifest {
                kind: PluginKind::ToolIntegration,
                description: "Runs an `msfconsole` resource script against a target. Point `binary` at `msfconsole` and customize `args_template` for your resource file.".to_string(),
                binary: "msfconsole".to_string(),
                args_template: vec!["-q".to_string(), "-x".to_string(), "use auxiliary/scanner/portscan/tcp; set RHOSTS {target}; run; exit".to_string()],
                timeout_seconds: 900,
            },
        ),
        (
            "Custom Script",
            PluginManifest {
                kind: PluginKind::CustomScript,
                description: "Any executable/script — receives the target as its last argument.".to_string(),
                binary: "".to_string(),
                args_template: vec!["{target}".to_string()],
                timeout_seconds: 600,
            },
        ),
    ]
    .into_iter()
    .map(|(name, manifest)| (name, manifest))
    .collect()
}

pub struct PluginRegistry {
    pool: SqlitePool,
}

impl PluginRegistry {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> AppResult<Vec<InstalledPlugin>> {
        let rows: Vec<(String, String, String, bool, String, String)> =
            sqlx::query_as("SELECT id, name, version, enabled, manifest, installed_at FROM plugins ORDER BY installed_at DESC")
                .fetch_all(&self.pool)
                .await?;
        rows.into_iter()
            .map(|(id, name, version, enabled, manifest_json, installed_at)| {
                let manifest: PluginManifest = serde_json::from_str(&manifest_json)
                    .map_err(|e| AppError::new("PLUGIN_MANIFEST_INVALID", format!("Plugin \"{name}\" has an invalid manifest: {e}")))?;
                Ok(InstalledPlugin { id, name, version, enabled, manifest, installed_at })
            })
            .collect()
    }

    pub async fn install(&self, name: &str, version: &str, manifest: PluginManifest) -> AppResult<InstalledPlugin> {
        let id = uuid::Uuid::new_v4().to_string();
        let manifest_json = serde_json::to_string(&manifest).map_err(|e| AppError::new("SERIALIZE_ERROR", e.to_string()))?;
        sqlx::query("INSERT INTO plugins (id, name, version, enabled, manifest) VALUES (?1, ?2, ?3, 1, ?4)")
            .bind(&id)
            .bind(name)
            .bind(version)
            .bind(&manifest_json)
            .execute(&self.pool)
            .await?;
        Ok(InstalledPlugin { id, name: name.to_string(), version: version.to_string(), enabled: true, manifest, installed_at: chrono::Utc::now().to_rfc3339() })
    }

    pub async fn set_enabled(&self, id: &str, enabled: bool) -> AppResult<()> {
        sqlx::query("UPDATE plugins SET enabled = ?1 WHERE id = ?2").bind(enabled).bind(id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn uninstall(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM plugins WHERE id = ?1").bind(id).execute(&self.pool).await?;
        Ok(())
    }

    async fn get(&self, id: &str) -> AppResult<InstalledPlugin> {
        self.list().await?.into_iter().find(|p| p.id == id).ok_or_else(|| AppError::new("PLUGIN_NOT_FOUND", format!("Plugin \"{id}\" not found.")))
    }

    /// Runs an installed, enabled plugin against `target`, streaming
    /// output lines through `on_line` — same shape as every built-in
    /// recon/scanner tool's execution path.
    pub async fn run<F>(&self, id: &str, target: &str, project_name: &str, cancel: CancellationToken, on_line: F) -> AppResult<ToolRunResult>
    where
        F: FnMut(bool, &str) + Send,
    {
        let plugin = self.get(id).await?;
        if !plugin.enabled {
            return Err(AppError::new("PLUGIN_DISABLED", format!("Plugin \"{}\" is disabled.", plugin.name)));
        }
        if plugin.manifest.binary.is_empty() {
            return Err(AppError::new("PLUGIN_NOT_CONFIGURED", format!("Plugin \"{}\" has no binary/script path configured.", plugin.name)));
        }

        let args: Vec<String> = plugin
            .manifest
            .args_template
            .iter()
            .map(|arg| arg.replace("{target}", target).replace("{project}", project_name))
            .collect();

        spawn_tool(
            SpawnOptions {
                command: &plugin.manifest.binary,
                args: &args,
                cwd: None,
                timeout_seconds: plugin.manifest.timeout_seconds,
                cancel,
                kill_grace: std::time::Duration::from_secs(5),
            },
            on_line,
        )
        .await
    }
}

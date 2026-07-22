import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/settings/appearance", label: "Appearance" },
  { to: "/settings/ai", label: "AI Providers" },
  { to: "/settings/voice", label: "Voice" },
  { to: "/settings/sync", label: "Sync" },
  { to: "/settings/tools", label: "Installed Tools" },
  { to: "/settings/plugins", label: "Plugins" },
  { to: "/settings/extension", label: "Browser Extension" },
  { to: "/settings/security", label: "Security & Storage" },
  { to: "/settings/updates", label: "Updates" },
];

export function SettingsLayout() {
  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Settings</h1>
      <div style={{ display: "flex", gap: 24 }}>
        <nav style={{ width: 170, flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={({ isActive }) => ({
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                textDecoration: "none",
                color: isActive ? "var(--color-primary)" : "var(--color-text)",
                background: isActive ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

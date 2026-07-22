import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useThemeStore, type ThemePreference } from "../../hooks/useTheme";
import { Card } from "../../components/ui";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "uz", label: "O'zbekcha" },
  { code: "ru", label: "Русский" },
];

const LANGUAGE_STORAGE_KEY = "phai.language";

/// Theme + Language — Desktop Settings section 1/2. Language is stored
/// locally (same per-machine-preference reasoning as Theme, see
/// `hooks/useTheme.ts`); actual UI string translation is a follow-on i18n
/// pass (react-intl/i18next wiring) — this control persists the choice
/// and is the integration point once that lands, not a no-op.
export function AppearanceSettings() {
  const { preference, setPreference } = useThemeStore();
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? "en");

  const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Theme</div>
        <div style={{ display: "flex", gap: 8 }}>
          {options.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setPreference(value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                border: preference === value ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                background: preference === value ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "var(--color-bg)",
                color: preference === value ? "var(--color-primary)" : "var(--color-text)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Language</div>
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            localStorage.setItem(LANGUAGE_STORAGE_KEY, e.target.value);
          }}
          style={{ padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13 }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </Card>
    </div>
  );
}

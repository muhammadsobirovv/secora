import { Monitor, Moon, Sun } from "lucide-react";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@pentesthub/shared";
import { useThemeStore, type ThemePreference } from "../../hooks/useTheme";
import { useI18nStore } from "../../hooks/useI18n";
import { Card } from "../../components/ui";

/// Theme + Language — Desktop Settings section 1/2. Module 15 — task
/// #348: this is the i18n architecture's reference desktop integration —
/// `useI18nStore` (mirrors `useThemeStore`'s Zustand + localStorage
/// pattern) now backs both the language `<select>` itself and this
/// section's own labels via `t()`. Full-app string extraction beyond this
/// settings section is out of scope for this task (see
/// docs/architecture/i18n.md) — everywhere else in the desktop UI is still
/// hardcoded English, same as it was before this pass.
export function AppearanceSettings() {
  const { preference, setPreference } = useThemeStore();
  const { locale, setLocale, t } = useI18nStore();

  const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t("settings.appearance.themeLight"), icon: Sun },
    { value: "dark", label: t("settings.appearance.themeDark"), icon: Moon },
    { value: "system", label: t("settings.appearance.themeSystem"), icon: Monitor },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t("settings.appearance.theme")}</div>
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
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t("settings.appearance.language")}</div>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          style={{ padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13 }}
        >
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
      </Card>
    </div>
  );
}

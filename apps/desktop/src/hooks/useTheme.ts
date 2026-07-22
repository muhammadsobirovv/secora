import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

interface ThemeState {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (pref: ThemePreference) => void;
}

const STORAGE_KEY = "phai.theme";

function resolveSystem(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDom(resolved: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", resolved);
}

const initialPreference = (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? "system";
const initialResolved = initialPreference === "system" ? resolveSystem() : initialPreference;
applyToDom(initialResolved);

/// Theme store (Desktop Settings > Appearance). Persisted to
/// `localStorage` — this is a real desktop webview, not a claude.ai
/// artifact sandbox, so browser storage APIs are fully supported and are
/// the natural place to remember a UI preference across restarts (the
/// Rust-side `settings` table is reserved for things that should also
/// round-trip through Sync/BYOK-style multi-device config, which theme
/// preference deliberately isn't — it's a per-machine display setting).
export const useThemeStore = create<ThemeState>((set) => ({
  preference: initialPreference,
  resolved: initialResolved,
  setPreference: (pref) => {
    localStorage.setItem(STORAGE_KEY, pref);
    const resolved = pref === "system" ? resolveSystem() : pref;
    applyToDom(resolved);
    set({ preference: pref, resolved });
  },
}));

if (typeof window !== "undefined") {
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { preference, setPreference } = useThemeStore.getState();
    if (preference === "system") {
      setPreference("system"); // re-resolve against the new system value
    }
  });
}

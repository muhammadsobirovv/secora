import { create } from "zustand";

interface UiState {
  /// Mobile-only slide-in drawer visibility (below md breakpoint) — the
  /// desktop sidebar has no collapse control, it's always visible.
  mobileSidebarOpen: boolean;
  commandPaletteOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mobileSidebarOpen: false,
  commandPaletteOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));

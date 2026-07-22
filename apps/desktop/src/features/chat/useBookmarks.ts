import { create } from "zustand";

/// Message-level bookmarks — distinct from conversation-level "Pin"
/// (`ai_conversations.pinned`, a real DB column synced like everything
/// else). Bookmarks flag individual noteworthy *messages* within a long
/// conversation (e.g. "the payload AI suggested for this endpoint") for
/// quick recall, which doesn't map to any existing schema column; rather
/// than add a migration for what's fundamentally a personal,
/// device-local annotation, this is kept in `localStorage` — a real,
/// working feature, just not synced across devices (consistent with
/// Theme preference's storage choice, see `hooks/useTheme.ts`).
const STORAGE_KEY = "phai.chat.bookmarks";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

interface BookmarksState {
  ids: Set<string>;
  isBookmarked: (messageId: string) => boolean;
  toggle: (messageId: string) => void;
}

export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  ids: load(),
  isBookmarked: (messageId) => get().ids.has(messageId),
  toggle: (messageId) => {
    const ids = new Set(get().ids);
    if (ids.has(messageId)) ids.delete(messageId);
    else ids.add(messageId);
    persist(ids);
    set({ ids });
  },
}));

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

const GO_TO: Record<string, string> = {
  p: "/projects",
  t: "/targets",
  n: "/notes",
  e: "/evidence",
  a: "/activity",
  w: "/workspace",
};

/// Linear-style "g then <key>" navigation shortcuts. Ignored while
/// focused in an input/textarea/contenteditable so it doesn't fight
/// normal typing.
export function useKeyboardShortcuts() {
  const router = useRouter();

  React.useEffect(() => {
    let awaitingSecondKey = false;
    let timeout: ReturnType<typeof setTimeout>;

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (awaitingSecondKey) {
        awaitingSecondKey = false;
        clearTimeout(timeout);
        const href = GO_TO[e.key.toLowerCase()];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      if (e.key === "g") {
        awaitingSecondKey = true;
        timeout = setTimeout(() => {
          awaitingSecondKey = false;
        }, 1200);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(timeout);
    };
  }, [router]);
}

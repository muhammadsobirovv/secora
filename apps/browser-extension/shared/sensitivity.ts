// Sensitive-data classification — decides whether a capture must go
// through the explicit confirmation dialog before it's ever sent to the
// Bridge Server. Per the Module 8 spec: "Never automatically upload
// Passwords, Cookies, Tokens, Personal Data. Require explicit
// confirmation." This is the client-side half of that rule (the
// Bridge Server's `handle_capture` also refuses `sensitive: true`
// captures without `confirmed: true` as defense in depth — see
// `apps/desktop/src-tauri/src/bridge/captures.rs` — but *this* is what
// actually decides "is this sensitive" in the first place, since only
// the page context has enough information to tell).

import type { CaptureType } from "./types";

// Capture types that are *always* treated as sensitive, regardless of
// content — cookies and storage can trivially contain session tokens,
// and there's no reliable way to tell "just a UI preference" apart from
// "an auth token" by inspecting the value alone.
const ALWAYS_SENSITIVE: CaptureType[] = ["cookies", "local_storage", "session_storage"];

// Regexes that flag a `request`/`response`/`headers`/`html`/`javascript`
// capture as likely containing a credential even though its capture type
// isn't inherently sensitive — deliberately broad (over-flagging is the
// safe failure mode here; a false positive just means one extra
// confirmation click, a false negative means a secret gets uploaded
// unconfirmed).
const SENSITIVE_PATTERNS: RegExp[] = [
  /authorization:\s*bearer\s+[a-z0-9._-]+/i,
  /\bpassword["']?\s*[:=]\s*["'][^"']+["']/i,
  /\bapi[_-]?key["']?\s*[:=]\s*["'][^"']{8,}["']/i,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, // JWT shape
  /\bsecret["']?\s*[:=]\s*["'][^"']{6,}["']/i,
  /\bset-cookie:/i,
  /\bssn["']?\s*[:=]/i,
  /\bcredit[_-]?card/i,
];

export function isSensitiveCapture(captureType: CaptureType, data: string | undefined): boolean {
  if (ALWAYS_SENSITIVE.includes(captureType)) return true;
  if (!data) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(data));
}

/** Human-readable reason shown in the confirmation dialog. */
export function sensitivityReason(captureType: CaptureType, data: string | undefined): string {
  if (ALWAYS_SENSITIVE.includes(captureType)) {
    return "This capture type (cookies/storage) commonly contains session tokens or other secrets.";
  }
  if (data) {
    for (const re of SENSITIVE_PATTERNS) {
      if (re.test(data)) return "This capture appears to contain a credential, token, or other sensitive value.";
    }
  }
  return "This capture may contain sensitive data.";
}

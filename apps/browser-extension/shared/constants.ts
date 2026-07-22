export const DEFAULT_BRIDGE_PORT = 47821;

export const CONTEXT_MENU_IDS = {
  root: "pentesthub-root",
  saveUrl: "pentesthub-save-url",
  saveDomain: "pentesthub-save-domain",
  saveSubdomain: "pentesthub-save-subdomain",
  saveRequestResponse: "pentesthub-save-request-response",
  saveHeaders: "pentesthub-save-headers",
  saveCookies: "pentesthub-save-cookies",
  saveStorage: "pentesthub-save-storage",
  saveScreenshot: "pentesthub-save-screenshot",
  saveHtml: "pentesthub-save-html",
  saveJavascript: "pentesthub-save-javascript",
  saveForms: "pentesthub-save-forms",
  saveEndpoints: "pentesthub-save-endpoints",
  saveSecurityPosture: "pentesthub-save-security-posture", // CSP + CORS + security headers bundle
  reconRoot: "pentesthub-recon-root",
  runRecon: "pentesthub-run-recon",
  runNuclei: "pentesthub-run-nuclei",
  runDirScan: "pentesthub-run-dirscan",
  runHttpx: "pentesthub-run-httpx",
  runKatana: "pentesthub-run-katana",
  runScreenshot: "pentesthub-run-screenshot",
  runAiAnalysis: "pentesthub-run-ai-analysis",
} as const;

export const KEYBOARD_COMMANDS = {
  openSidePanel: "open-side-panel",
  captureUrl: "capture-url",
  captureScreenshot: "capture-screenshot",
  toggleVoice: "toggle-voice",
} as const;

export const BUG_BOUNTY_PLATFORMS = ["hackerone", "bugcrowd", "intigriti", "yeswehack", "synack"] as const;
export type BugBountyPlatform = (typeof BUG_BOUNTY_PLATFORMS)[number];

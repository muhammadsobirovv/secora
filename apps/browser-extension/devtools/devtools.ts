// Registers the custom "Secora AI" DevTools panel. This file runs in
// the special DevTools page context, which has access to
// `chrome.devtools.*` (not available to any other extension context) but
// none of the regular extension APIs (`chrome.tabs`, `chrome.storage`,
// etc.) — that's why the actual panel UI lives in a separate page
// (`panel.html`/`panel.tsx`) which *does* have normal extension API
// access, loaded into the panel iframe by `chrome.devtools.panels
// .create`.

chrome.devtools.panels.create("Secora AI", "public/icons/32.png", "devtools/panel.html");

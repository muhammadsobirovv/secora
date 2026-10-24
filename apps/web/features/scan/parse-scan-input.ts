export type ParsedScanInput =
  | { type: "DOMAIN"; value: string }
  | { type: "URL"; value: string }
  | { type: "IP_ADDRESS"; value: string };

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function isValidHostname(host: string): boolean {
  if (host.length > 253 || !host.includes(".")) return false;
  const labels = host.split(".");
  // The last label is the TLD: letters only (or punycode), at least 2 long.
  const tld = labels[labels.length - 1] ?? "";
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/.test(tld)) return false;
  return labels.every((label) => HOST_LABEL.test(label));
}

/// Turns what a visitor typed into a scan target: "example.com",
/// "https://www.example.com/", or "example.com/shop" all work. A bare host
/// becomes a DOMAIN target; anything with a path or query stays a URL. Returns
/// null when the input is not a public-looking host.
export function parseScanInput(raw: string): ParsedScanInput | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (IPV4.test(host)) return { type: "IP_ADDRESS", value: host };
  if (!isValidHostname(host)) return null;

  // A port other than the scheme default must survive: a bare DOMAIN target is probed on
  // 80 and 443 only, so "example.com:3000" would silently scan the wrong thing.
  const hasPort = url.port !== "";
  const hasPath = hasPort || url.pathname !== "/" || url.search !== "";
  if (hasPath) return { type: "URL", value: `${url.protocol}//${url.host}${url.pathname}${url.search}` };
  return { type: "DOMAIN", value: host };
}

import { useEffect, useState } from "react";
import { RefreshCw, Plus } from "lucide-react";
import { send } from "../shared/messaging";
import { Button, Card, Badge, Spinner, EmptyState } from "../shared/ui";

interface Snapshot {
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  cors?: Record<string, string>;
  security?: Record<string, string>;
  forms?: string;
  apiEndpoints?: string;
  graphqlEndpoints?: string;
  websocketUrls?: string;
  localStorage?: string;
  sessionStorage?: string;
  technology?: string;
  interestingParameters?: string;
  cookiesUrl?: string;
}

const TABS = ["Headers", "Cookies", "Storage", "Security", "Interesting Parameters", "API Discovery", "Technology", "Potential Findings"] as const;
type Tab = (typeof TABS)[number];

export function PanelApp() {
  const [tab, setTab] = useState<Tab>("Security");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cookies, setCookies] = useState<chrome.cookies.Cookie[] | null>(null);
  const [loading, setLoading] = useState(false);

  const tabId = chrome.devtools.inspectedWindow.tabId;

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await send<Snapshot>({ kind: "getDevToolsSnapshot", tabId });
      setSnapshot(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // Refresh on navigation within the inspected page.
    const listener = () => void refresh();
    chrome.devtools.network.onNavigated.addListener(listener);
    return () => chrome.devtools.network.onNavigated.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const potentialFindings = computeFindings(snapshot);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>Secora AI</div>
        <Button size="sm" variant="outline" loading={loading} onClick={() => void refresh()}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      <div style={{ display: "flex", gap: 2, padding: "6px 10px", borderBottom: "1px solid var(--color-border)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: tab === t ? "var(--color-primary)" : "transparent",
              color: tab === t ? "var(--color-primary-fg)" : "var(--color-text)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {loading && !snapshot ? (
          <Spinner />
        ) : (
          <>
            {tab === "Headers" && <KeyValueTable title="Request Headers" data={snapshot?.requestHeaders} />}
            {tab === "Headers" && <KeyValueTable title="Response Headers" data={snapshot?.responseHeaders} />}
            {tab === "Cookies" && <CookiesTab tabId={tabId} url={snapshot?.cookiesUrl} cookies={cookies} setCookies={setCookies} />}
            {tab === "Storage" && (
              <>
                <JsonBlock title="Local Storage" json={snapshot?.localStorage} />
                <JsonBlock title="Session Storage" json={snapshot?.sessionStorage} />
              </>
            )}
            {tab === "Security" && (
              <>
                <KeyValueTable title="Security Headers" data={snapshot?.security} />
                <KeyValueTable title="CORS" data={snapshot?.cors} />
              </>
            )}
            {tab === "Interesting Parameters" && <JsonBlock title="Interesting Parameters" json={snapshot?.interestingParameters} />}
            {tab === "API Discovery" && (
              <>
                <JsonBlock title="API Endpoints" json={snapshot?.apiEndpoints} />
                <JsonBlock title="GraphQL Endpoints" json={snapshot?.graphqlEndpoints} />
                <JsonBlock title="WebSocket URLs" json={snapshot?.websocketUrls} />
              </>
            )}
            {tab === "Technology" && <JsonBlock title="Detected Technology" json={snapshot?.technology} />}
            {tab === "Potential Findings" && <FindingsTab findings={potentialFindings} />}
          </>
        )}
      </div>
    </div>
  );
}

function KeyValueTable({ title, data }: { title: string; data?: Record<string, string> }) {
  const entries = Object.entries(data ?? {});
  return (
    <Card style={{ padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>None observed yet.</div>
      ) : (
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "3px 6px", borderBottom: "1px solid var(--color-border)", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                <td style={{ padding: "3px 6px", borderBottom: "1px solid var(--color-border)", wordBreak: "break-all" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function JsonBlock({ title, json }: { title: string; json?: string }) {
  return (
    <Card style={{ padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <pre style={{ fontSize: 10.5, whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>{json ?? "—"}</pre>
    </Card>
  );
}

function CookiesTab({ tabId, url, cookies, setCookies }: { tabId: number; url?: string; cookies: chrome.cookies.Cookie[] | null; setCookies: (c: chrome.cookies.Cookie[]) => void }) {
  useEffect(() => {
    if (!url) return;
    void chrome.tabs.get(tabId, (tab) => {
      if (tab?.url) chrome.cookies.getAll({ url: tab.url }, setCookies);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, url]);

  if (!cookies) return <EmptyState title="Loading cookies…" />;
  if (cookies.length === 0) return <EmptyState title="No cookies" description="No cookies observed for this tab's origin." />;

  return (
    <Card style={{ padding: 10 }}>
      <table style={{ width: "100%", fontSize: 10.5, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Name", "Value", "Domain", "Secure", "HttpOnly", "SameSite"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "3px 6px", borderBottom: "1px solid var(--color-border)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cookies.map((c) => (
            <tr key={`${c.name}-${c.domain}`}>
              <td style={{ padding: "3px 6px", fontWeight: 600 }}>{c.name}</td>
              <td style={{ padding: "3px 6px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.value}</td>
              <td style={{ padding: "3px 6px" }}>{c.domain}</td>
              <td style={{ padding: "3px 6px" }}>{c.secure ? "✓" : ""}</td>
              <td style={{ padding: "3px 6px" }}>{c.httpOnly ? "✓" : ""}</td>
              <td style={{ padding: "3px 6px" }}>{c.sameSite}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

interface Finding {
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW" | "INFO";
  description: string;
}

function computeFindings(snapshot: Snapshot | null): Finding[] {
  if (!snapshot?.security) return [];
  const findings: Finding[] = [];
  const sec = snapshot.security;
  if (sec["content-security-policy"] === "(not set)") findings.push({ title: "Missing Content-Security-Policy", severity: "MEDIUM", description: "No CSP header observed — increases XSS blast radius." });
  if (sec["strict-transport-security"] === "(not set)") findings.push({ title: "Missing HSTS", severity: "LOW", description: "Strict-Transport-Security header not set — protocol downgrade / SSL-strip risk." });
  if (sec["x-frame-options"] === "(not set)" && !sec["content-security-policy"]?.includes("frame-ancestors")) {
    findings.push({ title: "Missing clickjacking protection", severity: "MEDIUM", description: "Neither X-Frame-Options nor CSP frame-ancestors is set." });
  }
  if (sec["x-content-type-options"] === "(not set)") findings.push({ title: "Missing X-Content-Type-Options", severity: "LOW", description: "MIME-sniffing protection header not set." });
  const cors = snapshot.cors ?? {};
  if (cors["access-control-allow-origin"] === "*" && cors["access-control-allow-credentials"] === "true") {
    findings.push({ title: "Dangerous CORS configuration", severity: "HIGH", description: "Access-Control-Allow-Origin: * combined with Allow-Credentials: true is invalid per spec but sometimes misconfigured — verify manually." });
  }
  return findings;
}

function FindingsTab({ findings }: { findings: Finding[] }) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const saveFinding = async (f: Finding) => {
    try {
      await send({ kind: "createFinding", payload: { projectId: "", title: f.title, severity: f.severity, description: f.description, source: "BROWSER_EXTENSION" } });
      setSavedIds((prev) => new Set(prev).add(f.title));
    } catch {
      /* handled visually via the button staying actionable */
    }
  };

  if (findings.length === 0) return <EmptyState title="No potential findings" description="Nothing obviously missing from the observed security posture." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {findings.map((f) => (
        <Card key={f.title} style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <Badge tone={f.severity === "HIGH" ? "danger" : f.severity === "MEDIUM" ? "warning" : "default"}>{f.severity}</Badge>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{f.title}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{f.description}</div>
          </div>
          <Button size="sm" variant={savedIds.has(f.title) ? "ghost" : "primary"} disabled={savedIds.has(f.title)} onClick={() => void saveFinding(f)}>
            <Plus size={11} /> {savedIds.has(f.title) ? "Saved" : "Save"}
          </Button>
        </Card>
      ))}
    </div>
  );
}

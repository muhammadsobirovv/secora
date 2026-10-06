"use client";

import { useI18n } from "@/features/i18n/i18n-context";

type NodeKind = "asset" | "critical" | "high";

interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  /// When set, the label is a message key instead of a literal hostname.
  labelKey?: "landing.graph.db";
  kind: NodeKind;
}

const NODES: GraphNode[] = [
  { id: "root", x: 34, y: 78, label: "example.com", kind: "asset" },
  { id: "api", x: 128, y: 38, label: "api.example.com", kind: "asset" },
  { id: "app", x: 128, y: 122, label: "app.example.com", kind: "asset" },
  { id: "sqli", x: 214, y: 38, label: "SQLi", kind: "critical" },
  { id: "jwt", x: 214, y: 122, label: "JWT", kind: "high" },
  { id: "db", x: 298, y: 78, label: "", labelKey: "landing.graph.db", kind: "critical" },
];

/// [from, to, isAiChain] — the AI-built chain is drawn in the "ok" color
/// with a flowing dash; discovery edges are plain.
const EDGES: [string, string, boolean][] = [
  ["root", "api", false],
  ["root", "app", false],
  ["api", "sqli", false],
  ["app", "jwt", false],
  ["sqli", "db", true],
  ["jwt", "db", true],
];

const NODE_COLOR: Record<NodeKind, string> = {
  asset: "var(--primary)",
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
};

/// Static positions, pure SVG + CSS — no layout or animation library. The
/// pulse halos and flowing chain edges are CSS classes in globals.css
/// gated on prefers-reduced-motion, so with reduced motion this is a still
/// diagram carrying the same information.
export function AttackPathGraph() {
  const { t } = useI18n();
  const byId = new Map(NODES.map((n) => [n.id, n]));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
        <span className="uppercase tracking-wider">{t("landing.graph.title")}</span>
        <span className="flex items-center gap-3" aria-hidden="true">
          <Legend color="var(--sev-critical)" label={t("landing.severity.critical")} />
          <Legend color="var(--sev-high)" label={t("landing.severity.high")} />
          <Legend color="var(--sev-ok)" label={t("landing.severity.ai")} />
        </span>
      </div>
      <svg viewBox="0 0 346 156" className="h-auto w-full" aria-hidden="true">
        {EDGES.map(([from, to, chain]) => {
          const a = byId.get(from)!;
          const b = byId.get(to)!;
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={chain ? "var(--sev-ok)" : "var(--border)"}
              strokeWidth={chain ? 1.5 : 1.25}
              strokeDasharray={chain ? "4 6" : undefined}
              className={chain ? "signal-edge" : undefined}
            />
          );
        })}
        {NODES.map((node, i) => {
          const color = NODE_COLOR[node.kind];
          const label = node.labelKey ? t(node.labelKey) : node.label;
          return (
            <g key={node.id}>
              {node.kind !== "asset" && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={7}
                  fill={color}
                  className="signal-pulse"
                  style={{ animationDelay: `${i * 0.35}s` }}
                />
              )}
              <circle cx={node.x} cy={node.y} r={7} fill="var(--card)" stroke={color} strokeWidth={2} />
              <circle cx={node.x} cy={node.y} r={2.5} fill={color} />
              {/* Top-row labels sit above their node, the rest below, so
                  no label crosses an edge. */}
              <text
                x={node.x}
                y={node.y < 60 ? node.y - 14 : node.y + 22}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                fontSize={10}
                // A card-colored halo keeps labels legible where an edge
                // passes behind them (long translations, e.g. the DB label).
                stroke="var(--card)"
                strokeWidth={4}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

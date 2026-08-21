import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  Target,
  FileText,
  ImageIcon,
  Activity,
  Settings,
  Radar,
  Bot,
  Bug,
  FileBarChart,
  ShieldAlert,
  ShieldCheck,
  BookOpen,
  Sparkles,
  Server,
  Library,
  FlaskConical,
  TerminalSquare,
  Workflow,
  Gauge,
  Fingerprint,
  Siren,
  LineChart,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Workspace", href: "/workspace", icon: Building2 },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Targets", href: "/targets", icon: Target },
  { label: "Notes", href: "/notes", icon: FileText },
  { label: "Evidence", href: "/evidence", icon: ImageIcon },
  { label: "Recon", href: "/recon", icon: Radar },
  { label: "Vulnerabilities", href: "/vuln", icon: ShieldAlert },
  { label: "Bug Bounty", href: "/bugbounty", icon: Bug },
  // Module 17 — task #480. Analyst-facing triage view — distinct from
  // Executive Security below (posture-level KPIs for leadership).
  { label: "SOC", href: "/soc", icon: Siren },
  { label: "Executive Security", href: "/executive-security", icon: LineChart },
  // Module 17 — task #476. Landing view over the already-shipped
  // Remediation (#477) and Security Metrics (#479) reads.
  { label: "Exposure Management", href: "/exposure", icon: Gauge },
  // Module 17 — task #467. Indicator management. Points at the more
  // specific /intel/indicators route rather than a bare /intel landing
  // page — no such landing page exists yet (actors/campaigns/reports/
  // techniques catalog browsing is out of scope for this task).
  { label: "Threat Intelligence", href: "/intel/indicators", icon: Fingerprint },
  // Module 16 — task #371. Groups Recon/Vuln/Findings/Notes/Evidence/
  // Terminal/AI-conversation activity produced during one research
  // engagement, without moving or re-owning any of that data.
  { label: "Research Sessions", href: "/research-sessions", icon: FlaskConical },
  // Module 16 — task #388. Safe Terminal: every command here runs through
  // AdHocCommandService's Scope Engine -> Permission Check -> Approval
  // Gate -> ToolRunner chain, never a raw shell exec.
  { label: "Terminal", href: "/terminal", icon: TerminalSquare },
  // Module 16 — task #389. Playbooks: reusable, auditable step graphs.
  { label: "Playbooks", href: "/playbooks", icon: Workflow },
  { label: "AI Assistant", href: "/ai", icon: Bot },
  // Module 11 — AI Security Copilot + Autonomous Multi-Agent System
  // (task #237): Master AI Orchestrator run list/detail + system-wide
  // reference catalog. Distinct from "AI Assistant" above (Module 5's
  // per-project chat) — the Copilot delegates multi-step goals to
  // specialist agents rather than answering one message at a time.
  { label: "Agent Copilot", href: "/agent", icon: Sparkles },
  { label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen },
  { label: "Activity", href: "/activity", icon: Activity },
  // Module 14 — Admin Console infrastructure dashboard (task #314). See
  // ClusterOverviewService's doc comment for why this has no additional
  // role gate beyond normal authentication yet.
  { label: "Admin", href: "/admin", icon: Server },
  // Module 15 — task #350 (documentation portal). Points at the public
  // `/docs` route (a sibling of the `(dashboard)` route group, not gated
  // by DashboardShell's auth check) — reachable whether logged in or not.
  { label: "Documentation", href: "/docs", icon: Library },
];

export const FUTURE_NAV: NavItem[] = [
  { label: "Reports", href: "#", icon: FileBarChart, comingSoon: true },
  { label: "CVE Center", href: "#", icon: ShieldCheck, comingSoon: true },
];

export const SETTINGS_NAV: NavItem = { label: "Settings", href: "/settings/profile", icon: Settings };

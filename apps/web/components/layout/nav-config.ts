import type { LucideIcon } from "lucide-react";
import type { MessageKey } from "@/features/i18n/i18n-context";
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
  CreditCard,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  // Module 21 — i18n coverage pass. Optional so items without a catalog
  // entry (none today) still fall back to `label`. See NavItem component.
  i18nKey?: MessageKey;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, i18nKey: "nav.dashboard" },
  { label: "Workspace", href: "/workspace", icon: Building2, i18nKey: "nav.workspace" },
  { label: "Projects", href: "/projects", icon: FolderKanban, i18nKey: "nav.projects" },
  { label: "Targets", href: "/targets", icon: Target, i18nKey: "nav.targets" },
  { label: "Notes", href: "/notes", icon: FileText, i18nKey: "nav.notes" },
  { label: "Evidence", href: "/evidence", icon: ImageIcon, i18nKey: "nav.evidence" },
  { label: "Recon", href: "/recon", icon: Radar, i18nKey: "nav.recon" },
  { label: "Vulnerabilities", href: "/vuln", icon: ShieldAlert, i18nKey: "nav.vulnerabilities" },
  { label: "Bug Bounty", href: "/bugbounty", icon: Bug, i18nKey: "nav.bugBounty" },
  // Module 17 — task #480. Analyst-facing triage view — distinct from
  // Executive Security below (posture-level KPIs for leadership).
  { label: "SOC", href: "/soc", icon: Siren, i18nKey: "nav.soc" },
  { label: "Executive Security", href: "/executive-security", icon: LineChart, i18nKey: "nav.executiveSecurity" },
  // Module 17 — task #476. Landing view over the already-shipped
  // Remediation (#477) and Security Metrics (#479) reads.
  { label: "Exposure Management", href: "/exposure", icon: Gauge, i18nKey: "nav.exposureManagement" },
  // Module 17 — task #467. Indicator management. Points at the more
  // specific /intel/indicators route rather than a bare /intel landing
  // page — no such landing page exists yet (actors/campaigns/reports/
  // techniques catalog browsing is out of scope for this task).
  { label: "Threat Intelligence", href: "/intel/indicators", icon: Fingerprint, i18nKey: "nav.threatIntelligence" },
  // Module 17 — task #481. Point-in-time incident/threat-intel/posture
  // snapshot reports, composed from already-shipped SOC/Intel/Metrics
  // reads. Supersedes the old FUTURE_NAV "Reports" placeholder below.
  { label: "Security Reports", href: "/security-reports", icon: FileBarChart, i18nKey: "nav.securityReports" },
  // Module 16 — task #371. Groups Recon/Vuln/Findings/Notes/Evidence/
  // Terminal/AI-conversation activity produced during one research
  // engagement, without moving or re-owning any of that data.
  { label: "Research Sessions", href: "/research-sessions", icon: FlaskConical, i18nKey: "nav.researchSessions" },
  // Module 16 — task #388. Safe Terminal: every command here runs through
  // AdHocCommandService's Scope Engine -> Permission Check -> Approval
  // Gate -> ToolRunner chain, never a raw shell exec.
  { label: "Terminal", href: "/terminal", icon: TerminalSquare, i18nKey: "nav.terminal" },
  // Module 16 — task #389. Playbooks: reusable, auditable step graphs.
  { label: "Playbooks", href: "/playbooks", icon: Workflow, i18nKey: "nav.playbooks" },
  { label: "AI Assistant", href: "/ai", icon: Bot, i18nKey: "nav.aiAssistant" },
  // Module 11 — AI Security Copilot + Autonomous Multi-Agent System
  // (task #237): Master AI Orchestrator run list/detail + system-wide
  // reference catalog. Distinct from "AI Assistant" above (Module 5's
  // per-project chat) — the Copilot delegates multi-step goals to
  // specialist agents rather than answering one message at a time.
  { label: "Agent Copilot", href: "/agent", icon: Sparkles, i18nKey: "nav.agentCopilot" },
  { label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen, i18nKey: "nav.knowledgeBase" },
  { label: "Activity", href: "/activity", icon: Activity, i18nKey: "nav.activity" },
  // Module 19 — task #332. Plan comparison/upgrade picker — organization
  // billing management itself lives at /settings/billing.
  { label: "Pricing", href: "/pricing", icon: CreditCard, i18nKey: "nav.pricing" },
  // Module 14 — Admin Console infrastructure dashboard (task #314). See
  // ClusterOverviewService's doc comment for why this has no additional
  // role gate beyond normal authentication yet.
  { label: "Admin", href: "/admin", icon: Server, i18nKey: "nav.admin" },
  // Module 15 — task #350 (documentation portal). Points at the public
  // `/docs` route (a sibling of the `(dashboard)` route group, not gated
  // by DashboardShell's auth check) — reachable whether logged in or not.
  { label: "Documentation", href: "/docs", icon: Library, i18nKey: "nav.documentation" },
];

export const FUTURE_NAV: NavItem[] = [
  { label: "CVE Center", href: "#", icon: ShieldCheck, comingSoon: true, i18nKey: "nav.cveCenter" },
];

export const SETTINGS_NAV: NavItem = {
  label: "Settings",
  href: "/settings/profile",
  icon: Settings,
  i18nKey: "nav.settings",
};

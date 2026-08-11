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
];

export const FUTURE_NAV: NavItem[] = [
  { label: "Reports", href: "#", icon: FileBarChart, comingSoon: true },
  { label: "CVE Center", href: "#", icon: ShieldCheck, comingSoon: true },
];

export const SETTINGS_NAV: NavItem = { label: "Settings", href: "/settings/profile", icon: Settings };

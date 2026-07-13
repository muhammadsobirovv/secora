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
  { label: "Activity", href: "/activity", icon: Activity },
];

export const FUTURE_NAV: NavItem[] = [
  { label: "AI Assistant", href: "#", icon: Bot, comingSoon: true },
  { label: "Bug Bounty", href: "#", icon: Bug, comingSoon: true },
  { label: "Reports", href: "#", icon: FileBarChart, comingSoon: true },
  { label: "CVE Center", href: "#", icon: ShieldCheck, comingSoon: true },
];

export const SETTINGS_NAV: NavItem = { label: "Settings", href: "/settings/profile", icon: Settings };

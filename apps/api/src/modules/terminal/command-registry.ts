import type { ReconTool, VulnScanner } from '../../prisma-types.js';
import { TOOL_TARGET_TYPE_COMPATIBILITY } from '../recon/tool-runners/tool-target-compatibility.js';

export type TerminalCommandKind = 'RECON_TOOL' | 'VULN_SCANNER';
export type TerminalCommandRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TerminalCommandClassification = 'SAFE' | 'REQUIRES_APPROVAL' | 'BLOCKED';

export interface TerminalCommandDefinition {
  name: string;
  description: string;
  kind: TerminalCommandKind;
  tool: ReconTool | VulnScanner;
  allowedTargetTypes: string[];
  requiredPermissions: string[];
  riskLevel: TerminalCommandRiskLevel;
  requiresApproval: boolean;
  timeoutSeconds: number;
  resourceLimits: { maxOutputBytes: number; maxConcurrent: number };
}

/// Module 16 — Command Security (task #388, spec section "COMMAND
/// SECURITY"). THE explicit tool/command registry — every command
/// classification (SAFE / REQUIRES_APPROVAL / BLOCKED) is looked up here
/// by exact tool name, never inferred by string matching against the
/// user-supplied `tool` field. A tool string that has no entry here is
/// treated identically to an explicitly BLOCKED one (see
/// AdHocCommandService.execute): "not on the allowlist" and "on the
/// denylist" both refuse execution before anything runs. This is what
/// prevents "dangerous arbitrary shell execution... merely because user
/// supplied a command string" — there is no code path in this module that
/// takes a string and execs it; every entry here maps to a concrete
/// ToolRunner/ScannerRunner class already reviewed and shipped as part of
/// Modules 3/4.
///
/// Passive/read-only reconnaissance tools are SAFE; anything that sends
/// non-trivial traffic to the target (port scanning, active crawling,
/// vulnerability scanning) requires explicit per-run approval via
/// SecurityApprovalService, matching the same HighRiskOperationType gate
/// Recon/Vuln job creation already uses for equivalent risk.
export const TERMINAL_COMMAND_REGISTRY: Record<string, TerminalCommandDefinition> = {
  // --- Recon tools: passive (SAFE) ---------------------------------------
  SUBFINDER: reconDef('SUBFINDER', 'Passive subdomain enumeration', 'LOW', false, 300),
  ASSETFINDER: reconDef('ASSETFINDER', 'Passive subdomain/asset discovery', 'LOW', false, 300),
  DNSX: reconDef('DNSX', 'DNS resolution and record lookup', 'LOW', false, 120),
  WHOIS: reconDef('WHOIS', 'WHOIS registration lookup', 'LOW', false, 60),
  ASN: reconDef('ASN', 'ASN / IP block lookup', 'LOW', false, 60),
  WAYBACKURLS: reconDef('WAYBACKURLS', 'Historical URL discovery via the Wayback Machine', 'LOW', false, 180),
  GAU: reconDef('GAU', 'Get-all-URLs from passive sources', 'LOW', false, 180),
  AMASS: reconDef('AMASS', 'Passive/active subdomain enumeration', 'MEDIUM', false, 600),

  // --- Recon tools: active (REQUIRES_APPROVAL) ---------------------------
  NMAP: reconDef('NMAP', 'Network port/service scanning', 'HIGH', true, 900),
  NAABU: reconDef('NAABU', 'Fast port scanning', 'HIGH', true, 600),
  HTTPX: reconDef('HTTPX', 'Active HTTP probing', 'MEDIUM', true, 300),
  WHATWEB: reconDef('WHATWEB', 'Active technology fingerprinting', 'MEDIUM', true, 300),
  GOWITNESS: reconDef('GOWITNESS', 'Screenshot capture (renders target pages)', 'MEDIUM', true, 300),
  KATANA: reconDef('KATANA', 'Active web crawling', 'MEDIUM', true, 600),

  // --- Vulnerability scanners: all REQUIRES_APPROVAL ----------------------
  NUCLEI: vulnDef('NUCLEI', 'Template-based vulnerability scanning', 'HIGH', true, 1800),
  FEROXBUSTER: vulnDef('FEROXBUSTER', 'Content/directory discovery scanning', 'MEDIUM', true, 900),
  FFUF: vulnDef('FFUF', 'Fast web fuzzing', 'MEDIUM', true, 900),
  NIKTO: vulnDef('NIKTO', 'Web server vulnerability scanning', 'HIGH', true, 1800),
  DIRSEARCH: vulnDef('DIRSEARCH', 'Directory/file brute-forcing', 'MEDIUM', true, 900),
};

/// Sentinel entries proving the BLOCKED path exists and is exercised —
/// these names never resolve to a runner and are always refused
/// regardless of who asks or what target is supplied. A real deployment
/// would extend this list via GlobalSecurityPolicy.blockedTools for
/// workspace-specific denylisting on top of this fixed platform-level one.
export const TERMINAL_BLOCKED_COMMAND_NAMES = new Set([
  'SHELL',
  'BASH',
  'SH',
  'EXEC',
  'EVAL',
  'CURL_RAW',
  'WGET_RAW',
  'NC',
  'NETCAT',
  'RM',
  'DD',
]);

function reconDef(
  tool: ReconTool,
  description: string,
  riskLevel: TerminalCommandRiskLevel,
  requiresApproval: boolean,
  timeoutSeconds: number,
): TerminalCommandDefinition {
  return {
    name: tool,
    description,
    kind: 'RECON_TOOL',
    tool,
    allowedTargetTypes: TOOL_TARGET_TYPE_COMPATIBILITY[tool] ?? [],
    requiredPermissions: ['project:write'],
    riskLevel,
    requiresApproval,
    timeoutSeconds,
    resourceLimits: { maxOutputBytes: 2_000_000, maxConcurrent: 3 },
  };
}

const VULN_SCANNER_TARGET_TYPES: Record<string, string[]> = {
  NUCLEI: ['URL', 'DOMAIN', 'SUBDOMAIN', 'IP_ADDRESS'],
  FEROXBUSTER: ['URL', 'DOMAIN', 'SUBDOMAIN'],
  FFUF: ['URL', 'DOMAIN', 'SUBDOMAIN'],
  NIKTO: ['URL', 'DOMAIN', 'SUBDOMAIN', 'IP_ADDRESS'],
  DIRSEARCH: ['URL', 'DOMAIN', 'SUBDOMAIN'],
};

function vulnDef(
  scanner: VulnScanner,
  description: string,
  riskLevel: TerminalCommandRiskLevel,
  requiresApproval: boolean,
  timeoutSeconds: number,
): TerminalCommandDefinition {
  return {
    name: scanner,
    description,
    kind: 'VULN_SCANNER',
    tool: scanner,
    allowedTargetTypes: VULN_SCANNER_TARGET_TYPES[scanner] ?? [],
    requiredPermissions: ['project:write'],
    riskLevel,
    requiresApproval,
    timeoutSeconds,
    resourceLimits: { maxOutputBytes: 2_000_000, maxConcurrent: 2 },
  };
}

export function resolveTerminalCommandClassification(
  name: string,
): { definition: TerminalCommandDefinition | null; classification: TerminalCommandClassification } {
  const upper = name.toUpperCase();
  if (TERMINAL_BLOCKED_COMMAND_NAMES.has(upper)) {
    return { definition: null, classification: 'BLOCKED' };
  }
  const definition = TERMINAL_COMMAND_REGISTRY[upper];
  if (!definition) {
    // Not on the allowlist at all — treated the same as BLOCKED: refused
    // before any execution attempt. This is the default-deny posture the
    // spec requires ("must NOT be enabled merely because user supplied a
    // command string").
    return { definition: null, classification: 'BLOCKED' };
  }
  return {
    definition,
    classification: definition.requiresApproval ? 'REQUIRES_APPROVAL' : 'SAFE',
  };
}

export function listTerminalCommandDefinitions(): TerminalCommandDefinition[] {
  return Object.values(TERMINAL_COMMAND_REGISTRY);
}

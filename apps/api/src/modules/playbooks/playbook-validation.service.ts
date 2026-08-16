import { Injectable } from '@nestjs/common';
import type {
  PlaybookGraph,
  PlaybookNode,
  PlaybookValidationIssueDto,
  PlaybookValidationResultDto,
} from '@pentesthub/shared';
import { TERMINAL_COMMAND_REGISTRY } from '../terminal/command-registry.js';

/// Module 16 — Playbook safety validation (task #389, spec section
/// "PLAYBOOK SAFETY"). Runs before a draft can be published, and again
/// (informationally) before dry-run/execution. Never a rubber stamp: a
/// graph with a cycle, a dangling edge, a tool-invoking step naming a tool
/// that isn't in the same registry Terminal uses, or a CONDITION node
/// missing a branch is reported as `valid: false` with concrete issues.
///
/// Tool-invoking step types (RECON / HTTP_PROBE / PORT_SCAN /
/// TECHNOLOGY_DETECTION / VULNERABILITY_SCAN) look up `config.tool`
/// against `TERMINAL_COMMAND_REGISTRY` — the *same* registry Terminal
/// enforces at execution time (see command-registry.ts) — so "tool
/// availability" here is never a separate, possibly-stale allowlist.
@Injectable()
export class PlaybookValidationService {
  validate(graph: PlaybookGraph): PlaybookValidationResultDto {
    const issues: PlaybookValidationIssueDto[] = [];
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    if (graph.nodes.length === 0) {
      issues.push({ severity: 'ERROR', code: 'EMPTY_GRAPH', message: 'A playbook must contain at least one step.' });
      return { valid: false, issues };
    }

    // --- Referential integrity: every edge references a real node --------
    for (const edge of graph.edges) {
      if (!nodeById.has(edge.from)) {
        issues.push({
          severity: 'ERROR',
          code: 'EDGE_UNKNOWN_SOURCE',
          message: `Edge ${edge.id} references unknown source node "${edge.from}".`,
        });
      }
      if (!nodeById.has(edge.to)) {
        issues.push({
          severity: 'ERROR',
          code: 'EDGE_UNKNOWN_TARGET',
          message: `Edge ${edge.id} references unknown target node "${edge.to}".`,
        });
      }
    }

    // --- Duplicate node ids -------------------------------------------------
    if (nodeById.size !== graph.nodes.length) {
      issues.push({ severity: 'ERROR', code: 'DUPLICATE_NODE_ID', message: 'Two or more steps share the same node id.' });
    }

    // --- Cycle detection (DFS, three-colour) --------------------------------
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
      const list = adjacency.get(edge.from) ?? [];
      list.push(edge.to);
      adjacency.set(edge.from, list);
    }
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const node of graph.nodes) color.set(node.id, WHITE);
    let hasCycle = false;
    const visit = (id: string): void => {
      if (hasCycle) return;
      color.set(id, GRAY);
      for (const next of adjacency.get(id) ?? []) {
        const c = color.get(next);
        if (c === GRAY) {
          hasCycle = true;
          return;
        }
        if (c === WHITE) visit(next);
      }
      color.set(id, BLACK);
    };
    for (const node of graph.nodes) {
      if (color.get(node.id) === WHITE) visit(node.id);
    }
    if (hasCycle) {
      issues.push({
        severity: 'ERROR',
        code: 'GRAPH_CYCLE_DETECTED',
        message: 'The step graph contains a cycle — playbooks must be a directed acyclic graph.',
      });
    }

    // --- Per-node-type required-config and tool-availability checks --------
    for (const node of graph.nodes) {
      issues.push(...this.validateNode(node, graph));
    }

    // --- Unreachable nodes (warning only — not a publish blocker) ----------
    const incoming = new Set(graph.edges.map((e) => e.to));
    const unreachable = graph.nodes.filter((n) => !incoming.has(n.id) && n.type !== 'TARGET');
    if (unreachable.length > 1) {
      for (const node of unreachable) {
        issues.push({
          severity: 'WARNING',
          code: 'NODE_UNREACHABLE',
          message: `Step "${node.label}" (${node.id}) has no incoming edge and may never execute.`,
          nodeId: node.id,
        });
      }
    }

    const valid = issues.every((i) => i.severity !== 'ERROR');
    return { valid, issues };
  }

  private validateNode(node: PlaybookNode, graph: PlaybookGraph): PlaybookValidationIssueDto[] {
    const issues: PlaybookValidationIssueDto[] = [];
    const config = node.config ?? {};

    const requireToolInRegistry = (kind: 'RECON_TOOL' | 'VULN_SCANNER') => {
      const tool = typeof config.tool === 'string' ? config.tool.toUpperCase() : null;
      if (!tool) {
        issues.push({
          severity: 'ERROR',
          code: 'MISSING_REQUIRED_INPUT',
          message: `Step "${node.label}" (${node.id}) requires a "tool" in its config.`,
          nodeId: node.id,
        });
        return;
      }
      const definition = TERMINAL_COMMAND_REGISTRY[tool];
      if (!definition) {
        issues.push({
          severity: 'ERROR',
          code: 'TOOL_NOT_AVAILABLE',
          message: `Step "${node.label}" (${node.id}) names tool "${tool}", which is not on the Terminal command allowlist.`,
          nodeId: node.id,
        });
        return;
      }
      if (definition.kind !== kind) {
        issues.push({
          severity: 'ERROR',
          code: 'TOOL_KIND_MISMATCH',
          message: `Step "${node.label}" (${node.id}) is a ${node.type} step but names tool "${tool}", which is a ${definition.kind}.`,
          nodeId: node.id,
        });
      }
    };

    switch (node.type) {
      case 'RECON':
      case 'HTTP_PROBE':
      case 'PORT_SCAN':
      case 'TECHNOLOGY_DETECTION':
        requireToolInRegistry('RECON_TOOL');
        break;
      case 'VULNERABILITY_SCAN':
        requireToolInRegistry('VULN_SCANNER');
        break;
      case 'CONDITION': {
        const cond = config.condition as { field?: unknown; operator?: unknown; value?: unknown } | undefined;
        if (!cond || typeof cond.field !== 'string' || typeof cond.operator !== 'string') {
          issues.push({
            severity: 'ERROR',
            code: 'MISSING_REQUIRED_INPUT',
            message: `CONDITION step "${node.label}" (${node.id}) requires a config.condition { field, operator, value }.`,
            nodeId: node.id,
          });
        }
        const outgoing = graph.edges.filter((e) => e.from === node.id);
        const hasTrue = outgoing.some((e) => e.branch === 'true');
        const hasFalse = outgoing.some((e) => e.branch === 'false');
        if (!hasTrue || !hasFalse) {
          issues.push({
            severity: 'ERROR',
            code: 'CONDITION_MISSING_BRANCH',
            message: `CONDITION step "${node.label}" (${node.id}) must have both a "true" and a "false" outgoing edge.`,
            nodeId: node.id,
          });
        }
        break;
      }
      case 'DELAY': {
        const seconds = config.delaySeconds;
        if (typeof seconds !== 'number' || seconds <= 0) {
          issues.push({
            severity: 'ERROR',
            code: 'MISSING_REQUIRED_INPUT',
            message: `DELAY step "${node.label}" (${node.id}) requires a positive numeric config.delaySeconds.`,
            nodeId: node.id,
          });
        }
        break;
      }
      case 'FINDING_CREATION': {
        if (typeof config.title !== 'string' || !config.title) {
          issues.push({
            severity: 'ERROR',
            code: 'MISSING_REQUIRED_INPUT',
            message: `FINDING_CREATION step "${node.label}" (${node.id}) requires config.title.`,
            nodeId: node.id,
          });
        }
        break;
      }
      case 'WEBHOOK': {
        if (typeof config.url !== 'string' || !config.url) {
          issues.push({
            severity: 'ERROR',
            code: 'MISSING_REQUIRED_INPUT',
            message: `WEBHOOK step "${node.label}" (${node.id}) requires config.url.`,
            nodeId: node.id,
          });
        }
        break;
      }
      default:
        break;
    }

    return issues;
  }
}

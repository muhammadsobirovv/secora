import type { PlaybookGraph } from '@pentesthub/shared';
import { PlaybookValidationService } from './playbook-validation.service.js';

describe('PlaybookValidationService', () => {
  const service = new PlaybookValidationService();

  function linear(nodes: PlaybookGraph['nodes']): PlaybookGraph {
    const edges = nodes.slice(0, -1).map((n, i) => ({ id: `e${i}`, from: n.id, to: nodes[i + 1].id }));
    return { nodes, edges };
  }

  it('rejects an empty graph', () => {
    const result = service.validate({ nodes: [], edges: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'EMPTY_GRAPH')).toBe(true);
  });

  it('accepts a valid linear graph of built-in-style steps', () => {
    const graph = linear([
      { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
      { id: 'n2', type: 'SCOPE_VALIDATION', label: 'Scope', config: {} },
      { id: 'n3', type: 'RECON', label: 'Recon', config: { tool: 'SUBFINDER' } },
      { id: 'n4', type: 'EVIDENCE_COLLECTION', label: 'Evidence', config: { title: 'x' } },
    ]);
    const result = service.validate(graph);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });

  it('rejects a graph containing a cycle', () => {
    const graph: PlaybookGraph = {
      nodes: [
        { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
        { id: 'n2', type: 'RECON', label: 'Recon', config: { tool: 'SUBFINDER' } },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n1' },
      ],
    };
    const result = service.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'GRAPH_CYCLE_DETECTED')).toBe(true);
  });

  it('rejects a step naming a tool that is not on the Terminal command registry (default-deny, same registry Terminal enforces)', () => {
    const graph = linear([
      { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
      { id: 'n2', type: 'RECON', label: 'Recon', config: { tool: 'SHELL' } },
    ]);
    const result = service.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'TOOL_NOT_AVAILABLE')).toBe(true);
  });

  it('rejects a RECON step naming a VULN_SCANNER tool (kind mismatch)', () => {
    const graph = linear([
      { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
      { id: 'n2', type: 'RECON', label: 'Recon', config: { tool: 'NUCLEI' } },
    ]);
    const result = service.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'TOOL_KIND_MISMATCH')).toBe(true);
  });

  it('rejects a CONDITION node missing a true/false branch pair', () => {
    const graph: PlaybookGraph = {
      nodes: [
        { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
        { id: 'n2', type: 'CONDITION', label: 'Cond', config: { condition: { field: 'ASSET_COUNT', operator: 'GT', value: 1 } } },
        { id: 'n3', type: 'DELAY', label: 'Delay', config: { delaySeconds: 5 } },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3', branch: 'true' },
      ],
    };
    const result = service.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'CONDITION_MISSING_BRANCH')).toBe(true);
  });

  it('rejects a DELAY step with a non-positive delaySeconds', () => {
    const graph = linear([
      { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
      { id: 'n2', type: 'DELAY', label: 'Delay', config: { delaySeconds: 0 } },
    ]);
    const result = service.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_REQUIRED_INPUT')).toBe(true);
  });

  it('rejects an edge referencing an unknown node id', () => {
    const graph: PlaybookGraph = {
      nodes: [{ id: 'n1', type: 'TARGET', label: 'Target', config: {} }],
      edges: [{ id: 'e1', from: 'n1', to: 'ghost' }],
    };
    const result = service.validate(graph);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'EDGE_UNKNOWN_TARGET')).toBe(true);
  });
});

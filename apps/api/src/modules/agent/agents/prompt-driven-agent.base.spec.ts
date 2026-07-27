import { describe, expect, it } from '@jest/globals';
import { clampConfidence, extractAgentJson } from './prompt-driven-agent.base.js';

/// Module 11 — Extended tool calling (task #224). extractAgentJson and
/// clampConfidence are the two defensive-parsing primitives every
/// PromptDrivenAgent subclass's final (non-tool-call) response goes
/// through, plus AgentOrchestratorService.planGoal's plan parsing — a
/// model that ignores "respond with ONLY JSON" or omits/mangles a
/// confidence field must degrade gracefully (Reasoning Engine's "Error
/// recovery" goal), never throw and fail the whole agent task.
describe('extractAgentJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractAgentJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it('extracts JSON from a ```json fenced code block', () => {
    const raw = 'Here is the result:\n```json\n{"a": 1, "b": "two"}\n```\nDone.';
    expect(extractAgentJson<{ a: number; b: string }>(raw)).toEqual({ a: 1, b: 'two' });
  });

  it('extracts JSON from a fenced block with no language tag', () => {
    const raw = '```\n{"ok": true}\n```';
    expect(extractAgentJson<{ ok: boolean }>(raw)).toEqual({ ok: true });
  });

  it('returns null for unparseable text instead of throwing', () => {
    expect(extractAgentJson('this is not json at all')).toBeNull();
  });

  it('returns null for malformed JSON inside a fenced block', () => {
    const raw = '```json\n{"a": 1,}\n```';
    expect(extractAgentJson(raw)).toBeNull();
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(extractAgentJson('   \n{"a": 1}\n   ')).toEqual({ a: 1 });
  });
});

describe('clampConfidence', () => {
  it('passes through an in-range number unchanged', () => {
    expect(clampConfidence(0.73)).toBe(0.73);
  });

  it('clamps a value above 1 down to 1', () => {
    expect(clampConfidence(1.5)).toBe(1);
  });

  it('clamps a negative value up to 0', () => {
    expect(clampConfidence(-0.3)).toBe(0);
  });

  it('coerces a numeric string', () => {
    expect(clampConfidence('0.4')).toBe(0.4);
  });

  it('degrades to the neutral default 0.5 for NaN/non-numeric input, never 0 or 1', () => {
    expect(clampConfidence('not a number')).toBe(0.5);
    expect(clampConfidence(undefined)).toBe(0.5);
    expect(clampConfidence(null)).toBe(0.5);
    expect(clampConfidence({})).toBe(0.5);
  });

  it('degrades to 0.5 for Infinity/-Infinity rather than clamping to 1/0', () => {
    expect(clampConfidence(Infinity)).toBe(0.5);
    expect(clampConfidence(-Infinity)).toBe(0.5);
  });
});

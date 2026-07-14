import { describe, expect, it } from '@jest/globals';
import { findToolCall, mightContainToolCall } from './tool-call-parser.util.js';

describe('tool-call-parser.util', () => {
  describe('mightContainToolCall', () => {
    it('is false for plain prose', () => {
      expect(
        mightContainToolCall('Here are the top findings for this project.'),
      ).toBe(false);
    });

    it('is true as soon as the opening tag appears, even mid-stream', () => {
      expect(
        mightContainToolCall('Let me check that. <tool_call name="search_find'),
      ).toBe(true);
    });
  });

  describe('findToolCall', () => {
    it('returns null when no tool call tag is present', () => {
      expect(findToolCall('Just a normal assistant reply.')).toBeNull();
    });

    it('returns null while the closing tag has not arrived yet', () => {
      expect(
        findToolCall(
          '<tool_call name="search_findings">{"severity":"CRITICAL"',
        ),
      ).toBeNull();
    });

    it('parses name and JSON input from a complete tag', () => {
      const text =
        'Sure, let me look. <tool_call name="search_findings">{"severity":"CRITICAL","limit":5}</tool_call>';
      const result = findToolCall(text);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('search_findings');
      expect(result?.input).toEqual({ severity: 'CRITICAL', limit: 5 });
      expect(result?.raw).toBe(
        '<tool_call name="search_findings">{"severity":"CRITICAL","limit":5}</tool_call>',
      );
    });

    it('defaults to an empty object body', () => {
      const result = findToolCall(
        '<tool_call name="search_projects"></tool_call>',
      );
      expect(result?.input).toEqual({});
    });

    it('degrades to an empty input on malformed JSON rather than throwing', () => {
      const result = findToolCall(
        '<tool_call name="search_notes">{not valid json</tool_call>',
      );
      expect(result?.name).toBe('search_notes');
      expect(result?.input).toEqual({});
    });

    it('ignores a JSON array body (must be an object)', () => {
      const result = findToolCall(
        '<tool_call name="search_notes">[1,2,3]</tool_call>',
      );
      expect(result?.input).toEqual({});
    });

    it('only matches the first complete tag when several are present', () => {
      const text =
        '<tool_call name="search_findings">{"a":1}</tool_call> and <tool_call name="search_notes">{"b":2}</tool_call>';
      const result = findToolCall(text);
      expect(result?.name).toBe('search_findings');
      expect(result?.input).toEqual({ a: 1 });
    });

    it('is case-insensitive on the tag itself', () => {
      const result = findToolCall(
        '<TOOL_CALL name="search_notes">{}</TOOL_CALL>',
      );
      expect(result?.name).toBe('search_notes');
    });
  });
});

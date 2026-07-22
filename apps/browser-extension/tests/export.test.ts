import { describe, it, expect } from "vitest";
import { toMarkdown, toJson, toHar } from "../shared/export";
import type { ExportableCapture } from "../shared/export";

const sample: ExportableCapture[] = [
  { id: "1", type: "url", pageUrl: "https://example.com", savedAs: "target", at: "2026-07-20T00:00:00Z", data: "https://example.com" },
  { id: "2", type: "headers", pageUrl: "https://example.com/api", savedAs: "note", at: "2026-07-20T00:01:00Z", data: '{"x-frame-options":"DENY"}' },
];

describe("export formats", () => {
  it("toMarkdown includes every capture's type and URL", () => {
    const md = toMarkdown(sample);
    expect(md).toContain("url — https://example.com");
    expect(md).toContain("headers — https://example.com/api");
  });

  it("toJson round-trips the capture list", () => {
    const parsed = JSON.parse(toJson(sample));
    expect(parsed.count).toBe(2);
    expect(parsed.captures).toHaveLength(2);
    expect(parsed.captures[0].id).toBe("1");
  });

  it("toHar produces a valid-shaped HAR 1.2 log", () => {
    const har = JSON.parse(toHar([{ pageUrl: "https://example.com/api", method: "GET", status: 200, responseHeaders: { "content-type": "application/json" }, responseBody: "{}" }]));
    expect(har.log.version).toBe("1.2");
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].request.url).toBe("https://example.com/api");
    expect(har.log.entries[0].response.status).toBe(200);
  });
});

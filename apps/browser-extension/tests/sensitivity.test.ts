import { describe, it, expect } from "vitest";
import { isSensitiveCapture, sensitivityReason } from "../shared/sensitivity";

describe("sensitivity classification", () => {
  it("always flags cookies/storage capture types regardless of content", () => {
    expect(isSensitiveCapture("cookies", undefined)).toBe(true);
    expect(isSensitiveCapture("local_storage", "")).toBe(true);
    expect(isSensitiveCapture("session_storage", "totally boring")).toBe(true);
  });

  it("does not flag url/domain/html by default", () => {
    expect(isSensitiveCapture("url", "https://example.com")).toBe(false);
    expect(isSensitiveCapture("domain", "example.com")).toBe(false);
    expect(isSensitiveCapture("html", "<html><body>hello</body></html>")).toBe(false);
  });

  it("flags a bearer token in headers/request text", () => {
    expect(isSensitiveCapture("headers", "Authorization: Bearer abc123.def456.ghi789")).toBe(true);
  });

  it("flags a JWT-shaped string anywhere in the content", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(isSensitiveCapture("response", `{"token":"${jwt}"}`)).toBe(true);
  });

  it("flags an inline password field", () => {
    expect(isSensitiveCapture("javascript", 'const config = { password: "hunter2" };')).toBe(true);
  });

  it("does not flag ordinary JSON with no secret-shaped values", () => {
    expect(isSensitiveCapture("api_endpoints", '{"relative":["/api/users","/api/products"]}')).toBe(false);
  });

  it("gives a human-readable reason for both always-sensitive and pattern-matched cases", () => {
    expect(sensitivityReason("cookies", undefined)).toMatch(/session tokens|secrets/i);
    expect(sensitivityReason("headers", "Authorization: Bearer xyz")).toMatch(/credential|token/i);
  });
});

import { describe, it, expect } from "vitest";
import { BUILTIN_PAYLOADS, PAYLOAD_CATEGORIES, payloadsByCategory } from "../shared/payloads";

describe("builtin payload library", () => {
  it("every payload belongs to a declared category", () => {
    for (const payload of BUILTIN_PAYLOADS) {
      expect(PAYLOAD_CATEGORIES).toContain(payload.category);
    }
  });

  it("has unique ids", () => {
    const ids = BUILTIN_PAYLOADS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every required category from the Module 8 spec at least once", () => {
    for (const category of PAYLOAD_CATEGORIES) {
      expect(payloadsByCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("every payload has a non-empty example", () => {
    for (const payload of BUILTIN_PAYLOADS) {
      expect(payload.example.length).toBeGreaterThan(0);
    }
  });
});

// Run with:  node --test features/scan/parse-scan-input.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScanInput } from "./parse-scan-input.ts";

test("a bare domain stays a DOMAIN target", () => {
  assert.deepEqual(parseScanInput("example.com"), { type: "DOMAIN", value: "example.com" });
  assert.deepEqual(parseScanInput("https://www.Example.com/"), { type: "DOMAIN", value: "www.example.com" });
});

test("an explicit port is kept, so the right service is scanned", () => {
  assert.deepEqual(parseScanInput("http://juice.lab.test:3000/"), { type: "URL", value: "http://juice.lab.test:3000/" });
  assert.deepEqual(parseScanInput("example.com:8443"), { type: "URL", value: "https://example.com:8443/" });
});

test("the default port of the scheme is not a port", () => {
  assert.deepEqual(parseScanInput("https://example.com:443/"), { type: "DOMAIN", value: "example.com" });
  assert.deepEqual(parseScanInput("http://example.com:80"), { type: "DOMAIN", value: "example.com" });
});

test("a path or query makes it a URL", () => {
  assert.deepEqual(parseScanInput("example.com/shop"), { type: "URL", value: "https://example.com/shop" });
});

test("IP addresses are recognised, junk and credentials are refused", () => {
  assert.deepEqual(parseScanInput("203.0.113.7"), { type: "IP_ADDRESS", value: "203.0.113.7" });
  assert.equal(parseScanInput("not a host"), null);
  assert.equal(parseScanInput("https://user:pw@example.com/"), null);
  assert.equal(parseScanInput("ftp://example.com"), null);
  assert.equal(parseScanInput("localhost"), null);
});

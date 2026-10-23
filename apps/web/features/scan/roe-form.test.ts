// Run with:  node --test features/scan/roe-form.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  defaultWindow,
  evidenceProblem,
  parseAssetRow,
  parseAssetRows,
  toLocalInput,
  toRequestBody,
  windowProblem,
  type RoeFormValues,
} from "./roe-form.ts";

const NOW = new Date(2026, 9, 23, 10, 0, 0);

test("a domain row becomes a DOMAIN asset, the wildcard flag only applies to it", () => {
  assert.deepEqual(parseAssetRow({ text: " Acme.Example ", wildcard: false }), {
    ok: true,
    asset: { type: "DOMAIN", value: "acme.example", wildcard: false },
  });
  assert.deepEqual(parseAssetRow({ text: "acme.example", wildcard: true }), {
    ok: true,
    asset: { type: "DOMAIN", value: "acme.example", wildcard: true },
  });
  assert.deepEqual(parseAssetRow({ text: "*.acme.example", wildcard: false }), {
    ok: true,
    asset: { type: "DOMAIN", value: "acme.example", wildcard: true },
  });
});

test("a URL row stays a URL and never carries the wildcard", () => {
  assert.deepEqual(parseAssetRow({ text: "https://app.acme.example/login", wildcard: true }), {
    ok: true,
    asset: { type: "URL", value: "https://app.acme.example/login", wildcard: false },
  });
});

test("IP addresses and ranges are refused with their own error", () => {
  for (const text of ["203.0.113.7", "http://203.0.113.7/", "https://203.0.113.7:8443/x"]) {
    assert.deepEqual(parseAssetRow({ text, wildcard: false }), { ok: false, error: "ip" }, text);
  }
  for (const text of ["203.0.113.0/24", "2001:db8::1", "not a host", "localhost"]) {
    assert.equal(parseAssetRow({ text, wildcard: false }).ok, false, text);
  }
});

test("rows are checked together: duplicates collapse, the empty trailing row is ignored", () => {
  const { assets, errors } = parseAssetRows([
    { text: "acme.example", wildcard: false },
    { text: "ACME.example", wildcard: false },
    { text: "", wildcard: false },
  ]);
  assert.equal(assets.length, 1);
  assert.equal(errors.size, 0);
});

test("an all-empty form reports the first row", () => {
  const { assets, errors } = parseAssetRows([{ text: "", wildcard: false }]);
  assert.equal(assets.length, 0);
  assert.equal(errors.get(0), "empty");
});

test("a bad row is reported by its index", () => {
  const { errors } = parseAssetRows([
    { text: "acme.example", wildcard: false },
    { text: "203.0.113.7", wildcard: false },
  ]);
  assert.equal(errors.get(1), "ip");
  assert.equal(errors.has(0), false);
});

test("the default window starts now and lasts 14 days, in local time", () => {
  const { start, end } = defaultWindow(NOW);
  assert.equal(start, toLocalInput(NOW));
  assert.equal(windowProblem(start, end, NOW), null);
  assert.equal(new Date(end).getTime() - new Date(start).getTime(), 14 * 86_400_000);
});

test("window problems", () => {
  const start = toLocalInput(NOW);
  assert.equal(windowProblem("", start, NOW), "invalid");
  assert.equal(windowProblem(start, start, NOW), "order");
  assert.equal(windowProblem("2026-01-01T00:00", "2026-01-02T00:00", NOW), "past");
  assert.equal(windowProblem(start, toLocalInput(new Date(NOW.getTime() + 91 * 86_400_000)), NOW), "tooLong");
  assert.equal(windowProblem(start, toLocalInput(new Date(NOW.getTime() + 90 * 86_400_000)), NOW), null);
});

const valid = (): RoeFormValues => ({
  clientName: "Acme Ltd",
  clientEmail: "ciso@acme.example",
  rows: [{ text: "acme.example", wildcard: false }],
  ...(() => {
    const w = defaultWindow(NOW);
    return { windowStart: w.start, windowEnd: w.end };
  })(),
  signatoryName: "Sam Signer",
  signatoryRole: "CISO",
  responsibilityAccepted: true,
});

test("a complete form produces the request body", () => {
  const body = toRequestBody(valid(), NOW);
  assert.ok(body);
  assert.equal(body.clientEmail, "ciso@acme.example");
  assert.deepEqual(body.assets, [{ type: "DOMAIN", value: "acme.example", wildcard: false }]);
  assert.equal(body.responsibilityAccepted, true);
  assert.ok(body.windowStart.endsWith("Z") && body.windowEnd.endsWith("Z"));
});

test("any missing piece blocks the request", () => {
  const cases: Partial<RoeFormValues>[] = [
    { clientName: " " },
    { clientEmail: "nope" },
    { rows: [{ text: "203.0.113.7", wildcard: false }] },
    { signatoryName: "" },
    { signatoryRole: "" },
    { responsibilityAccepted: false },
    { windowEnd: "" },
  ];
  for (const override of cases) {
    assert.equal(toRequestBody({ ...valid(), ...override }, NOW), null, JSON.stringify(override));
  }
});

test("evidence: type and size are checked before upload", () => {
  assert.equal(evidenceProblem({ name: "signed.PDF", size: 1000 }), null);
  assert.equal(evidenceProblem({ name: "mail.eml", size: 1000 }), null);
  assert.equal(evidenceProblem({ name: "x.svg", size: 1000 }), "type");
  assert.equal(evidenceProblem({ name: "x.html", size: 1000 }), "type");
  assert.equal(evidenceProblem({ name: "x.pdf", size: 0 }), "empty");
  assert.equal(evidenceProblem({ name: "x.pdf", size: 11 * 1024 * 1024 }), "tooLarge");
});

test("the 'send to your admin' message exists in all three languages with the exact record", () => {
  for (const locale of ["en", "uz", "ru"]) {
    const messages = JSON.parse(readFileSync(new URL(`../i18n/messages/${locale}.json`, import.meta.url), "utf8")) as Record<string, string>;
    const message = messages["ownership.adminMessage"];
    assert.ok(message, `${locale} has the message`);
    for (const placeholder of ["{host}", "{name}", "{value}"]) {
      assert.ok(message.includes(placeholder), `${locale} uses ${placeholder}`);
    }
  }
});

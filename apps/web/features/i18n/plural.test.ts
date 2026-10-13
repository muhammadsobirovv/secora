// Unit tests for plural category selection. Run with:
//   node --test features/i18n/plural.test.ts
// (Node 24 strips the types natively; this file has no path aliases.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { pluralSuffix, resolvePluralKey } from "./plural.ts";

test("ru: one / few / many follow the Russian rules", () => {
  const cases: [number, string][] = [
    [1, "one"],
    [2, "few"],
    [5, "many"],
    [11, "many"],
    [21, "one"],
    [22, "few"],
    [25, "many"],
    [101, "one"],
    [0, "many"],
    [3, "few"],
    [14, "many"],
    [111, "many"],
  ];
  for (const [count, expected] of cases) {
    assert.equal(pluralSuffix("ru", count), expected, `ru count ${count}`);
  }
});

test("uz and en: one for 1, other for everything else", () => {
  for (const locale of ["uz", "en"] as const) {
    assert.equal(pluralSuffix(locale, 1), "one", `${locale} 1`);
    assert.equal(pluralSuffix(locale, 2), "other", `${locale} 2`);
    assert.equal(pluralSuffix(locale, 0), "other", `${locale} 0`);
  }
});

test("resolvePluralKey uses the chosen form when the catalog has it", () => {
  const catalog = new Set(["g_one", "g_few", "g_many", "g_other"]);
  assert.equal(resolvePluralKey("ru", "g", 2, (k) => catalog.has(k)), "g_few");
});

test("resolvePluralKey falls back to _other when the form is missing", () => {
  const catalog = new Set(["g_one", "g_other"]);
  assert.equal(resolvePluralKey("ru", "g", 5, (k) => catalog.has(k)), "g_other");
});

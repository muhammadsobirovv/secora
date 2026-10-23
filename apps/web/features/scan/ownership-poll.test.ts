// Run with:  node --test features/scan/ownership-poll.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OWNERSHIP_POLL_INTERVAL_MS,
  OWNERSHIP_POLL_MAX_MS,
  pollDecision,
  secondsToNextCheck,
} from "./ownership-poll.ts";

test("the interval is 30 seconds and the limit 30 minutes", () => {
  assert.equal(OWNERSHIP_POLL_INTERVAL_MS, 30_000);
  assert.equal(OWNERSHIP_POLL_MAX_MS, 30 * 60_000);
});

test("never checks sooner than 30 seconds after the previous check", () => {
  for (const since of [0, 1_000, 15_000, 29_999]) {
    assert.equal(pollDecision({ elapsedMs: 60_000, sinceLastCheckMs: since, busy: false }), "wait");
  }
  assert.equal(pollDecision({ elapsedMs: 60_000, sinceLastCheckMs: 30_000, busy: false }), "check");
  assert.equal(pollDecision({ elapsedMs: 60_000, sinceLastCheckMs: 90_000, busy: false }), "check");
});

test("does not start a check while one is running", () => {
  assert.equal(pollDecision({ elapsedMs: 60_000, sinceLastCheckMs: 120_000, busy: true }), "wait");
});

test("stops after 30 minutes, whatever else is true", () => {
  assert.equal(pollDecision({ elapsedMs: OWNERSHIP_POLL_MAX_MS - 1, sinceLastCheckMs: 31_000, busy: false }), "check");
  assert.equal(pollDecision({ elapsedMs: OWNERSHIP_POLL_MAX_MS, sinceLastCheckMs: 31_000, busy: false }), "stop");
  assert.equal(pollDecision({ elapsedMs: OWNERSHIP_POLL_MAX_MS + 5, sinceLastCheckMs: 0, busy: true }), "stop");
});

test("counts down to the next check", () => {
  assert.equal(secondsToNextCheck(0), 30);
  assert.equal(secondsToNextCheck(10_500), 20);
  assert.equal(secondsToNextCheck(30_000), 0);
  assert.equal(secondsToNextCheck(45_000), 0);
});

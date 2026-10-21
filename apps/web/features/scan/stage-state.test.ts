// Run with:  node --test features/scan/stage-state.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSteps } from "./stage-state.ts";

const log = (message: string) => ({ message });
const states = (steps: ReturnType<typeof deriveSteps>) => steps.map((s) => `${s.id}:${s.state}`);

test("a running job with no markers yet only shows verify as done", () => {
  assert.deepEqual(states(deriveSteps([], "RUNNING")), [
    "verify:done",
    "recon:pending",
    "scan:pending",
    "report:pending",
  ]);
});

test("recon in progress, then scan in progress", () => {
  const recon = deriveSteps([log("$ httpx -u x"), log("[stage] recon start")], "RUNNING");
  assert.deepEqual(states(recon), ["verify:done", "recon:active", "scan:pending", "report:pending"]);

  const scan = deriveSteps(
    [log("[stage] recon start"), log("[stage] recon done"), log("[stage] scan start")],
    "RUNNING",
  );
  assert.deepEqual(states(scan), ["verify:done", "recon:done", "scan:active", "report:pending"]);
});

test("a completed pipeline run is done end to end", () => {
  const steps = deriveSteps(
    [
      log("[stage] recon start"),
      log("[stage] recon done"),
      log("[stage] scan start"),
      log("[stage] scan done"),
    ],
    "COMPLETED",
  );
  assert.deepEqual(states(steps), ["verify:done", "recon:done", "scan:done", "report:done"]);
});

test("nothing live: recon and scan are skipped, the job still completes", () => {
  const steps = deriveSteps([log("[stage] recon start"), log("[stage] recon skipped"), log("[stage] scan skipped")], "COMPLETED");
  assert.deepEqual(states(steps), ["verify:done", "recon:skipped", "scan:skipped", "report:done"]);
});

test("a failed job marks the stage that was running as failed", () => {
  const steps = deriveSteps([log("[stage] recon start"), log("[stage] recon done"), log("[stage] scan start")], "FAILED");
  assert.deepEqual(states(steps), ["verify:done", "recon:done", "scan:failed", "report:pending"]);
});

test("a plain job without a pipeline profile is shown sensibly when it completes", () => {
  assert.deepEqual(states(deriveSteps([log("$ nuclei -u x")], "COMPLETED")), [
    "verify:done",
    "recon:skipped",
    "scan:done",
    "report:done",
  ]);
});

test("unrelated log lines are ignored", () => {
  const steps = deriveSteps([log("FOUND [high] something"), log("[INF] stage recon start")], "RUNNING");
  assert.deepEqual(states(steps), ["verify:done", "recon:pending", "scan:pending", "report:pending"]);
});

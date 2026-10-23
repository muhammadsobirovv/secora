// Run with:  node --test features/scan/stage-state.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSteps, profileOf } from "./stage-state.ts";

const log = (message: string) => ({ message });
const states = (steps: ReturnType<typeof deriveSteps>) => steps.map((s) => `${s.id}:${s.state}`);

test("a running job with no markers yet only shows verify as done", () => {
  assert.deepEqual(states(deriveSteps([], "RUNNING")), [
    "ownership:done",
    "recon:pending",
    "scan:pending",
    "report:pending",
  ]);
});

test("recon in progress, then scan in progress", () => {
  const recon = deriveSteps([log("$ httpx -u x"), log("[stage] recon start")], "RUNNING");
  assert.deepEqual(states(recon), ["ownership:done", "recon:active", "scan:pending", "report:pending"]);

  const scan = deriveSteps(
    [log("[stage] recon start"), log("[stage] recon done"), log("[stage] scan start")],
    "RUNNING",
  );
  assert.deepEqual(states(scan), ["ownership:done", "recon:done", "scan:active", "report:pending"]);
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
  assert.deepEqual(states(steps), ["ownership:done", "recon:done", "scan:done", "report:done"]);
});

test("nothing live: recon and scan are skipped, the job still completes", () => {
  const steps = deriveSteps([log("[stage] recon start"), log("[stage] recon skipped"), log("[stage] scan skipped")], "COMPLETED");
  assert.deepEqual(states(steps), ["ownership:done", "recon:skipped", "scan:skipped", "report:done"]);
});

test("a failed job marks the stage that was running as failed", () => {
  const steps = deriveSteps([log("[stage] recon start"), log("[stage] recon done"), log("[stage] scan start")], "FAILED");
  assert.deepEqual(states(steps), ["ownership:done", "recon:done", "scan:failed", "report:pending"]);
});

test("a plain job without a pipeline profile is shown sensibly when it completes", () => {
  assert.deepEqual(states(deriveSteps([log("$ nuclei -u x")], "COMPLETED")), [
    "ownership:done",
    "recon:skipped",
    "scan:done",
    "report:done",
  ]);
});

test("unrelated log lines are ignored", () => {
  const steps = deriveSteps([log("FOUND [high] something"), log("[INF] stage recon start")], "RUNNING");
  assert.deepEqual(states(steps), ["ownership:done", "recon:pending", "scan:pending", "report:pending"]);
});

test("QUICK shows only its one stage", () => {
  assert.deepEqual(states(deriveSteps([], "RUNNING", "QUICK")), ["ownership:done", "checks:pending", "verify:pending", "report:pending"]);
  const done = deriveSteps(
    [log("[stage] checks start"), log("[stage] checks done"), log("[stage] verify start"), log("[stage] verify skipped")],
    "COMPLETED",
    "QUICK",
  );
  assert.deepEqual(states(done), ["ownership:done", "checks:done", "verify:skipped", "report:done"]);
});

test("DEEP shows all nine stages in order", () => {
  const steps = deriveSteps([log("[stage] recon start")], "RUNNING", "DEEP");
  assert.deepEqual(
    steps.map((s) => s.id),
    ["ownership", "recon", "subdomains", "resolve", "ports", "checks", "crawl", "scan", "content", "xss", "verify", "report"],
  );
  assert.equal(steps[1]?.state, "active");
  assert.equal(steps[2]?.state, "pending");
});

test("a failed stage stays failed while the scan carries on and completes", () => {
  const steps = deriveSteps(
    [
      log("[stage] recon start"),
      log("[stage] recon done"),
      log("[stage] checks start"),
      log("[stage] checks done"),
      log("[stage] crawl start"),
      log("[stage] crawl failed - partial: the crawl reached its time limit"),
      log("[stage] scan start"),
      log("[stage] scan done"),
    ],
    "COMPLETED",
    "STANDARD",
  );
  assert.deepEqual(states(steps), [
    "ownership:done",
    "recon:done",
    "checks:done",
    "crawl:failed",
    "scan:done",
    "verify:skipped",
    "report:done",
  ]);
});

test("a stage the worker never reached is skipped once the job completed, pending while it runs", () => {
  const logs = [log("[stage] recon start"), log("[stage] recon done")];
  assert.equal(deriveSteps(logs, "RUNNING", "STANDARD")[2]?.state, "pending");
  assert.equal(deriveSteps(logs, "COMPLETED", "STANDARD")[2]?.state, "skipped");
});

test("profileOf reads the profile from a job config", () => {
  assert.equal(profileOf({ profile: "DEEP", deepConfirmed: true }), "DEEP");
  assert.equal(profileOf({ profile: "nonsense" }), null);
  assert.equal(profileOf(null), null);
  assert.equal(profileOf(undefined), null);
});

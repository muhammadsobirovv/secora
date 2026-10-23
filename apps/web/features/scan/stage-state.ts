import {
  PIPELINE_STAGES,
  PROFILE_STAGES,
  STAGE_MARKER_PATTERN,
  type PipelineStage,
  type PipelineStageState,
  type VulnScanJobStatus,
  type VulnScanProfile,
} from "@pentesthub/shared";

/// "ownership" is the proof-of-ownership step every job has already passed;
/// it is not the pipeline's "verify" (re-check) stage.
export type StepId = "ownership" | PipelineStage | "report";
export type StepState = "pending" | "active" | "done" | "skipped" | "failed";
export interface StepView {
  id: StepId;
  state: StepState;
}

/// What the stage stepper shows. The worker writes one "[stage] <name> <state>"
/// log line per transition; this reads the latest one per stage.
///  - "ownership" is always done: a job only exists for a verified target;
///  - "report" is done once the job completed;
///  - the stages shown are the profile's own (QUICK has one, DEEP nine); with
///    no profile they are recon, scan and any other stage that has reported;
///  - a stage marked "failed" stays failed even though the scan carried on
///    with the stages after it;
///  - a plain job with no markers and no profile (a scan started by hand)
///    shows recon as skipped and scan as done when it completed, and nothing
///    is invented while it still runs.
/// The profile a job was started with, from its stored config (null for a plain job).
export function profileOf(config: Record<string, unknown> | null | undefined): VulnScanProfile | null {
  const value = config?.profile;
  return value === "QUICK" || value === "STANDARD" || value === "DEEP" ? value : null;
}

export function deriveSteps(
  logs: ReadonlyArray<{ message: string }>,
  status: VulnScanJobStatus,
  profile?: VulnScanProfile | null,
): StepView[] {
  const marks: Partial<Record<PipelineStage, PipelineStageState>> = {};
  for (const log of logs) {
    const match = STAGE_MARKER_PATTERN.exec(log.message);
    if (match) marks[match[1] as PipelineStage] = match[2] as PipelineStageState;
  }
  const hasMarkers = Object.keys(marks).length > 0;
  const stopped = status === "FAILED" || status === "CANCELLED";

  // Without a profile: recon and scan always, plus any other stage that reported.
  const stages: readonly PipelineStage[] = profile
    ? PROFILE_STAGES[profile]
    : PIPELINE_STAGES.filter((name) => name === "recon" || name === "scan" || marks[name] !== undefined);

  const stage = (name: PipelineStage): StepState => {
    const mark = marks[name];
    if (mark === "done") return "done";
    if (mark === "skipped") return "skipped";
    if (mark === "failed") return "failed";
    if (mark === "start") return stopped ? "failed" : "active";
    if (status === "COMPLETED") {
      // Nothing was recorded for it: a plain job ran its scan; a profile
      // stage the worker never reached was skipped.
      return !hasMarkers && !profile && name === "scan" ? "done" : "skipped";
    }
    return "pending";
  };

  return [
    { id: "ownership", state: "done" },
    ...stages.map((name): StepView => ({ id: name, state: stage(name) })),
    { id: "report", state: status === "COMPLETED" ? "done" : "pending" },
  ];
}

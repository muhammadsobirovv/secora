import {
  STAGE_MARKER_PATTERN,
  type PipelineStage,
  type PipelineStageState,
  type VulnScanJobStatus,
} from "@pentesthub/shared";

export type StepId = "verify" | "recon" | "scan" | "report";
export type StepState = "pending" | "active" | "done" | "skipped" | "failed";
export interface StepView {
  id: StepId;
  state: StepState;
}

/// What the stage stepper shows. The worker writes one "[stage] <name> <state>"
/// log line per transition; this reads the latest one per stage.
///  - "verify" is always done: a job only exists for a verified target;
///  - "report" is done once the job completed;
///  - a plain job with no markers (no pipeline profile) shows recon as skipped
///    and scan as done when it completed, and nothing is invented while it
///    still runs.
export function deriveSteps(
  logs: ReadonlyArray<{ message: string }>,
  status: VulnScanJobStatus,
): StepView[] {
  const marks: Partial<Record<PipelineStage, PipelineStageState>> = {};
  for (const log of logs) {
    const match = STAGE_MARKER_PATTERN.exec(log.message);
    if (match) marks[match[1] as PipelineStage] = match[2] as PipelineStageState;
  }
  const hasMarkers = Object.keys(marks).length > 0;
  const failed = status === "FAILED" || status === "CANCELLED";

  const stage = (name: PipelineStage): StepState => {
    const mark = marks[name];
    if (mark === "done") return "done";
    if (mark === "skipped") return "skipped";
    if (mark === "start") return failed ? "failed" : "active";
    if (!hasMarkers && status === "COMPLETED") return name === "scan" ? "done" : "skipped";
    return "pending";
  };

  return [
    { id: "verify", state: "done" },
    { id: "recon", state: stage("recon") },
    { id: "scan", state: stage("scan") },
    { id: "report", state: status === "COMPLETED" ? "done" : "pending" },
  ];
}

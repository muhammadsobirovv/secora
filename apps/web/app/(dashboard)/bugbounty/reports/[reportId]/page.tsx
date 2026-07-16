"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import {
  useDeleteBugReport,
  useExportBugReport,
  useGenerateBugReportDraft,
  useRenderBugReport,
  useSubmitBugReport,
  useUpdateBugReport,
  useBugReport,
} from "@/features/bugbounty/hooks/use-bugbounty";
import { BugReportStatusBadge } from "@/features/bugbounty/components/bugbounty-badges";
import type { BugReportExportFormat, BugReportTemplate } from "@pentesthub/shared";

const TEMPLATES: BugReportTemplate[] = ["HACKERONE", "BUGCROWD", "INTIGRITI", "MARKDOWN", "PDF", "HTML"];
const EXPORT_FORMATS: BugReportExportFormat[] = ["PDF", "MARKDOWN", "HTML", "JSON", "CSV"];

export default function BugReportDetailPage() {
  const params = useParams<{ reportId: string }>();
  const router = useRouter();
  const reportId = params.reportId;
  const { data: report, isLoading } = useBugReport(reportId);
  const updateReport = useUpdateBugReport(reportId);
  const submitReport = useSubmitBugReport(reportId);
  const deleteReport = useDeleteBugReport();
  const generateDraft = useGenerateBugReportDraft(reportId);
  const exportReport = useExportBugReport(reportId);
  const [showRender, setShowRender] = React.useState(false);
  const { data: rendered, isFetching: renderLoading } = useRenderBugReport(reportId, showRender);

  const [summary, setSummary] = React.useState("");
  const [impact, setImpact] = React.useState("");
  const [stepsToReproduce, setStepsToReproduce] = React.useState("");
  const [template, setTemplate] = React.useState<BugReportTemplate>("MARKDOWN");

  React.useEffect(() => {
    if (!report) return;
    setSummary(report.summary ?? "");
    setImpact(report.impact ?? "");
    setStepsToReproduce(report.stepsToReproduce ?? "");
    setTemplate(report.template);
  }, [report]);

  async function handleSave(): Promise<void> {
    if (!report) return;
    try {
      await updateReport.mutateAsync({
        version: report.version,
        summary,
        impact,
        stepsToReproduce,
        template,
      });
      toast.success("Report saved");
    } catch {
      toast.error("Couldn't save — someone else may have updated this report (version conflict).");
    }
  }

  async function handleSubmit(): Promise<void> {
    if (!report) return;
    try {
      await submitReport.mutateAsync({ version: report.version });
      toast.success("Report submitted");
    } catch {
      toast.error("Couldn't submit this report.");
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm("Delete this report?")) return;
    try {
      await deleteReport.mutateAsync(reportId);
      toast.success("Report deleted");
      router.push("/bugbounty/reports");
    } catch {
      toast.error("Couldn't delete this report.");
    }
  }

  async function handleGenerateDraft(): Promise<void> {
    try {
      const result = await generateDraft.mutateAsync({});
      toast.success("Draft generated");
      setSummary(result.executiveSummary);
      setImpact(result.impact);
      setStepsToReproduce(result.technicalDetails);
    } catch {
      toast.error("Draft generation failed.");
    }
  }

  async function handleExport(format: BugReportExportFormat): Promise<void> {
    try {
      const result = await exportReport.mutateAsync({ format });
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!report) {
    return <EmptyState icon={FileText} title="Report not found" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/bugbounty/reports" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to reports
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{report.title}</h1>
            <BugReportStatusBadge status={report.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleGenerateDraft()} disabled={generateDraft.isPending}>
              {generateDraft.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              AI draft
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowRender((v) => !v)}>
              {showRender ? "Hide preview" : "Preview"}
            </Button>
            {report.status === "DRAFT" && (
              <Button size="sm" onClick={() => void handleSubmit()} disabled={submitReport.isPending}>
                {submitReport.isPending && <Loader2 className="size-4 animate-spin" />}
                <Send className="size-4" /> Submit
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={() => void handleDelete()}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Label>Template</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as BugReportTemplate)}>
              <SelectTrigger className="mt-1 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="report-summary">Summary</Label>
            <Textarea id="report-summary" value={summary} onChange={(e) => setSummary(e.target.value)} className="mt-1" rows={3} />
          </div>
          <div>
            <Label htmlFor="report-steps">Steps to reproduce</Label>
            <Textarea
              id="report-steps"
              value={stepsToReproduce}
              onChange={(e) => setStepsToReproduce(e.target.value)}
              className="mt-1"
              rows={5}
            />
          </div>
          <div>
            <Label htmlFor="report-impact">Impact</Label>
            <Textarea id="report-impact" value={impact} onChange={(e) => setImpact(e.target.value)} className="mt-1" rows={3} />
          </div>
          <div>
            <Button size="sm" onClick={() => void handleSave()} disabled={updateReport.isPending}>
              {updateReport.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {showRender && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview ({report.template})</CardTitle>
          </CardHeader>
          <CardContent>
            {renderLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {rendered?.content}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" /> Export
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {EXPORT_FORMATS.map((format) => (
            <Button key={format} size="sm" variant="outline" onClick={() => void handleExport(format)} disabled={exportReport.isPending}>
              {format}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

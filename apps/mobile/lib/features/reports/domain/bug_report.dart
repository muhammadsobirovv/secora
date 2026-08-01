enum BugReportStatus { draft, submitted, triaged, accepted, rejected, duplicate, resolved, closed }

extension BugReportStatusCodec on BugReportStatus {
  String get wire => name.toUpperCase();
  static BugReportStatus fromWire(String value) =>
      BugReportStatus.values.firstWhere((s) => s.wire == value, orElse: () => BugReportStatus.draft);
}

enum BugReportExportFormat { pdf, markdown, html, json, csv }

extension BugReportExportFormatCodec on BugReportExportFormat {
  String get wire => name.toUpperCase();
}

/// Mirrors packages/shared's `BugReportDto` (bugbounty.ts), trimmed to the
/// fields the mobile Reports feature renders (view/generate/download/share/
/// preview) — full edit-in-place authoring stays a Web Dashboard task.
class BugReport {
  const BugReport({
    required this.id,
    required this.title,
    required this.status,
    required this.aiGenerated,
    this.programId,
    this.projectId,
    this.summary,
    this.impact,
    this.stepsToReproduce,
    this.proofOfConcept,
  });

  final String id;
  final String? programId;
  final String? projectId;
  final String title;
  final BugReportStatus status;
  final String? summary;
  final String? impact;
  final String? stepsToReproduce;
  final String? proofOfConcept;
  final bool aiGenerated;

  factory BugReport.fromJson(Map<String, dynamic> json) => BugReport(
        id: json['id'] as String,
        programId: json['programId'] as String?,
        projectId: json['projectId'] as String?,
        title: json['title'] as String,
        status: BugReportStatusCodec.fromWire(json['status'] as String),
        summary: json['summary'] as String?,
        impact: json['impact'] as String?,
        stepsToReproduce: json['stepsToReproduce'] as String?,
        proofOfConcept: json['proofOfConcept'] as String?,
        aiGenerated: json['aiGenerated'] as bool? ?? false,
      );
}

class ExportedReport {
  const ExportedReport({required this.format, required this.filename, required this.mimeType, required this.content});
  final BugReportExportFormat format;
  final String filename;
  final String mimeType;
  final String content;

  factory ExportedReport.fromJson(Map<String, dynamic> json) => ExportedReport(
        format: BugReportExportFormat.values.firstWhere((f) => f.wire == json['format']),
        filename: json['filename'] as String,
        mimeType: json['mimeType'] as String,
        content: json['content'] as String,
      );
}

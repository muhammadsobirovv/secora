import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../../../core/network/api_client.dart';
import '../domain/bug_report.dart';

/// Reports — `BUG_REPORT_ENDPOINTS` (bugbounty-endpoints.ts). Online-only
/// (reports are generated/rendered server-side; there's no meaningful
/// offline authoring story for a report body yet, unlike Notes) — Download
/// writes the exported content to the app's documents directory so
/// File manager / Share sheet (`share_plus`) can pick it up afterward.
class ReportRepository {
  ReportRepository({required ApiClient apiClient}) : _api = apiClient;
  final ApiClient _api;

  Future<List<BugReport>> listReports({String? projectId}) => _api.get<List<BugReport>>(
        '/bugbounty/reports',
        queryParameters: {if (projectId != null) 'projectId': projectId},
        decode: (json) =>
            (json as List<dynamic>).map((e) => BugReport.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Future<BugReport> getReport(String id) => _api.get<BugReport>(
        '/bugbounty/reports/$id',
        decode: (json) => BugReport.fromJson(json as Map<String, dynamic>),
      );

  /// AI Report Draft Assistant (Module 6/11) — generates a draft body for
  /// an existing report shell via the AI copilot, same endpoint apps/web's
  /// Report Draft Assistant button calls.
  Future<BugReport> generateDraft(String id) => _api.post<BugReport>(
        '/bugbounty/reports/$id/draft',
        decode: (json) => BugReport.fromJson(json as Map<String, dynamic>),
      );

  Future<String> renderHtml(String id) => _api.get<String>(
        '/bugbounty/reports/$id/render',
        decode: (json) => (json as Map<String, dynamic>)['html'] as String? ?? '',
      );

  Future<ExportedReport> export(String id, BugReportExportFormat format) => _api.post<ExportedReport>(
        '/bugbounty/reports/$id/export',
        body: {'format': format.wire},
        decode: (json) => ExportedReport.fromJson(json as Map<String, dynamic>),
      );

  /// Downloads an exported report to local storage — File manager's
  /// "Downloads" section and Settings > Storage both read from the same
  /// documents-directory `reports/` folder this writes into.
  Future<File> downloadToLocal(ExportedReport report) async {
    final dir = await getApplicationDocumentsDirectory();
    final reportsDir = Directory('${dir.path}/reports');
    if (!await reportsDir.exists()) await reportsDir.create(recursive: true);
    final file = File('${reportsDir.path}/${report.filename}');
    await file.writeAsString(report.content);
    return file;
  }
}

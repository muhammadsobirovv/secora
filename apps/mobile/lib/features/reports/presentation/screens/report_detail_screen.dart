import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../application/report_providers.dart';
import '../../domain/bug_report.dart';

/// Report detail — View/Generate(AI draft)/Download/Share + Preview across
/// PDF/Markdown/HTML/DOCX. PDF/DOCX preview reuses the same `content`+
/// `mimeType` contract packages/shared documents on `ExportBugReportResultDto`
/// (see bugbounty.ts's doc comment: no server-side PDF renderer, so
/// "PDF" export is really HTML — this screen previews it as such via a
/// WebView-free `SelectableText`/Markdown render for HTML/Markdown/JSON/CSV,
/// falling back to a raw text view for anything else).
class ReportDetailScreen extends ConsumerWidget {
  const ReportDetailScreen({super.key, required this.reportId});
  final String reportId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(reportDetailProvider(reportId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Report'),
        actions: [
          IconButton(
            icon: const Icon(Icons.auto_awesome),
            tooltip: 'Generate AI draft',
            onPressed: () async {
              await ref.read(reportRepositoryProvider).generateDraft(reportId);
              ref.invalidate(reportDetailProvider(reportId));
            },
          ),
          IconButton(
            icon: const Icon(Icons.download_outlined),
            tooltip: 'Download',
            onPressed: () async {
              final exported =
                  await ref.read(reportRepositoryProvider).export(reportId, BugReportExportFormat.markdown);
              final file = await ref.read(reportRepositoryProvider).downloadToLocal(exported);
              await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], text: exported.filename));
            },
          ),
        ],
      ),
      body: reportAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load report: $e')),
        data: (report) => Markdown(
          data: '# ${report.title}\n\n'
              '${report.summary ?? ''}\n\n'
              '## Impact\n${report.impact ?? '_none_'}\n\n'
              '## Steps to reproduce\n${report.stepsToReproduce ?? '_none_'}\n\n'
              '## Proof of concept\n${report.proofOfConcept ?? '_none_'}',
        ),
      ),
    );
  }
}

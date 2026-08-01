import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/core_providers.dart';
import '../../data/knowledge_base_repository.dart';

final knowledgeBaseRepositoryProvider = Provider<KnowledgeBaseRepository>((ref) {
  return KnowledgeBaseRepository(apiClient: ref.watch(apiClientProvider));
});

class KnowledgeBaseScreen extends ConsumerStatefulWidget {
  const KnowledgeBaseScreen({super.key});

  @override
  ConsumerState<KnowledgeBaseScreen> createState() => _KnowledgeBaseScreenState();
}

class _KnowledgeBaseScreenState extends ConsumerState<KnowledgeBaseScreen> {
  List<KnowledgeBaseEntry> _results = [];
  bool _loading = false;

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) {
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    try {
      final results = await ref.read(knowledgeBaseRepositoryProvider).search(query);
      setState(() => _results = results);
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Knowledge Base'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Search OWASP, CWE, MITRE ATT&CK...', prefixIcon: Icon(Icons.search)),
              onSubmitted: _search,
            ),
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.separated(
              itemCount: _results.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final e = _results[index];
                return ListTile(
                  title: Text('${e.code} — ${e.title}'),
                  subtitle: Text(e.summary, maxLines: 2, overflow: TextOverflow.ellipsis),
                  trailing: Chip(label: Text(e.framework), visualDensity: VisualDensity.compact),
                );
              },
            ),
    );
  }
}

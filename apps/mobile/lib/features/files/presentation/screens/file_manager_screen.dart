import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as p;

import '../../data/file_manager_repository.dart';

final fileManagerRepositoryProvider = Provider<FileManagerRepository>((ref) => FileManagerRepository());

class FileManagerScreen extends ConsumerStatefulWidget {
  const FileManagerScreen({super.key});

  @override
  ConsumerState<FileManagerScreen> createState() => _FileManagerScreenState();
}

class _FileManagerScreenState extends ConsumerState<FileManagerScreen> {
  List<FileSystemEntity> _entries = [];
  String? _query;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final repo = ref.read(fileManagerRepositoryProvider);
    final entries = (_query == null || _query!.isEmpty)
        ? await repo.list()
        : await repo.search(_query!);
    setState(() => _entries = entries);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Files'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Search files', prefixIcon: Icon(Icons.search)),
              onChanged: (v) {
                _query = v;
                _load();
              },
            ),
          ),
        ),
      ),
      body: _entries.isEmpty
          ? const Center(child: Text('No downloaded files yet'))
          : ListView.builder(
              itemCount: _entries.length,
              itemBuilder: (context, index) {
                final entry = _entries[index];
                final name = p.basename(entry.path);
                return ListTile(
                  leading: Icon(entry is Directory ? Icons.folder : Icons.insert_drive_file_outlined),
                  title: Text(name),
                  onTap: () {
                    if (entry is File) OpenFilex.open(entry.path);
                  },
                  trailing: PopupMenuButton<String>(
                    onSelected: (action) async {
                      if (action == 'delete') {
                        await ref.read(fileManagerRepositoryProvider).delete(entry);
                        _load();
                      } else if (action == 'rename') {
                        final controller = TextEditingController(text: name);
                        final newName = await showDialog<String>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Rename'),
                            content: TextField(controller: controller),
                            actions: [
                              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, controller.text),
                                child: const Text('Save'),
                              ),
                            ],
                          ),
                        );
                        if (newName != null && newName.isNotEmpty) {
                          await ref.read(fileManagerRepositoryProvider).rename(entry, newName);
                          _load();
                        }
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(value: 'rename', child: Text('Rename')),
                      PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                  ),
                );
              },
            ),
    );
  }
}

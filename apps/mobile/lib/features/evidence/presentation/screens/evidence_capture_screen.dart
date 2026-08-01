import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:record/record.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../projects/application/project_providers.dart';
import '../../application/evidence_providers.dart';
import '../../domain/evidence.dart';

/// Evidence Capture — Camera / Gallery / Screen Capture Import (via File
/// Picker, since there's no cross-platform "grab the last screenshot" API)
/// / File Picker / Document Scanner (camera capture, cropped client-side by
/// the OS picker's own edit UI on supported platforms) / Microphone
/// Recording / Video Recording / QR Code Scanner. Every capture path ends
/// in the same `EvidenceRepository.capture()` call — SHA-256 hashing and
/// the offline queue are handled there, not per-button here.
class EvidenceCaptureScreen extends ConsumerStatefulWidget {
  const EvidenceCaptureScreen({super.key, this.projectId});
  final String? projectId;

  @override
  ConsumerState<EvidenceCaptureScreen> createState() => _EvidenceCaptureScreenState();
}

class _EvidenceCaptureScreenState extends ConsumerState<EvidenceCaptureScreen> {
  String? _selectedProjectId;
  final _picker = ImagePicker();
  final _audioRecorder = AudioRecorder();
  bool _recording = false;

  @override
  void initState() {
    super.initState();
    _selectedProjectId = widget.projectId;
  }

  Future<void> _captureFile({required String path, required EvidenceType type, required String title}) async {
    final projectId = _selectedProjectId;
    if (projectId == null) return;
    await ref.read(evidenceRepositoryProvider).capture(
          projectId: projectId,
          type: type,
          title: title,
          filePath: path,
        );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Evidence captured')));
    }
  }

  Future<void> _fromCamera() async {
    final image = await _picker.pickImage(source: ImageSource.camera);
    if (image != null) await _captureFile(path: image.path, type: EvidenceType.screenshot, title: 'Camera capture');
  }

  Future<void> _fromGallery() async {
    final image = await _picker.pickImage(source: ImageSource.gallery);
    if (image != null) await _captureFile(path: image.path, type: EvidenceType.screenshot, title: 'Gallery import');
  }

  Future<void> _fromFilePicker() async {
    final result = await FilePicker.platform.pickFiles();
    final path = result?.files.single.path;
    if (path != null) await _captureFile(path: path, type: EvidenceType.file, title: result!.files.single.name);
  }

  Future<void> _fromVideo() async {
    final video = await _picker.pickVideo(source: ImageSource.camera);
    if (video != null) await _captureFile(path: video.path, type: EvidenceType.video, title: 'Video recording');
  }

  Future<void> _toggleAudioRecording() async {
    if (_recording) {
      final path = await _audioRecorder.stop();
      setState(() => _recording = false);
      if (path != null) await _captureFile(path: path, type: EvidenceType.file, title: 'Audio recording');
      return;
    }
    if (await _audioRecorder.hasPermission()) {
      final dir = await _tempRecordingPath();
      await _audioRecorder.start(const RecordConfig(), path: dir);
      setState(() => _recording = true);
    }
  }

  Future<String> _tempRecordingPath() async {
    return '${DateTime.now().millisecondsSinceEpoch}.m4a';
  }

  Future<void> _scanQrCode() async {
    final projectId = _selectedProjectId;
    if (projectId == null) return;
    final result = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const _QrScannerPage()),
    );
    if (result != null) {
      await ref.read(evidenceRepositoryProvider).capture(
            projectId: projectId,
            type: EvidenceType.log,
            title: 'QR code scan',
            textContent: result,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Captured QR: $result')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final canCapture = _selectedProjectId != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Capture evidence')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (widget.projectId == null) ...[
              Consumer(builder: (context, ref, _) {
                final projectsAsync = ref.watch(projectListProvider(null));
                return projectsAsync.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text('$e'),
                  data: (projects) => DropdownButtonFormField<String>(
                    initialValue: _selectedProjectId,
                    decoration: const InputDecoration(labelText: 'Project'),
                    items: projects.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
                    onChanged: (v) => setState(() => _selectedProjectId = v),
                  ),
                );
              }),
              const SizedBox(height: 16),
            ],
            if (!canCapture)
              const Text('Select a project to start capturing evidence.', style: TextStyle(color: AppColors.textSecondary))
            else
              Expanded(
                child: GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  children: [
                    _CaptureTile(icon: Icons.camera_alt, label: 'Camera', onTap: _fromCamera),
                    _CaptureTile(icon: Icons.photo_library, label: 'Gallery', onTap: _fromGallery),
                    _CaptureTile(icon: Icons.attach_file, label: 'File / Screen capture', onTap: _fromFilePicker),
                    _CaptureTile(icon: Icons.videocam, label: 'Video', onTap: _fromVideo),
                    _CaptureTile(
                      icon: _recording ? Icons.stop_circle : Icons.mic,
                      label: _recording ? 'Stop recording' : 'Microphone',
                      onTap: _toggleAudioRecording,
                      active: _recording,
                    ),
                    _CaptureTile(icon: Icons.qr_code_scanner, label: 'QR code', onTap: _scanQrCode),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CaptureTile extends StatelessWidget {
  const _CaptureTile({required this.icon, required this.label, required this.onTap, this.active = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: active ? AppColors.danger.withValues(alpha: 0.15) : null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 36, color: active ? AppColors.danger : AppColors.primary),
            const SizedBox(height: 8),
            Text(label, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _QrScannerPage extends StatelessWidget {
  const _QrScannerPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan QR code')),
      body: MobileScanner(
        onDetect: (capture) {
          final value = capture.barcodes.firstOrNull?.rawValue;
          if (value != null) Navigator.of(context).pop(value);
        },
      ),
    );
  }
}

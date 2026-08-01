import '../../../core/network/api_client.dart';

enum AiPrivacyMode { cloud, local, hybrid }

extension AiPrivacyModeCodec on AiPrivacyMode {
  String get wire => name.toUpperCase();
  static AiPrivacyMode fromWire(String value) =>
      AiPrivacyMode.values.firstWhere((m) => m.wire == value, orElse: () => AiPrivacyMode.cloud);
}

/// Settings > AI Providers — `AI_PRIVACY_ENDPOINTS` (Module 11 Privacy Mode:
/// CLOUD/LOCAL/HYBRID). This is the spec's "Provider Switching / Local AI /
/// Cloud AI" surfaced as a workspace-level setting, matching how
/// `AiProviderRegistryService` actually enforces it server-side (per
/// docs/adr/0011 §6) — not a per-message toggle.
class PrivacyModeRepository {
  PrivacyModeRepository({required ApiClient apiClient}) : _api = apiClient;
  final ApiClient _api;

  Future<AiPrivacyMode> get() => _api.get<AiPrivacyMode>(
        '/ai/privacy-mode',
        decode: (json) => AiPrivacyModeCodec.fromWire((json as Map<String, dynamic>)['mode'] as String),
      );

  Future<void> update(AiPrivacyMode mode) => _api.patch<void>('/ai/privacy-mode', body: {'mode': mode.wire});
}

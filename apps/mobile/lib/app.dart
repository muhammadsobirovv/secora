import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/providers/core_providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/updates/app_update_service.dart';
import 'features/auth/application/auth_notifier.dart';
import 'features/settings/application/settings_notifier.dart';
import 'features/settings/data/device_integrity_service.dart';

// Module 14 — Auto Update: placeholders. Fill in with the real store
// listing URLs once this app is actually published — see
// docs/architecture/auto-update.md's mobile section.
const _kAppStoreUrl = 'https://apps.apple.com/app/id0000000000';
const _kPlayStoreUrl = 'https://play.google.com/store/apps/details?id=ai.pentesthub.mobile';

class PentestHubApp extends ConsumerStatefulWidget {
  const PentestHubApp({super.key});

  @override
  ConsumerState<PentestHubApp> createState() => _PentestHubAppState();
}

class _PentestHubAppState extends ConsumerState<PentestHubApp> with WidgetsBindingObserver {
  bool _integrityWarningDismissed = false;
  DeviceIntegrityStatus? _integrityStatus;

  // Module 14 — Auto Update.
  AppUpdateInfo? _updateInfo;
  bool _updateDialogShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Security hardening — Jailbreak/Root Detection, checked once at cold
    // start; see DeviceIntegrityService's doc comment for why this is a
    // dismissible warning, not a hard block.
    DeviceIntegrityService().check().then((status) {
      if (mounted) setState(() => _integrityStatus = status);
    });
    // Module 14 — Auto Update. Just stores the result here — the dialog
    // itself is triggered from `MaterialApp.router`'s `builder` below,
    // whose `context` (unlike this State's own `context`, which sits
    // *above* the router) is a genuine Navigator descendant, which
    // `showDialog` requires.
    AppUpdateService(apiClient: ref.read(apiClientProvider)).check().then((info) {
      if (mounted && info.updateAvailable) setState(() => _updateInfo = info);
    });
  }

  void _showUpdateDialog(BuildContext dialogContext, AppUpdateInfo info) {
    showDialog<void>(
      context: dialogContext,
      builder: (ctx) => AlertDialog(
        title: const Text('Update available'),
        content: Text(
          'A newer version of PentestHub AI is available '
          '(you have ${info.currentVersion}). Update from the app store for the latest '
          'features and fixes.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Later')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              final url =
                  Theme.of(dialogContext).platform == TargetPlatform.iOS ? _kAppStoreUrl : _kPlayStoreUrl;
              launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // PIN Lock / Biometric re-arm: re-lock the moment the app is backgrounded
    // rather than waiting for the user to notice — same threat model as a
    // banking app (Security hardening task: Session Timeout).
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      ref.read(authNotifierProvider.notifier).lockIfConfigured();
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    final showIntegrityWarning =
        !_integrityWarningDismissed && (_integrityStatus?.compromised ?? false);

    return MaterialApp.router(
      title: 'PentestHub AI',
      debugShowCheckedModeBanner: false,
      themeMode: themeMode,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      routerConfig: router,
      builder: (context, child) {
        // Module 14 — Auto Update: fires once, after this frame, using
        // `context` from *this* builder (a Navigator descendant) rather
        // than the State's own `context`.
        if (_updateInfo != null && !_updateDialogShown) {
          _updateDialogShown = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _showUpdateDialog(context, _updateInfo!);
          });
        }
        if (!showIntegrityWarning) return child ?? const SizedBox.shrink();
        return Column(
          children: [
            MaterialBanner(
              backgroundColor: Colors.red.shade900,
              content: const Text(
                'This device appears to be jailbroken or rooted. Sensitive data protections '
                '(secure storage, certificate pinning) may be weaker on a compromised device.',
                style: TextStyle(color: Colors.white),
              ),
              actions: [
                TextButton(
                  onPressed: () => setState(() => _integrityWarningDismissed = true),
                  child: const Text('Dismiss', style: TextStyle(color: Colors.white)),
                ),
              ],
            ),
            Expanded(child: child ?? const SizedBox.shrink()),
          ],
        );
      },
    );
  }
}

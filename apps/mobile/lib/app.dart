import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/application/auth_notifier.dart';
import 'features/settings/application/settings_notifier.dart';
import 'features/settings/data/device_integrity_service.dart';

class PentestHubApp extends ConsumerStatefulWidget {
  const PentestHubApp({super.key});

  @override
  ConsumerState<PentestHubApp> createState() => _PentestHubAppState();
}

class _PentestHubAppState extends ConsumerState<PentestHubApp> with WidgetsBindingObserver {
  bool _integrityWarningDismissed = false;
  DeviceIntegrityStatus? _integrityStatus;

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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../application/auth_notifier.dart';
import '../../domain/auth_state.dart';

/// Rendered while [AuthNotifier] is validating the stored refresh token
/// (`AuthLoading`) — `core/router/app_router.dart`'s redirect logic sends
/// the user everywhere else once state resolves, so this screen never
/// contains navigation of its own.
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authNotifierProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.shield_outlined, size: 64, color: AppColors.primary),
            const SizedBox(height: 16),
            const Text(
              'PentestHub AI',
              style: TextStyle(color: AppColors.textPrimary, fontSize: 22, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 24),
            if (authState is AuthLoading)
              const CircularProgressIndicator(color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_colors.dart';

/// Dashboard > Quick Actions — jumps straight to the four most common
/// on-the-go actions: start an AI Copilot chat, capture evidence, add a
/// finding, run a search.
class QuickActionsRow extends StatelessWidget {
  const QuickActionsRow({super.key});

  @override
  Widget build(BuildContext context) {
    final actions = [
      (icon: Icons.auto_awesome, label: 'Ask AI', route: AppRoutes.agent),
      (icon: Icons.camera_alt_outlined, label: 'Capture', route: AppRoutes.evidenceCapture),
      (icon: Icons.bug_report_outlined, label: 'Findings', route: AppRoutes.findings),
      (icon: Icons.search, label: 'Search', route: AppRoutes.search),
    ];
    return Row(
      children: actions
          .map(
            (a) => Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => context.push(a.route),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(a.icon, color: AppColors.primary),
                      ),
                      const SizedBox(height: 6),
                      Text(a.label, style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

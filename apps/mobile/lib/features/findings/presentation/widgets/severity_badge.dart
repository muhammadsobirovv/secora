import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/finding.dart';

class SeverityBadge extends StatelessWidget {
  const SeverityBadge({super.key, required this.severity});
  final FindingSeverity severity;

  Color get _color => switch (severity) {
        FindingSeverity.critical => AppColors.severityCritical,
        FindingSeverity.high => AppColors.severityHigh,
        FindingSeverity.medium => AppColors.severityMedium,
        FindingSeverity.low => AppColors.severityLow,
        FindingSeverity.info => AppColors.severityInfo,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: _color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(6)),
      child: Text(
        severity.wire,
        style: TextStyle(color: _color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

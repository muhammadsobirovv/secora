import 'package:flutter/material.dart';

/// Color tokens mirroring apps/web's Tailwind/shadcn theme palette (dark
/// slate + one accent) so the mobile app looks like the same product as the
/// Web Dashboard rather than a generic Material app. Severity colors match
/// the `VulnFindingSeverity` scale used consistently across Modules 4/6/11
/// (CRITICAL/HIGH/MEDIUM/LOW/INFO).
abstract final class AppColors {
  static const Color background = Color(0xFF0B0F17);
  static const Color surface = Color(0xFF121722);
  static const Color surfaceElevated = Color(0xFF1A2130);
  static const Color border = Color(0xFF232B3D);

  static const Color primary = Color(0xFF6366F1);
  static const Color primaryMuted = Color(0xFF4338CA);

  static const Color textPrimary = Color(0xFFE6E9F0);
  static const Color textSecondary = Color(0xFF8B93A7);
  static const Color textDisabled = Color(0xFF4B5468);

  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);

  static const Color severityCritical = Color(0xFFB91C1C);
  static const Color severityHigh = Color(0xFFEA580C);
  static const Color severityMedium = Color(0xFFCA8A04);
  static const Color severityLow = Color(0xFF2563EB);
  static const Color severityInfo = Color(0xFF64748B);

  static const Color lightBackground = Color(0xFFF7F8FA);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightBorder = Color(0xFFE3E6EC);
  static const Color lightTextPrimary = Color(0xFF11151F);
  static const Color lightTextSecondary = Color(0xFF5B6478);
}

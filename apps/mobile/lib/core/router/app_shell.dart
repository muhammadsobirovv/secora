import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_routes.dart';

/// The bottom-nav frame wrapping every authenticated top-level destination
/// (`ShellRoute` in `app_router.dart`) — Dashboard, Projects, Findings,
/// Agent Copilot, Settings. Feature detail screens (project detail, finding
/// detail, agent chat, ...) push on top of this shell full-screen rather
/// than living inside it, same information architecture as apps/web's
/// dashboard layout + drill-down pages.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  static const _destinations = [
    (route: AppRoutes.dashboard, icon: Icons.dashboard_outlined, activeIcon: Icons.dashboard, label: 'Dashboard'),
    (route: AppRoutes.projects, icon: Icons.folder_outlined, activeIcon: Icons.folder, label: 'Projects'),
    (route: AppRoutes.findings, icon: Icons.bug_report_outlined, activeIcon: Icons.bug_report, label: 'Findings'),
    (route: AppRoutes.agent, icon: Icons.auto_awesome_outlined, activeIcon: Icons.auto_awesome, label: 'Copilot'),
    (route: AppRoutes.settings, icon: Icons.settings_outlined, activeIcon: Icons.settings, label: 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: navigationShell.currentIndex,
        onTap: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        items: _destinations
            .map((d) => BottomNavigationBarItem(
                  icon: Icon(d.icon),
                  activeIcon: Icon(d.activeIcon),
                  label: d.label,
                ))
            .toList(),
      ),
    );
  }
}

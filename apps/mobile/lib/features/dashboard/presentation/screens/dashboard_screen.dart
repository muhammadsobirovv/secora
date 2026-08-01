import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/application/auth_notifier.dart';
import '../../../findings/application/finding_providers.dart';
import '../../../projects/application/project_providers.dart';
import '../../application/dashboard_providers.dart';
import '../widgets/quick_actions_row.dart';
import '../widgets/stat_card.dart';

/// Dashboard — Workspace Overview, Projects (pinned/favorites), Findings,
/// Recent Activity, AI Suggestions, Notifications badge, Quick Actions,
/// Statistics. Recon/Scanner job widgets are deferred here (those modules'
/// job-status endpoints are not yet wired into a mobile repository in this
/// pass — see docs/mobile/mobile-architecture-guide.md "Known gaps").
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final summaryAsync = ref.watch(dashboardSummaryProvider);
    final favoritesAsync = ref.watch(favoriteProjectsProvider);
    final findingsAsync = ref.watch(findingListProvider(null));
    final activityAsync = ref.watch(recentActivityProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, ${user?.displayName.split(' ').first ?? ''}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            tooltip: 'Notifications',
            onPressed: () => context.push(AppRoutes.notifications),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardSummaryProvider);
          ref.invalidate(favoriteProjectsProvider);
          ref.invalidate(findingListProvider(null));
          ref.invalidate(recentActivityProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const QuickActionsRow(),
            const SizedBox(height: 20),
            summaryAsync.when(
              loading: () => const SizedBox(height: 80, child: Center(child: CircularProgressIndicator())),
              error: (_, __) => const SizedBox.shrink(),
              data: (summary) => GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.6,
                children: [
                  StatCard(label: 'Projects', value: summary.totalProjects.toString(), icon: Icons.folder, color: AppColors.info),
                  StatCard(label: 'Open findings', value: summary.openFindings.toString(), icon: Icons.bug_report, color: AppColors.warning),
                  StatCard(label: 'Critical', value: summary.criticalFindings.toString(), icon: Icons.warning_amber, color: AppColors.danger),
                  StatCard(label: 'Reports', value: summary.totalReports.toString(), icon: Icons.description, color: AppColors.success),
                ],
              ),
            ),
            const SizedBox(height: 24),
            _SectionHeader(title: 'Pinned projects', onSeeAll: () => context.go(AppRoutes.projects)),
            favoritesAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => const SizedBox.shrink(),
              data: (projects) => projects.isEmpty
                  ? const Padding(padding: EdgeInsets.all(8), child: Text('No pinned projects yet'))
                  : SizedBox(
                      height: 90,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: projects.length,
                        itemBuilder: (context, i) {
                          final p = projects[i];
                          return Card(
                            margin: const EdgeInsets.only(right: 10),
                            child: InkWell(
                              onTap: () => context.push(AppRoutes.projectDetailPath(p.id)),
                              child: Container(
                                width: 160,
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(p.status.label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
            ),
            const SizedBox(height: 24),
            _SectionHeader(title: 'Latest findings', onSeeAll: () => context.go(AppRoutes.findings)),
            findingsAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => const SizedBox.shrink(),
              data: (findings) => Column(
                children: findings.take(5).map((f) {
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(f.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text(f.stage.label),
                    onTap: () => context.push(AppRoutes.findingDetailPath(f.id)),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 24),
            const _SectionHeader(title: 'Recent activity'),
            activityAsync.when(
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => const SizedBox.shrink(),
              data: (events) => events.isEmpty
                  ? const Padding(padding: EdgeInsets.all(8), child: Text('No recent activity'))
                  : Column(
                      children: events.take(8).map((e) {
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.history, color: AppColors.textSecondary),
                          title: Text(e.description),
                          subtitle: Text(e.createdAt.toLocal().toString()),
                        );
                      }).toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        if (onSeeAll != null) TextButton(onPressed: onSeeAll, child: const Text('See all')),
      ],
    );
  }
}

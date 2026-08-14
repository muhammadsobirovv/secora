import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/project.dart';

class ProjectCard extends StatelessWidget {
  const ProjectCard({super.key, required this.project, required this.onTap, required this.onToggleFavorite});
  final Project project;
  final VoidCallback onTap;
  final VoidCallback onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.folder, color: AppColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(project.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    if (project.description != null)
                      Text(
                        project.description!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                      ),
                    const SizedBox(height: 4),
                    Chip(
                      label: Text(project.status.label, style: const TextStyle(fontSize: 11)),
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ],
                ),
              ),
              // Module 15 — task #349 (accessibility audit): a star-shaped
              // icon alone carries no accessible name — `tooltip` gives
              // IconButton both a long-press tooltip and the Semantics
              // label screen readers announce, matching the same
              // favorite-toggle gap fixed in apps/web's project table.
              IconButton(
                icon: Icon(
                  project.isFavorite ? Icons.star : Icons.star_border,
                  color: project.isFavorite ? AppColors.warning : AppColors.textSecondary,
                ),
                tooltip: project.isFavorite ? 'Remove from favorites' : 'Add to favorites',
                onPressed: onToggleFavorite,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

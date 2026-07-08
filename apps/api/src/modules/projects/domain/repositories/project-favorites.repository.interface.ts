export interface ProjectFavoritesRepository {
  add(projectId: string, userId: string): Promise<void>;
  remove(projectId: string, userId: string): Promise<void>;
  isFavorite(projectId: string, userId: string): Promise<boolean>;
  /// Returns the set of project ids (from `projectIds`) that `userId` has
  /// favorited — used to batch-annotate a project list without an N+1.
  listFavoritedIds(projectIds: string[], userId: string): Promise<Set<string>>;
}

export const PROJECT_FAVORITES_REPOSITORY = Symbol(
  'PROJECT_FAVORITES_REPOSITORY',
);

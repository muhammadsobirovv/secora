export interface TagDto {
  id: string;
  workspaceId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface CreateTagRequestDto {
  name: string;
  color?: string;
}

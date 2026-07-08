export interface NoteDto {
  id: string;
  projectId: string;
  targetId: string | null;
  title: string | null;
  content: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequestDto {
  title?: string;
  content: string;
  targetId?: string;
}

export interface UpdateNoteRequestDto {
  title?: string;
  content?: string;
  targetId?: string | null;
}

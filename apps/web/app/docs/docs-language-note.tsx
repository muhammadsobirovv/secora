/// User docs are English-only for now. Server-rendered static pages have
/// no access to the visitor's chosen locale, so the note is shown in all
/// three supported languages at once.
export function DocsLanguageNote() {
  return (
    <p className="mt-6 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      Documentation is currently available in English. · Hujjatlar hozircha ingliz tilida. ·
      Документация пока доступна на английском языке.
    </p>
  );
}

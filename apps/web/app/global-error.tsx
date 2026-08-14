"use client";

/// Module 15 — task #354. Next.js convention: catches errors thrown by
/// the root layout itself (`app/layout.tsx`) — the one place
/// `app/error.tsx` can't help, since it renders *inside* that layout and
/// would crash along with it. Must render its own `<html>`/`<body>` since
/// the real root layout is what failed. Kept intentionally minimal —
/// plain inline styles, no design-system components, no Tailwind classes
/// — because if the layout itself is broken, the CSS/font pipeline it
/// sets up (see `app/layout.tsx`'s `localFont` calls) may be exactly
/// what's failing, and this screen has to render without depending on it.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              PentestHub AI failed to load
            </h1>
            <p style={{ color: "#71717a", fontSize: 14, marginBottom: 16 }}>
              A critical error occurred. Reloading usually fixes this.
              {error.digest ? ` Reference: ${error.digest}` : ""}
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: "#18181b",
                color: "#fff",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

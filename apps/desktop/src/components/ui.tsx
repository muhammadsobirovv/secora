import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

/// Small, dependency-light UI kit shared across every Desktop Agent page —
/// deliberately not a full component library (no Radix/shadcn — this is a
/// Tauri webview app where every dependency adds to `npm install` time and
/// bundle size for no real benefit at this scope). Covers the "UI Polish"
/// task's loading/error/empty states plus the basic building blocks every
/// other feature page composes.

export function Button({
  variant = "default",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
}) {
  return (
    <button
      className={clsx("phai-btn", `phai-btn-${variant}`, `phai-btn-${size}`, className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={14} style={{ animation: "phai-spin 0.8s linear infinite" }} />}
      {children}
      <style>{`
        .phai-btn { display: inline-flex; align-items: center; gap: 6px; justify-content: center;
          border-radius: var(--radius-sm); border: 1px solid transparent; cursor: pointer;
          font-size: 13px; font-weight: 500; transition: background 0.12s, border-color 0.12s, opacity 0.12s;
          white-space: nowrap; }
        .phai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .phai-btn-sm { padding: 4px 10px; }
        .phai-btn-md { padding: 7px 14px; }
        .phai-btn-lg { padding: 10px 18px; font-size: 14px; }
        .phai-btn-icon { padding: 7px; }
        .phai-btn-default { background: var(--color-bg-elevated); border-color: var(--color-border); color: var(--color-text); }
        .phai-btn-default:not(:disabled):hover { background: var(--color-bg-subtle); }
        .phai-btn-primary { background: var(--color-primary); color: var(--color-primary-fg); }
        .phai-btn-primary:not(:disabled):hover { background: var(--color-primary-hover); }
        .phai-btn-ghost { background: transparent; color: var(--color-text); }
        .phai-btn-ghost:not(:disabled):hover { background: var(--color-bg-subtle); }
        .phai-btn-outline { background: transparent; border-color: var(--color-border); color: var(--color-text); }
        .phai-btn-outline:not(:disabled):hover { background: var(--color-bg-subtle); }
        .phai-btn-danger { background: var(--color-danger); color: white; }
        .phai-btn-danger:not(:disabled):hover { opacity: 0.9; }
      `}</style>
    </button>
  );
}

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(className)}
      style={{
        background: "var(--color-bg-elevated)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)",
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx("phai-input", props.className)}
      style={{
        width: "100%",
        padding: "7px 10px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontSize: 13,
        outline: "none",
        ...props.style,
      }}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontSize: 13,
        outline: "none",
        resize: "vertical",
        fontFamily: "inherit",
        ...props.style,
      }}
    />
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const colors: Record<string, string> = {
    default: "var(--color-text-muted)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
    danger: "var(--color-danger)",
    info: "var(--color-info)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: colors[tone],
        background: `color-mix(in srgb, ${colors[tone]} 14%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Skeleton({ width = "100%", height = 14 }: { width?: number | string; height?: number | string }) {
  return <div className="phai-skeleton" style={{ width, height }} />;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: "phai-spin 0.8s linear infinite", color: "var(--color-text-muted)" }} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", textAlign: "center", gap: 8 }}>
      {icon && <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
      {description && <div style={{ fontSize: 13, color: "var(--color-text-muted)", maxWidth: 360 }}>{description}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: "var(--radius-sm)",
        background: "color-mix(in srgb, var(--color-danger) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
        color: "var(--color-danger)",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        fontFamily: "inherit",
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 4,
        border: "1px solid var(--color-border)",
        background: "var(--color-bg-subtle)",
        color: "var(--color-text-muted)",
      }}
    >
      {children}
    </kbd>
  );
}

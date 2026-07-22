// Minimal shared UI kit — mirrors `apps/desktop/src/components/ui.tsx`'s
// approach (small, dependency-light, inline-styled) for visual/behavioral
// consistency without literally sharing code across the two separate
// build targets (desktop is a Tauri/Vite app, this is an esbuild-bundled
// extension — different toolchains, same look).

import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function Button({
  variant = "default",
  size = "md",
  loading,
  className,
  children,
  disabled,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" | "outline"; size?: "sm" | "md" | "lg" | "icon"; loading?: boolean }) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    default: { bg: "var(--color-bg-elevated)", fg: "var(--color-text)", border: "var(--color-border)" },
    primary: { bg: "var(--color-primary)", fg: "var(--color-primary-fg)", border: "transparent" },
    ghost: { bg: "transparent", fg: "var(--color-text)", border: "transparent" },
    outline: { bg: "transparent", fg: "var(--color-text)", border: "var(--color-border)" },
    danger: { bg: "var(--color-danger)", fg: "#fff", border: "transparent" },
  };
  const p = palette[variant];
  const pad: Record<string, string> = { sm: "4px 10px", md: "7px 14px", lg: "10px 18px", icon: "7px" };
  return (
    <button
      disabled={disabled || loading}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${p.border}`,
        background: p.bg,
        color: p.fg,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.5 : 1,
        fontSize: 12.5,
        fontWeight: 500,
        padding: pad[size],
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {loading && <Loader2 size={13} style={{ animation: "phai-spin 0.8s linear infinite" }} />}
      {children}
    </button>
  );
}

export function Card({ className, children, style, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Select({ options, value, onChange, style }: { options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%", padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 12.5, ...style }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ width: "100%", padding: "6px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 12.5, outline: "none", ...props.style }}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{ width: "100%", padding: "8px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "inherit", ...props.style }}
    />
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const colors: Record<string, string> = { default: "var(--color-text-muted)", success: "var(--color-success)", warning: "var(--color-warning)", danger: "var(--color-danger)", info: "var(--color-info)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, color: colors[tone], background: `color-mix(in srgb, ${colors[tone]} 14%, transparent)` }}>
      {children}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 34,
          height: 19,
          borderRadius: 999,
          background: checked ? "var(--color-primary)" : "var(--color-border)",
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
        }}
      >
        <span style={{ position: "absolute", top: 2, left: checked ? 17 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Spinner({ size = 15 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: "phai-spin 0.8s linear infinite", color: "var(--color-text-muted)" }} />;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 16px", textAlign: "center", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {description && <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", maxWidth: 280 }}>{description}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ padding: 10, borderRadius: "var(--radius-sm)", background: "color-mix(in srgb, var(--color-danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)", color: "var(--color-danger)", fontSize: 12 }}>
      {message}
    </div>
  );
}

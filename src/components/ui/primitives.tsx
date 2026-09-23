import { clsx } from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return clsx(inputs);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-11 px-5 text-sm",
        variant === "primary" &&
          "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm hover:brightness-105 active:scale-[0.98]",
        variant === "secondary" &&
          "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-3)]",
        variant === "ghost" &&
          "bg-transparent text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
        variant === "outline" &&
          "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--brand)]",
        variant === "danger" &&
          "bg-red-50 text-red-700 hover:bg-red-100",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-muted)]",
        className,
      )}
    >
      {children}
    </label>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  soft,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  soft?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl px-1 py-2.5 transition hover:bg-[var(--surface-2)]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          {label}
          {soft ? (
            <span className="rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              soft
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--brand)]" : "bg-[var(--surface-3)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn" | "demo" | "ok";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "neutral" && "bg-[var(--surface-3)] text-[var(--ink-muted)]",
        tone === "brand" && "bg-[var(--brand-soft)] text-[var(--brand)]",
        tone === "warn" && "bg-amber-100 text-amber-800",
        tone === "demo" && "bg-sky-100 text-sky-800",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-3 py-4 text-center text-xs leading-relaxed text-[var(--ink-muted)]">
      {children}
    </p>
  );
}

/** Shared UI primitives: cards, badges, states, modal. */

import type { ReactNode } from "react";
import { AlertTriangle, CloudOff, Inbox, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function Card({
  children,
  className = "",
  as: As = "section",
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
  ariaLabel?: string;
}) {
  return (
    <As className={`card ${className}`} aria-label={ariaLabel}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-navy-700/60 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <Card className="card-pad space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-16 w-full" />
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="card-pad flex flex-col items-center gap-2 py-10 text-center">
      <Inbox className="h-8 w-8 text-slate-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      <p className="max-w-md text-sm text-slate-400">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="card-pad border-amber-500/40">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-450" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
          {onRetry && (
            <button type="button" className="btn mt-3" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function OfflineNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

/** Accessible modal with Esc-to-close and basic focus management. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog.
    const t = setTimeout(() => {
      ref.current
        ?.querySelector<HTMLElement>("button, [href], input, select, textarea")
        ?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[92vh] w-full overflow-y-auto ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-navy-700/60 bg-navy-900 px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

/** Small labelled meter bar (0–100). */
export function Meter({
  value,
  tone = "sky",
  label,
}: {
  value: number;
  tone?: "sky" | "amber" | "red" | "green";
  label?: string;
}) {
  const colors: Record<string, string> = {
    sky: "bg-sky-450",
    amber: "bg-amber-450",
    red: "bg-red-500",
    green: "bg-emerald-500",
  };
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-navy-800"
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full ${colors[tone]}`}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

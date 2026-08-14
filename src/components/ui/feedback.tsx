import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

/** Empty, loading, success and error states, so no view can render as a blank. */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-surface px-6 py-14 text-center">
      {icon ? <div className="mb-3 text-ink-faint">{icon}</div> : null}
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

type AlertTone = "info" | "success" | "warning" | "error";

const ALERT_STYLES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: {
    box: "border-line bg-elevated text-ink-muted",
    icon: <Info className="size-4 shrink-0" aria-hidden="true" />,
  },
  success: {
    box: "border-win/30 bg-win/8 text-win",
    icon: <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />,
  },
  // No hue: colour in this system means a prediction's outcome. A warning is
  // marked by a dashed edge and the icon, the same way the `warn` badge is.
  warning: {
    box: "border-dashed border-line-strong bg-elevated text-ink",
    icon: <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />,
  },
  error: {
    box: "border-loss/30 bg-loss/8 text-loss",
    icon: <XCircle className="size-4 shrink-0" aria-hidden="true" />,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
}) {
  const style = ALERT_STYLES[tone];

  return (
    <div
      // Errors are announced; informational notes are not, to avoid chatter.
      role={tone === "error" ? "alert" : undefined}
      className={`flex gap-2.5 rounded-md border px-3.5 py-3 text-sm ${style.box}`}
    >
      {style.icon}
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-elevated ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

/** Loading placeholder matching the ticket card's shape: image, then text. */
export function TicketCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-5 w-3/4" />
        <div className="mt-4 flex items-end justify-between gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-6 w-14" />
        </div>
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">იტვირთება…</span>
      {Array.from({ length: rows }, (_, index) => (
        <TicketCardSkeleton key={index} />
      ))}
    </div>
  );
}

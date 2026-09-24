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

import { Button } from "./Button";

export interface ErrorMessageProps {
  message?: string | null;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorMessage({
  message,
  title,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-foreground ${className ?? ""}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="mt-0.5 size-5 shrink-0 text-danger"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 7.5v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      </svg>
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-semibold">{title}</p> : null}
        <p className={`text-sm break-words ${title ? "mt-0.5" : ""}`}>{message}</p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 bg-background/60"
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

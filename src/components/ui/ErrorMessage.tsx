import { cn } from "@/lib/cn";

import { Button } from "./Button";

export interface ErrorMessageProps {
  message?: string | null;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

function AlertOctagon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5 shrink-0">
      <path
        d="M8.2 2.8h7.6l5.4 5.4v7.6l-5.4 5.4H8.2l-5.4-5.4V8.2l5.4-5.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 7.4v5.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="1.1" fill="currentColor" />
    </svg>
  );
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
      className={cn(
        "flex items-start gap-3 rounded-[0.875rem] border-2 border-danger/45 bg-danger-soft p-3.5 text-foreground",
        className,
      )}
    >
      <span className="mt-0.5 text-danger">
        <AlertOctagon />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="text-sm font-semibold text-foreground">{title}</p> : null}
        <p className={cn("text-sm break-words text-muted-foreground", title ? "mt-0.5" : null)}>
          {message}
        </p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-3 bg-card/70"
          >
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

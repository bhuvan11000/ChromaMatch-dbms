"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

export type ToastVariant = "info" | "success" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss; use 0 to keep the toast until dismissed. */
  durationMs?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "border-border bg-card text-card-foreground",
  success: "border-success/40 bg-success-soft text-foreground",
  error: "border-danger/50 bg-danger-soft text-foreground",
};

const VARIANT_TAG: Record<ToastVariant, string> = {
  info: "text-accent-cyan",
  success: "text-success",
  error: "text-danger",
};

const VARIANT_BADGE: Record<ToastVariant, string> = {
  info: "rounded-full border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan",
  success:
    "border-success/40 bg-success/10 text-success [clip-path:polygon(25%_4%,75%_4%,100%_50%,75%_96%,25%_96%,0%_50%)]",
  error:
    "border-danger/45 bg-danger/10 text-danger [clip-path:polygon(30%_2%,70%_2%,98%_30%,98%_70%,70%_98%,30%_98%,2%_70%,2%_30%)]",
};

const VARIANT_LABEL: Record<ToastVariant, string> = {
  info: "INFO",
  success: "OK",
  error: "ERR",
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "success") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
        <path
          d="m4 10.5 4 4 8-9"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (variant === "error") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
        <path d="M10 4.5v6.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="10" cy="14.6" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-3.5">
      <path d="M10 9v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="10" cy="5.4" r="1.2" fill="currentColor" />
    </svg>
  );
}

let fallbackToastId = 0;

function createToastId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  fallbackToastId += 1;
  return `toast-${Date.now()}-${fallbackToastId}`;
}

function ToastCard({ item, onDismiss }: { item: ToastRecord; onDismiss: (id: string) => void }) {
  const variant = item.variant ?? "info";

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto w-full max-w-sm rounded-[1rem] border-2 p-4 shadow-xl",
        VARIANT_CLASSES[variant],
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-7 shrink-0 items-center justify-center border",
            VARIANT_BADGE[variant],
          )}
        >
          <VariantIcon variant={variant} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-mono text-[10px] font-bold tracking-[0.18em]",
                VARIANT_TAG[variant],
              )}
            >
              [{VARIANT_LABEL[variant]}]
            </span>
            <p className="text-sm font-semibold">{item.title}</p>
          </div>
          {item.description ? (
            <p className="mt-1 text-sm break-words text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          aria-label="Dismiss notification"
          className="-m-1 shrink-0 rounded-[0.4rem] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = createToastId();
      const durationMs = options.durationMs ?? (options.variant === "error" ? 8000 : 5000);

      setToasts((current) => [...current.slice(-3), { ...options, id }]);

      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider.");
  }
  return context;
}

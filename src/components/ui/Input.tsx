"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
}

function FieldErrorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mt-px size-4 shrink-0 text-danger"
    >
      <path
        d="M10 1.8 18.2 10 10 18.2 1.8 10 10 1.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 6.2v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.6" r="1" fill="currentColor" />
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, className, "aria-describedby": ariaDescribedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? `input-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [ariaDescribedBy, hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className="mb-1.5 flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-foreground"
      >
        {label}
        <span aria-hidden="true" className="h-px flex-1 bg-border" style={{ maxWidth: "2.5rem" }} />
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          "w-full rounded-[0.875rem] border-2 bg-input px-3.5 py-2.5 text-sm text-foreground",
          "shadow-[inset_0_2px_4px_rgb(0_0_0/0.16)]",
          "placeholder:text-muted-foreground",
          "transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error
            ? "border-danger focus-visible:border-danger focus-visible:ring-danger/35"
            : "border-input-border hover:border-input-border-strong focus-visible:border-ring",
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger">
          <FieldErrorIcon />
          <span className="break-words">{error}</span>
        </p>
      ) : null}
    </div>
  );
});

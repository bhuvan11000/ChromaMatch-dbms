import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "cm-keycap cm-keycap-primary border border-primary-lip/40 bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary:
    "cm-keycap cm-keycap-secondary border border-border bg-muted text-foreground hover:bg-border",
  outline:
    "cm-keycap cm-keycap-outline border-2 border-border bg-transparent text-foreground hover:border-muted-foreground/50 hover:bg-muted",
  ghost: "border border-transparent bg-transparent text-foreground hover:bg-muted",
  danger:
    "cm-keycap cm-keycap-danger border border-danger-lip/50 bg-danger text-danger-foreground hover:brightness-110",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 rounded-[0.625rem] px-3 py-2 text-xs",
  md: "min-h-11 gap-2 rounded-[0.875rem] px-4 py-2.5 text-sm",
  lg: "min-h-12 gap-2 rounded-[1rem] px-6 py-3 text-base",
  icon: "size-11 rounded-[0.875rem] p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    className,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "group inline-flex items-center justify-center font-display font-semibold tracking-tight whitespace-nowrap select-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        "disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size="sm" decorative /> : null}
      {children}
    </button>
  );
});

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
    "cm-keycap cm-keycap-primary border-border bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary:
    "cm-keycap cm-keycap-secondary border-border bg-muted text-foreground hover:bg-muted-strong",
  outline: "cm-keycap cm-keycap-outline border-border bg-transparent text-foreground hover:bg-card",
  ghost:
    "border-2 border-transparent bg-transparent text-foreground hover:border-border hover:bg-muted",
  danger:
    "cm-keycap cm-keycap-danger border-border bg-danger text-danger-foreground hover:brightness-110",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 rounded-[0.55rem] px-3 py-1.5 text-[0.7rem]",
  md: "min-h-11 gap-2 rounded-[0.7rem] px-4 py-2.5 text-xs",
  lg: "min-h-13 gap-2.5 rounded-[0.8rem] px-6 py-3 text-sm",
  icon: "size-11 rounded-[0.7rem] p-0",
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
        "group inline-flex items-center justify-center font-display font-extrabold tracking-[0.055em] whitespace-nowrap uppercase select-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        "disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
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

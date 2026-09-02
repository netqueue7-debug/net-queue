import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "destructive" | "destructive-link" | "affirmative-link";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground px-4 py-2 shadow-sm hover:opacity-90 active:scale-[0.98]",
  secondary: "border border-border px-4 py-2 hover:border-accent/40 hover:bg-accent/5",
  destructive: "border border-danger text-danger px-4 py-2 hover:bg-danger/10",
  "destructive-link": "text-danger underline underline-offset-2 hover:opacity-80",
  "affirmative-link": "text-success underline underline-offset-2 hover:opacity-80",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button {...props} disabled={disabled || loading} className={`${base} ${variants[variant]} ${className}`}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

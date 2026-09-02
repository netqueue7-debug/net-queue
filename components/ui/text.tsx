import type { ReactNode } from "react";

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}

export function HelperText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

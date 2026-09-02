import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ErrorText, HelperText } from "./text";

const controlClass = "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground";

export function Field({
  label,
  htmlFor,
  children,
  error,
  helper,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string | null;
  helper?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : helper ? <HelperText>{helper}</HelperText> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

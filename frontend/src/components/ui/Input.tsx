import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`h-11 w-full rounded-lg border border-border-subtle bg-surface-primary px-3.5 text-[15px] text-content-primary placeholder:text-content-tertiary focus-visible:border-accent focus-visible:outline-none ${className}`}
      {...props}
    />
  );
});

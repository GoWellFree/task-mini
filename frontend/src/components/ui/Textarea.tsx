import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`w-full resize-none rounded-lg border border-border-subtle bg-surface-primary px-3.5 py-2.5 text-[15px] text-content-primary placeholder:text-content-tertiary focus-visible:border-accent focus-visible:outline-none ${className}`}
        {...props}
      />
    );
  },
);

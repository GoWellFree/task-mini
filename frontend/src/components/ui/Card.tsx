import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-border-subtle bg-surface-elevated ${className}`}
      {...props}
    />
  );
}

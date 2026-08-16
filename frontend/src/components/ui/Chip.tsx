import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  icon?: ReactNode;
}

export function Chip({ children, selected, onClick, onRemove, icon }: ChipProps) {
  const interactive = Boolean(onClick);
  const Component = interactive ? "button" : "div";

  return (
    <Component
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-sm font-medium transition-colors duration-150 ${
        selected
          ? "border-accent bg-accent-soft text-accent"
          : "border-border-subtle bg-surface-primary text-content-secondary active:opacity-70"
      }`}
    >
      {icon}
      <span className="max-w-[160px] truncate">{children}</span>
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Убрать"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onRemove();
            }
          }}
          className="-mr-1 inline-flex h-4 w-4 items-center justify-center opacity-70 hover:opacity-100"
        >
          <X size={12} strokeWidth={2.5} />
        </span>
      )}
    </Component>
  );
}

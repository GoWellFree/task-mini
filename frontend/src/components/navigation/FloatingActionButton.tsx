import { Plus } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { haptics } from "../../lib/haptics";

export function FloatingActionButton({ onClick, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Создать задачу"
      onClick={(e) => {
        haptics.tap("medium");
        onClick?.(e);
      }}
      className={`flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-float transition-transform duration-150 active:scale-95 ${className}`}
      {...props}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  );
}

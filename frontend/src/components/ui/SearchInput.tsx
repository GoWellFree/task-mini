import { Search, X } from "lucide-react";
import type { InputHTMLAttributes } from "react";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange, className = "", ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-11 w-full rounded-lg border border-border-subtle bg-surface-primary pl-10 pr-9 text-[15px] text-content-primary placeholder:text-content-tertiary focus-visible:border-accent focus-visible:outline-none ${className}`}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-content-tertiary hover:text-content-secondary"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

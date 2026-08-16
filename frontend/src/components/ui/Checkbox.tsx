import { Check } from "lucide-react";

export function Checkbox({
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 ${
        checked ? "border-accent bg-accent" : "border-border-subtle bg-surface-primary active:border-accent"
      }`}
    >
      {checked && <Check size={15} strokeWidth={3} className="text-white" />}
    </button>
  );
}

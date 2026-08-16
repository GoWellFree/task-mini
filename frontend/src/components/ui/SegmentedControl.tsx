export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-lg bg-surface-secondary p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
            value === opt.value ? "bg-surface-primary text-content-primary shadow-sm" : "text-content-secondary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

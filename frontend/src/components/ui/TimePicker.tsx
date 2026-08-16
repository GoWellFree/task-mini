import { Clock } from "lucide-react";

/**
 * Wraps the native <input type="time"> rather than building a custom wheel:
 * Telegram's WebView renders the OS's own time picker for it on tap, which
 * is both more familiar to the user and far less code to get right than a
 * bespoke scroll-wheel component.
 */
export function TimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Clock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-border-subtle bg-surface-primary pl-10 pr-3 text-[15px] text-content-primary focus-visible:border-accent focus-visible:outline-none"
      />
    </div>
  );
}

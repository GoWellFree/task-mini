import type { TaskPriority } from "../../types";

// Backend carries 5 values (none/low/medium/high/urgent); "none" is the
// implicit 5th state and intentionally renders nothing, matching the spec's
// "не окрашивать всю карточку, только маленький indicator" guidance — an
// unprioritized task shouldn't compete visually with prioritized ones.
export const PRIORITY_DISPLAY: Record<Exclude<TaskPriority, "none">, { label: string; short: string; dot: string }> = {
  low: { label: "Низкий", short: "P4", dot: "bg-priority-low" },
  medium: { label: "Средний", short: "P3", dot: "bg-priority-medium" },
  high: { label: "Высокий", short: "P2", dot: "bg-priority-high" },
  urgent: { label: "Критический", short: "P1", dot: "bg-priority-critical" },
};

export function PriorityBadge({ priority, compact }: { priority: TaskPriority; compact?: boolean }) {
  if (priority === "none") return null;
  const info = PRIORITY_DISPLAY[priority];

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-content-secondary" title={info.label}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${info.dot}`} aria-hidden />
        {info.short}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-secondary px-2.5 py-1 text-xs font-medium text-content-secondary">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${info.dot}`} aria-hidden />
      {info.label}
    </span>
  );
}

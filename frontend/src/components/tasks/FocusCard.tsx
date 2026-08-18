import { pluralTasks } from "../../lib/pluralize";

export function FocusCard({
  total,
  important,
  overdue,
  progressPercent,
}: {
  total: number;
  important: number;
  overdue: number;
  progressPercent: number;
}) {
  return (
    <div className="mb-4 rounded-lg bg-accent-soft px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Фокус сегодня</p>
      <p className="mt-1 text-sm text-content-secondary">
        <span className="font-semibold text-content-primary">{total}</span> {pluralTasks(total)}
        {important > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-content-primary">{important}</span> важн{important === 1 ? "ая" : "ых"}
          </>
        )}
        {overdue > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-danger">{overdue}</span> просрочен{overdue === 1 ? "а" : "о"}
          </>
        )}
      </p>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-pill bg-white/50">
        <div
          className="h-full rounded-pill bg-accent transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}

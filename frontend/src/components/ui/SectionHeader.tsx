import type { ReactNode } from "react";

export function SectionHeader({
  title,
  count,
  tone = "default",
  action,
}: {
  title: string;
  count?: number;
  tone?: "default" | "danger";
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className={`text-[13px] font-semibold uppercase tracking-wide ${tone === "danger" ? "text-danger" : "text-content-secondary"}`}>
          {title}
        </h2>
        {typeof count === "number" && (
          <span className={`text-[13px] font-semibold ${tone === "danger" ? "text-danger" : "text-content-tertiary"}`}>{count}</span>
        )}
      </div>
      {action}
    </div>
  );
}

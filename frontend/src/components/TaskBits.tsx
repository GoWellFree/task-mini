import { Link } from "react-router-dom";
import type { TaskPriority, TaskStatus, TaskWithWorkspace } from "../types";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Без приоритета",
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочный",
};

// The create/edit UI only offers todo/in_progress/done for now (kanban and a
// full status picker are later work) — the rest are labeled here so any task
// already carrying one of the wider API statuses still displays sensibly.
export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Входящие",
  todo: "К выполнению",
  in_progress: "В работе",
  waiting: "Ожидание",
  review: "На проверке",
  done: "Выполнено",
  cancelled: "Отменено",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  inbox: "bg-zinc-100 text-zinc-700",
  todo: "bg-zinc-100 text-zinc-700",
  in_progress: "bg-amber-100 text-amber-700",
  waiting: "bg-sky-100 text-sky-700",
  review: "bg-violet-100 text-violet-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatDueDate(dueAt: string | null): { text: string; overdue: boolean } {
  if (!dueAt) return { text: "Без срока", overdue: false };
  const date = new Date(dueAt);
  const overdue = date.getTime() < Date.now();
  const text = date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return { text, overdue };
}

export function TaskListItem({ task }: { task: TaskWithWorkspace }) {
  const { text, overdue } = formatDueDate(task.due_at);

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-center justify-between gap-3 rounded-xl bg-tg-secondaryBg p-3.5 active:opacity-70"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{task.title}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-tg-hint">
          {task.workspace?.name && <span className="truncate">{task.workspace.name}</span>}
          <span className={overdue && task.status !== "done" ? "font-medium text-red-600" : undefined}>
            {text}
          </span>
        </div>
      </div>
      <StatusBadge status={task.status} />
    </Link>
  );
}

export function ConfirmDialog({
  open,
  title,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-tg-bg p-5 sm:rounded-2xl">
        <p className="text-base font-medium">{title}</p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl bg-tg-secondaryBg py-3 text-sm font-medium"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-medium text-white"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

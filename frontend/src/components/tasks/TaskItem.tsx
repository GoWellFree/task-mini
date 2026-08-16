import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { PriorityBadge } from "../ui/PriorityBadge";
import { haptics } from "../../lib/haptics";
import type { Task, TaskWithWorkspace } from "../../types";

function formatMeta(task: Pick<Task, "due_at" | "status">): { text: string | null; overdue: boolean } {
  if (!task.due_at) return { text: null, overdue: false };
  const due = new Date(task.due_at);
  const overdue = due.getTime() < Date.now() && task.status !== "done";
  const isToday = due.toDateString() === new Date().toDateString();
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;

  if (overdue) {
    const days = Math.floor((Date.now() - due.getTime()) / 86_400_000);
    return { text: days <= 0 ? "сегодня" : days === 1 ? "вчера" : `${days} дн. назад`, overdue: true };
  }
  if (isToday && hasTime) return { text: due.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }), overdue: false };
  return { text: due.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), overdue: false };
}

export function TaskItem({
  task,
  onToggle,
  showWorkspace = true,
}: {
  task: TaskWithWorkspace;
  onToggle?: (task: TaskWithWorkspace) => void;
  showWorkspace?: boolean;
}) {
  const isDone = task.status === "done";
  const meta = formatMeta(task);
  const workspaceName = showWorkspace ? task.workspace?.name : undefined;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? "Возобновить задачу" : "Выполнить задачу"}
        onClick={(e) => {
          e.preventDefault();
          haptics.success();
          onToggle?.(task);
        }}
        className={`flex h-11 w-11 shrink-0 items-center justify-center ${!onToggle ? "pointer-events-none" : ""}`}
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
            isDone ? "border-success bg-success" : "border-border-subtle"
          }`}
        >
          {isDone && <Check size={14} strokeWidth={3} className="text-white" />}
        </span>
      </button>

      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 py-0.5">
        <p className={`line-clamp-2 text-[15px] font-medium leading-snug ${isDone ? "text-content-tertiary line-through" : "text-content-primary"}`}>
          {task.title}
        </p>
        {(workspaceName || meta.text) && (
          <p className={`mt-0.5 truncate text-[13px] ${meta.overdue ? "font-medium text-danger" : "text-content-tertiary"}`}>
            {[workspaceName, meta.text].filter(Boolean).join(" · ")}
          </p>
        )}
      </Link>

      {!isDone && <PriorityBadge priority={task.priority} compact />}
    </div>
  );
}

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Calendar, Trash2, Flag } from "lucide-react";
import { PriorityBadge, PRIORITY_DISPLAY } from "../ui/PriorityBadge";
import { ActionSheet, type ActionSheetItem } from "../ui/ActionSheet";
import { DatePicker } from "../ui/DatePicker";
import { haptics } from "../../lib/haptics";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../ui/Toast";
import type { Task, TaskPriority, TaskWithWorkspace } from "../../types";

const SWIPE_THRESHOLD = 72;
const LONG_PRESS_MS = 450;

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
  onChanged,
  showWorkspace = true,
}: {
  task: TaskWithWorkspace;
  onToggle?: (task: TaskWithWorkspace) => void;
  /** Called after a swipe/long-press action mutates the task directly (reschedule, priority, delete) so the parent list can refetch. */
  onChanged?: () => void;
  showWorkspace?: boolean;
}) {
  const { showToast } = useToast();
  const isDone = task.status === "done";
  const meta = formatMeta(task);
  const workspaceName = showWorkspace ? task.workspace?.name : undefined;

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const startX = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);

  function clearLongPress() {
    clearTimeout(longPressTimer.current);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!onToggle) return;
    startX.current = e.clientX;
    suppressClick.current = false;
    longPressTimer.current = setTimeout(() => {
      haptics.tap("medium");
      suppressClick.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!onToggle) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 8) clearLongPress();
    if (Math.abs(delta) > 4) {
      suppressClick.current = true;
      setDragging(true);
      setDragX(Math.max(-SWIPE_THRESHOLD * 1.4, Math.min(SWIPE_THRESHOLD * 1.4, delta)));
    }
  }

  function onPointerUp() {
    clearLongPress();
    if (dragX > SWIPE_THRESHOLD) {
      haptics.success();
      onToggle?.(task);
    } else if (dragX < -SWIPE_THRESHOLD) {
      setRescheduleOpen(true);
    }
    setDragging(false);
    setDragX(0);
    setTimeout(() => (suppressClick.current = false), 0);
  }

  async function quickPatch(patch: Record<string, unknown>, successMessage?: string) {
    try {
      await api.patch(`/api/tasks/${task.id}`, { version: task.version, ...patch });
      if (successMessage) showToast(successMessage, { tone: "success" });
      onChanged?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось изменить задачу", { tone: "error" });
    }
  }

  async function quickDelete() {
    try {
      await api.delete(`/api/tasks/${task.id}`);
      showToast("Задача удалена", { tone: "success" });
      onChanged?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось удалить задачу", { tone: "error" });
    }
  }

  const menuItems: ActionSheetItem[] = [
    { label: isDone ? "Возобновить" : "Выполнить", icon: <Check size={18} />, onSelect: () => onToggle?.(task) },
    { label: "Перенести", icon: <Calendar size={18} />, onSelect: () => setRescheduleOpen(true) },
    { label: "Приоритет", icon: <Flag size={18} />, onSelect: () => setPriorityOpen(true) },
    { label: "Удалить", icon: <Trash2 size={18} />, tone: "danger", onSelect: quickDelete },
  ];

  const priorityItems: ActionSheetItem[] = [
    { label: "Без приоритета", onSelect: () => quickPatch({ priority: "none" satisfies TaskPriority }) },
    ...(["low", "medium", "high", "urgent"] as const).map((p) => ({
      label: PRIORITY_DISPLAY[p].label,
      icon: <span className={`h-2 w-2 rounded-full ${PRIORITY_DISPLAY[p].dot}`} />,
      onSelect: () => quickPatch({ priority: p }),
    })),
  ];

  return (
    <div className="relative overflow-hidden">
      {onToggle && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
          <span className={`flex items-center gap-1.5 text-sm font-medium text-success transition-opacity duration-100 ${dragX > 20 ? "opacity-100" : "opacity-0"}`}>
            <Check size={16} /> Выполнить
          </span>
          <span className={`flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity duration-100 ${dragX < -20 ? "opacity-100" : "opacity-0"}`}>
            Перенести <Calendar size={16} />
          </span>
        </div>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 150ms ease-out" }}
        className="relative flex items-center gap-3 bg-surface-primary py-2.5"
      >
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
          <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-150 ${isDone ? "border-success bg-success" : "border-border-subtle"}`}>
            {isDone && <Check size={14} strokeWidth={3} className="text-white" />}
          </span>
        </button>

        <Link
          to={`/tasks/${task.id}`}
          onClick={(e) => {
            if (suppressClick.current) e.preventDefault();
          }}
          className="min-w-0 flex-1 py-0.5"
        >
          <p className={`line-clamp-2 text-[15px] font-medium leading-snug ${isDone ? "text-content-tertiary line-through" : "text-content-primary"}`}>{task.title}</p>
          {(workspaceName || meta.text) && (
            <p className={`mt-0.5 truncate text-[13px] ${meta.overdue ? "font-medium text-danger" : "text-content-tertiary"}`}>
              {[workspaceName, meta.text].filter(Boolean).join(" · ")}
            </p>
          )}
        </Link>

        {!isDone && <PriorityBadge priority={task.priority} compact />}
      </div>

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={task.title} items={menuItems} />
      <ActionSheet open={priorityOpen} onClose={() => setPriorityOpen(false)} title="Приоритет" items={priorityItems} />
      <DatePicker
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        value={task.due_at ? task.due_at.slice(0, 10) : null}
        onChange={(date) => {
          const time = task.due_at ? task.due_at.slice(11, 16) : "00:00";
          quickPatch({ dueAt: date ? new Date(`${date}T${time}`).toISOString() : null }, "Срок изменён");
        }}
      />
    </div>
  );
}

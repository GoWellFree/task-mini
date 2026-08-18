import { useEffect, useMemo, useState } from "react";
import { ListChecks, Calendar, Check, Flag, Trash2, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/ui/PageHeader";
import { SearchInput } from "../components/ui/SearchInput";
import { Chip } from "../components/ui/Chip";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { TaskItemSkeleton } from "../components/ui/Skeleton";
import { ErrorMessage } from "../components/Feedback";
import { TaskItem } from "../components/tasks/TaskItem";
import { ActionSheet, type ActionSheetItem } from "../components/ui/ActionSheet";
import { DatePicker } from "../components/ui/DatePicker";
import { PRIORITY_DISPLAY } from "../components/ui/PriorityBadge";
import { useToast } from "../components/ui/Toast";
import { haptics } from "../lib/haptics";
import { pluralTasks } from "../lib/pluralize";
import { bindTelegramBackButton } from "../lib/telegram";
import type { Task, TaskPriority, TaskWithWorkspace } from "../types";

type SmartFilter = "all" | "today" | "upcoming" | "overdue" | "done";

const FILTERS: { value: SmartFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "today", label: "Сегодня" },
  { value: "upcoming", label: "Предстоящие" },
  { value: "overdue", label: "Просроченные" },
  { value: "done", label: "Выполненные" },
];

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function MyTasks() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<TaskWithWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SmartFilter>("all");
  const [query, setQuery] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkPriorityOpen, setBulkPriorityOpen] = useState(false);
  const [bulkRescheduleOpen, setBulkRescheduleOpen] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await api.get<{ tasks: TaskWithWorkspace[] }>("/api/tasks/my");
      setTasks(res.tasks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить задачи");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleTask(task: TaskWithWorkspace) {
    if (!tasks) return;
    const nextStatus = task.status === "done" ? "todo" : "done";
    setTasks((prev) => prev!.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      const res = await api.patch<{ task: Task }>(`/api/tasks/${task.id}`, { version: task.version, status: nextStatus });
      setTasks((prev) => prev!.map((t) => (t.id === task.id ? { ...t, ...res.task } : t)));
    } catch (err) {
      setTasks((prev) => prev!.map((t) => (t.id === task.id ? task : t)));
      haptics.error();
      showToast(err instanceof ApiError ? err.message : "Не удалось обновить задачу", { tone: "error" });
    }
  }

  const filtered = useMemo(() => {
    if (!tasks) return null;
    const now = new Date();
    let result: TaskWithWorkspace[];

    switch (filter) {
      case "today":
        result = tasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at) >= startOfDay(now) && new Date(t.due_at) <= endOfDay(now));
        break;
      case "upcoming":
        result = tasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at) > endOfDay(now));
        break;
      case "overdue":
        result = tasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at) < startOfDay(now));
        break;
      case "done":
        result = tasks.filter((t) => t.status === "done");
        break;
      default:
        result = tasks.filter((t) => t.status !== "done");
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  }, [tasks, filter, query]);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // MyTasks is a top-level tab (no PageLayout/onBack), so it never wires up
  // a Telegram BackButton on its own — without this, pressing the native
  // back button/swipe while selecting does nothing, and the only way out is
  // the in-app close (X) button.
  useEffect(() => {
    if (!selectMode) return;
    return bindTelegramBackButton(exitSelectMode);
  }, [selectMode]);

  function toggleSelected(task: TaskWithWorkspace) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }

  const selectedTasks = useMemo(() => (filtered ?? []).filter((t) => selectedIds.has(t.id)), [filtered, selectedIds]);

  /**
   * Fans out to the existing single-task endpoints (no new backend surface).
   * On full success the selection clears with a plain confirmation; on any
   * failure the selection narrows to just the failed tasks (instead of
   * clearing) so the user can immediately retry rather than having to
   * reopen the list and guess which ones didn't go through.
   */
  async function runBulk(label: string, run: (task: TaskWithWorkspace) => Promise<void>) {
    if (selectedTasks.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(selectedTasks.map(run));
    setBulkBusy(false);
    const failedTasks = selectedTasks.filter((_, i) => results[i]!.status === "rejected");
    const succeeded = results.length - failedTasks.length;
    if (failedTasks.length === 0) {
      haptics.success();
      showToast(`${label}: ${succeeded} ${pluralTasks(succeeded)}`, { tone: "success" });
      exitSelectMode();
    } else {
      haptics.error();
      showToast(`${label}: ${succeeded} из ${results.length}, ${failedTasks.length} с ошибкой`, { tone: succeeded > 0 ? "success" : "error" });
      setSelectedIds(new Set(failedTasks.map((t) => t.id)));
    }
    await load();
  }

  async function bulkComplete() {
    await runBulk("Выполнено", (t) => api.patch(`/api/tasks/${t.id}`, { version: t.version, status: "done" }));
  }

  async function bulkDelete() {
    setConfirmingBulkDelete(false);
    await runBulk("Удалено", (t) => api.delete(`/api/tasks/${t.id}`));
  }

  async function bulkSetPriority(priority: TaskPriority) {
    setBulkPriorityOpen(false);
    await runBulk("Приоритет изменён", (t) => api.patch(`/api/tasks/${t.id}`, { version: t.version, priority }));
  }

  async function bulkReschedule(date: string | null) {
    setBulkRescheduleOpen(false);
    await runBulk("Срок изменён", (t) => {
      const dueAt = date ? new Date(`${date}T00:00`).toISOString() : null;
      return api.patch(`/api/tasks/${t.id}`, { version: t.version, dueAt });
    });
  }

  const priorityItems: ActionSheetItem[] = [
    { label: "Без приоритета", onSelect: () => bulkSetPriority("none") },
    ...(["low", "medium", "high", "urgent"] as const).map((p) => ({
      label: PRIORITY_DISPLAY[p].label,
      icon: <span className={`h-2 w-2 rounded-full ${PRIORITY_DISPLAY[p].dot}`} />,
      onSelect: () => bulkSetPriority(p),
    })),
  ];

  return (
    <div className="mx-auto min-h-full w-full max-w-content px-4 pb-32 pt-[calc(env(safe-area-inset-top)+16px)]">
      <PageHeader
        title="Задачи"
        action={
          filtered && filtered.length > 0 ? (
            <Button size="sm" variant={selectMode ? "secondary" : "ghost"} onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
              {selectMode ? "Отмена" : "Выбрать"}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Поиск по задачам" />
      </div>

      {error && <ErrorMessage message={error} onRetry={load} />}

      {!error && !filtered && (
        <>
          <TaskItemSkeleton />
          <TaskItemSkeleton />
          <TaskItemSkeleton />
        </>
      )}

      {!error && filtered && filtered.length === 0 && (
        <EmptyState icon={<ListChecks size={28} />} title="Ничего не найдено" hint="Попробуйте другой фильтр или запрос" />
      )}

      {filtered && filtered.length > 0 && (
        <div className="flex flex-col divide-y divide-border-subtle">
          {filtered.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              onToggle={toggleTask}
              onChanged={load}
              selectMode={selectMode}
              selected={selectedIds.has(t.id)}
              onSelectToggle={toggleSelected}
            />
          ))}
        </div>
      )}

      {selectMode && (
        <div className="animate-nova-slide-up fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface-primary pb-[env(safe-area-inset-bottom)] shadow-float">
          <div className="mx-auto flex max-w-content items-center gap-1 px-2 py-2">
            <button
              onClick={exitSelectMode}
              aria-label="Закрыть выбор"
              className="flex h-11 w-11 shrink-0 items-center justify-center text-content-secondary"
            >
              <X size={20} />
            </button>
            <span className="shrink-0 whitespace-nowrap px-1 text-sm font-medium text-content-secondary">{selectedIds.size} выбрано</span>
            <BulkBarButton icon={<Check size={18} />} label="Выполнить" disabled={selectedIds.size === 0 || bulkBusy} onClick={bulkComplete} />
            <BulkBarButton icon={<Calendar size={18} />} label="Срок" disabled={selectedIds.size === 0 || bulkBusy} onClick={() => setBulkRescheduleOpen(true)} />
            <BulkBarButton icon={<Flag size={18} />} label="Приоритет" disabled={selectedIds.size === 0 || bulkBusy} onClick={() => setBulkPriorityOpen(true)} />
            <BulkBarButton icon={<Trash2 size={18} />} label="Удалить" tone="danger" disabled={selectedIds.size === 0 || bulkBusy} onClick={() => setConfirmingBulkDelete(true)} />
          </div>
        </div>
      )}

      <ActionSheet
        open={confirmingBulkDelete}
        onClose={() => setConfirmingBulkDelete(false)}
        title={`Удалить ${selectedIds.size} ${selectedIds.size === 1 ? "задачу" : pluralTasks(selectedIds.size)}? Это действие необратимо.`}
        items={[{ label: "Удалить", tone: "danger", onSelect: bulkDelete }]}
      />
      <ActionSheet open={bulkPriorityOpen} onClose={() => setBulkPriorityOpen(false)} title="Приоритет" items={priorityItems} />
      <DatePicker open={bulkRescheduleOpen} onClose={() => setBulkRescheduleOpen(false)} value={undefined} onChange={bulkReschedule} />
    </div>
  );
}

function BulkBarButton({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium transition-colors duration-150 active:bg-surface-secondary disabled:opacity-35 ${
        tone === "danger" ? "text-danger" : "text-content-primary"
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

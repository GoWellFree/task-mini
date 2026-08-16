import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/ui/PageHeader";
import { SearchInput } from "../components/ui/SearchInput";
import { Chip } from "../components/ui/Chip";
import { EmptyState } from "../components/ui/EmptyState";
import { TaskItemSkeleton } from "../components/ui/Skeleton";
import { ErrorMessage } from "../components/Feedback";
import { TaskItem } from "../components/tasks/TaskItem";
import { useToast } from "../components/ui/Toast";
import { haptics } from "../lib/haptics";
import type { Task, TaskWithWorkspace } from "../types";

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
    let result = tasks;

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

  return (
    <div className="mx-auto min-h-full w-full max-w-content px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
      <PageHeader title="Задачи" />

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
            <TaskItem key={t.id} task={t} onToggle={toggleTask} />
          ))}
        </div>
      )}
    </div>
  );
}

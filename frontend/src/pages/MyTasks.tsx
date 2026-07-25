import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage, EmptyState } from "../components/Feedback";
import { STATUS_LABELS, TaskListItem } from "../components/TaskBits";
import type { Task, TaskStatus } from "../types";

const FILTERS: Array<TaskStatus | "all"> = ["all", "todo", "in_progress", "done"];

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");

  async function load() {
    setError(null);
    try {
      const res = await api.get<{ tasks: Task[] }>("/api/tasks/my");
      setTasks(res.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить задачи");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = tasks?.filter((t) => filter === "all" || t.status === filter);

  return (
    <PageLayout title="Мои задачи">
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
              filter === f ? "bg-tg-button text-tg-buttonText" : "bg-tg-secondaryBg text-tg-hint"
            }`}
          >
            {f === "all" ? "Все" : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {error && <ErrorMessage message={error} onRetry={load} />}
      {!error && !tasks && <Loading />}
      {!error && tasks && filtered && filtered.length === 0 && (
        <EmptyState title="Нет задач" hint="Задачи, назначенные вам, появятся здесь" />
      )}
      {filtered && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <TaskListItem key={t.id} task={t} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}

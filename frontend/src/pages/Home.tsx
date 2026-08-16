import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, PartyPopper } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useQuickAdd } from "../lib/QuickAddContext";
import { useToast } from "../components/ui/Toast";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { TaskItemSkeleton } from "../components/ui/Skeleton";
import { SectionHeader } from "../components/ui/SectionHeader";
import { ErrorMessage } from "../components/Feedback";
import { FocusCard } from "../components/tasks/FocusCard";
import { TaskItem } from "../components/tasks/TaskItem";
import { haptics } from "../lib/haptics";
import type { Task, TaskWithWorkspace } from "../types";

const LATER_LIMIT = 5;

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
function isToday(iso: string): boolean {
  const d = new Date(iso);
  return d >= startOfDay(new Date()) && d <= endOfDay(new Date());
}

export function Home() {
  const { user } = useAuth();
  const { openQuickAdd } = useQuickAdd();
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<TaskWithWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

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
    // Optimistic: flip immediately, roll back only on failure.
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

  const grouped = useMemo(() => {
    if (!tasks) return null;
    const active = tasks.filter((t) => t.status !== "done");
    const completedToday = tasks.filter(
      (t) => t.status === "done" && t.completed_at && isToday(t.completed_at),
    );

    const overdue = active
      .filter((t) => t.due_at && new Date(t.due_at) < startOfDay(new Date()))
      .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

    const today = active
      .filter((t) => t.due_at && isToday(t.due_at))
      .sort((a, b) => {
        const critical = (t: TaskWithWorkspace) => (t.priority === "urgent" ? 0 : 1);
        if (critical(a) !== critical(b)) return critical(a) - critical(b);
        return new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime();
      });

    const later = active
      .filter((t) => !t.due_at || new Date(t.due_at) > endOfDay(new Date()))
      .sort((a, b) => {
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      });

    const important = [...overdue, ...today].filter((t) => t.priority === "high" || t.priority === "urgent").length;
    const totalActive = overdue.length + today.length;
    const progress = totalActive + completedToday.length > 0 ? Math.round((completedToday.length / (totalActive + completedToday.length)) * 100) : 0;

    return { overdue, today, later, completedToday, important, totalActive, progress };
  }, [tasks]);

  if (error) {
    return (
      <div className="mx-auto min-h-full w-full max-w-content px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
        <PageHeader title="Сегодня" />
        <ErrorMessage message={error} onRetry={load} />
      </div>
    );
  }

  const greeting = `Привет, ${user?.first_name ?? ""}`;
  const dateLabel = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  return (
    <div className="mx-auto min-h-full w-full max-w-content px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
      <PageHeader title={greeting} subtitle={dateLabel} />

      {!grouped ? (
        <>
          <div className="mb-4 h-[92px] animate-nova-skeleton rounded-lg bg-surface-secondary" />
          <TaskItemSkeleton />
          <TaskItemSkeleton />
          <TaskItemSkeleton />
        </>
      ) : (
        <>
          {grouped.totalActive + grouped.completedToday.length > 0 && (
            <FocusCard
              total={grouped.totalActive}
              important={grouped.important}
              overdue={grouped.overdue.length}
              progressPercent={grouped.progress}
            />
          )}

          <button
            onClick={() => openQuickAdd({ onCreated: load })}
            className="mb-5 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-subtle text-sm font-medium text-content-secondary active:bg-surface-secondary"
          >
            + Добавить задачу
          </button>

          {grouped.overdue.length > 0 && (
            <section className="mb-5">
              <SectionHeader title="Просрочено" count={grouped.overdue.length} tone="danger" />
              <div className="flex flex-col divide-y divide-border-subtle">
                {grouped.overdue.map((t) => (
                  <TaskItem key={t.id} task={t} onToggle={toggleTask} onChanged={load} />
                ))}
              </div>
            </section>
          )}

          <section className="mb-5">
            <SectionHeader title="Сегодня" count={grouped.today.length || undefined} />
            {grouped.today.length === 0 && grouped.overdue.length === 0 ? (
              <EmptyState
                icon={<PartyPopper size={28} />}
                title="Все выполнено 🎉"
                hint="На сегодня задач больше нет. Можно спокойно переключиться на что-нибудь приятное."
              />
            ) : grouped.today.length === 0 ? (
              <p className="py-3 text-sm text-content-tertiary">Ничего не запланировано на сегодня.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border-subtle">
                {grouped.today.map((t) => (
                  <TaskItem key={t.id} task={t} onToggle={toggleTask} onChanged={load} />
                ))}
              </div>
            )}
          </section>

          {grouped.later.length > 0 && (
            <section className="mb-5">
              <SectionHeader
                title="Позже"
                action={
                  <Link to="/my-tasks" className="text-xs font-medium text-accent">
                    Все задачи
                  </Link>
                }
              />
              <div className="flex flex-col divide-y divide-border-subtle">
                {grouped.later.slice(0, LATER_LIMIT).map((t) => (
                  <TaskItem key={t.id} task={t} onToggle={toggleTask} onChanged={load} />
                ))}
              </div>
            </section>
          )}

          {grouped.completedToday.length > 0 && (
            <section>
              <button
                onClick={() => setShowCompleted((s) => !s)}
                className="flex w-full items-center justify-between py-2 text-[13px] font-semibold uppercase tracking-wide text-content-tertiary"
              >
                <span>
                  Выполнено сегодня <span className="text-content-tertiary">{grouped.completedToday.length}</span>
                </span>
                <ChevronRight size={16} className={`transition-transform duration-150 ${showCompleted ? "rotate-90" : ""}`} />
              </button>
              {showCompleted && (
                <div className="flex flex-col divide-y divide-border-subtle">
                  {grouped.completedToday.map((t) => (
                    <TaskItem key={t.id} task={t} onToggle={toggleTask} onChanged={load} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

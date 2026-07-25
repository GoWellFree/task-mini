import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage, EmptyState } from "../components/Feedback";
import { TaskListItem } from "../components/TaskBits";
import type { Task, Workspace } from "../types";

export function Home() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [tasksRes, workspacesRes] = await Promise.all([
        api.get<{ tasks: Task[] }>("/api/tasks/my"),
        api.get<{ workspaces: Workspace[] }>("/api/workspaces"),
      ]);
      setTasks(tasksRes.tasks);
      setWorkspaces(workspacesRes.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить данные");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <PageLayout title="Task Mini"><ErrorMessage message={error} onRetry={load} /></PageLayout>;
  if (!tasks || !workspaces) return <PageLayout title="Task Mini"><Loading /></PageLayout>;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const todayTasks = tasks.filter(
    (t) => t.due_at && new Date(t.due_at) >= startOfToday && new Date(t.due_at) <= today && t.status !== "done",
  );
  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < startOfToday && t.status !== "done");

  return (
    <PageLayout title={`Привет, ${user?.first_name ?? ""}!`}>
      <Link
        to="/tasks/new"
        className="mb-5 block w-full rounded-xl bg-tg-button py-3 text-center text-sm font-medium text-tg-buttonText"
      >
        + Новая задача
      </Link>

      {overdueTasks.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-medium text-red-600">Просроченные</h2>
          <div className="flex flex-col gap-2">
            {overdueTasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-medium text-tg-hint">Задачи на сегодня</h2>
        {todayTasks.length === 0 ? (
          <EmptyState title="На сегодня задач нет" />
        ) : (
          <div className="flex flex-col gap-2">
            {todayTasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-tg-hint">Рабочие группы</h2>
          <Link to="/workspaces" className="text-sm text-tg-link">
            Все
          </Link>
        </div>
        {workspaces.length === 0 ? (
          <EmptyState title="Пока нет групп" hint="Создайте группу, чтобы начать" />
        ) : (
          <div className="flex flex-col gap-2">
            {workspaces.slice(0, 3).map((w) => (
              <Link
                key={w.id}
                to={`/workspaces/${w.id}`}
                className="rounded-xl bg-tg-secondaryBg p-3.5 font-medium active:opacity-70"
              >
                {w.name}
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage, EmptyState } from "../components/Feedback";
import { TaskListItem } from "../components/TaskBits";
import type { Task, Workspace, WorkspaceMemberWithUser } from "../types";

export function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const [workspaceRes, membersRes, tasksRes] = await Promise.all([
        api.get<{ workspace: Workspace }>(`/api/workspaces/${id}`),
        api.get<{ members: WorkspaceMemberWithUser[] }>(`/api/workspaces/${id}/members`),
        api.get<{ tasks: Task[] }>(`/api/workspaces/${id}/tasks`),
      ]);
      setWorkspace(workspaceRes.workspace);
      setMembers(membersRes.members);
      setTasks(tasksRes.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить группу");
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function copyInviteLink() {
    if (!workspace) return;
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string;
    const link = `https://t.me/${botUsername}/app?startapp=invite_${workspace.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (error) return <PageLayout title="Группа" onBack><ErrorMessage message={error} onRetry={load} /></PageLayout>;
  if (!workspace || !members || !tasks) return <PageLayout title="Группа" onBack><Loading /></PageLayout>;

  return (
    <PageLayout title={workspace.name} onBack>
      <div className="mb-5 flex gap-2">
        <Link
          to={`/tasks/new?workspaceId=${workspace.id}`}
          className="flex-1 rounded-xl bg-tg-button py-2.5 text-center text-sm font-medium text-tg-buttonText"
        >
          + Новая задача
        </Link>
        {workspace.type !== "personal" && (
          <button
            onClick={copyInviteLink}
            className="flex-1 rounded-xl bg-tg-secondaryBg py-2.5 text-sm font-medium"
          >
            {copied ? "Скопировано ✓" : "Пригласить"}
          </button>
        )}
      </div>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-medium text-tg-hint">Участники ({members.length})</h2>
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl bg-tg-secondaryBg p-3">
              <span className="text-sm">
                {m.user.first_name} {m.user.last_name ?? ""}
                {m.user.username && <span className="text-tg-hint"> · @{m.user.username}</span>}
              </span>
              {m.role === "owner" && (
                <span className="rounded-full bg-tg-button/10 px-2 py-0.5 text-xs text-tg-link">Владелец</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-tg-hint">Задачи группы</h2>
        {tasks.length === 0 ? (
          <EmptyState title="Пока нет задач" />
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>
    </PageLayout>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage } from "../components/Feedback";
import { STATUS_LABELS, StatusBadge, ConfirmDialog } from "../components/TaskBits";
import type { Task, TaskStatus, WorkspaceMemberWithUser } from "../types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const res = await api.get<{ task: Task }>(`/api/tasks/${id}`);
      setTask(res.task);
      const membersRes = await api.get<{ members: WorkspaceMemberWithUser[] }>(
        `/api/workspaces/${res.task.workspace_id}/members`,
      );
      setMembers(membersRes.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить задачу");
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function updateStatus(status: TaskStatus) {
    if (!task) return;
    setUpdating(true);
    try {
      const res = await api.patch<{ task: Task }>(`/api/tasks/${task.id}`, { status });
      setTask(res.task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось обновить статус");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      navigate("/my-tasks", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить задачу");
      setConfirmingDelete(false);
    }
  }

  if (error) return <PageLayout title="Задача" onBack><ErrorMessage message={error} onRetry={load} /></PageLayout>;
  if (!task) return <PageLayout title="Задача" onBack><Loading /></PageLayout>;

  const assignee = members.find((m) => m.user_id === task.assignee_id);
  const isManager = task.creator_id === user?.id || members.find((m) => m.user_id === user?.id)?.role === "owner";
  const canDelete = isManager;
  const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]!;

  return (
    <PageLayout title="Задача" onBack>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold">{task.title}</h2>
        <StatusBadge status={task.status} />
      </div>

      {task.description && <p className="mt-3 whitespace-pre-wrap text-sm text-tg-hint">{task.description}</p>}

      <div className="mt-5 flex flex-col gap-3 rounded-xl bg-tg-secondaryBg p-4 text-sm">
        <Row label="Исполнитель" value={assignee ? `${assignee.user.first_name} ${assignee.user.last_name ?? ""}` : "Не назначен"} />
        <Row
          label="Срок"
          value={
            task.due_at
              ? new Date(task.due_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
              : "Не указан"
          }
        />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={() => updateStatus(nextStatus)}
          disabled={updating || task.status === "done"}
          className="rounded-xl bg-tg-secondaryBg py-3 text-sm font-medium disabled:opacity-50"
        >
          {updating ? "Обновление..." : `Изменить статус на «${STATUS_LABELS[nextStatus]}»`}
        </button>
        {task.status !== "done" && (
          <button
            onClick={() => updateStatus("done")}
            disabled={updating}
            className="rounded-xl bg-tg-button py-3 text-sm font-medium text-tg-buttonText disabled:opacity-50"
          >
            Выполнено
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="rounded-xl py-3 text-sm font-medium text-red-600"
          >
            Удалить задачу
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Удалить эту задачу? Это действие необратимо."
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </PageLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-tg-hint">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

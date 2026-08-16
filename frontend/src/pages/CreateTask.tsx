import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import type { RecurrenceRule, Task, TaskStatus, Workspace, WorkspaceMemberWithUser } from "../types";

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно",
  yearly: "Ежегодно",
};

export function CreateTask() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedWorkspaceId = searchParams.get("workspaceId") ?? "";

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [workspaceId, setWorkspaceId] = useState(preselectedWorkspaceId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | "">("");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ workspaces: Workspace[] }>("/api/workspaces").then((res) => {
      setWorkspaces(res.workspaces);
      if (!workspaceId && res.workspaces[0]) setWorkspaceId(res.workspaces[0].id);
    });
  }, []);

  useEffect(() => {
    if (!workspaceId) {
      setMembers([]);
      return;
    }
    api
      .get<{ members: WorkspaceMemberWithUser[] }>(`/api/workspaces/${workspaceId}/members`)
      .then((res) => setMembers(res.members))
      .catch(() => setMembers([]));
  }, [workspaceId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!workspaceId || !title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const dueAt = date ? new Date(`${date}T${time || "00:00"}`).toISOString() : undefined;
      const res = await api.post<{ task: Task }>("/api/tasks", {
        workspaceId,
        title,
        description: description || undefined,
        assigneeId: assigneeId || undefined,
        status,
        dueAt,
        // Only meaningful with a due date to anchor the recurrence — the
        // backend rejects a rule with none, so it's kept hidden until one is set.
        ...(dueAt && recurrenceRule
          ? {
              recurrenceRule,
              recurrenceInterval: Number(recurrenceInterval) || 1,
              ...(recurrenceUntil ? { recurrenceUntil: new Date(recurrenceUntil).toISOString() } : {}),
            }
          : {}),
      });
      navigate(`/tasks/${res.task.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать задачу");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout title="Новая задача" onBack>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Рабочая группа">
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
            required
          >
            <option value="" disabled>
              Выберите группу
            </option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Название">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например, подготовить отчёт"
            className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
            required
          />
        </Field>

        <Field label="Описание">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание (необязательно)"
            rows={3}
            className="w-full resize-none rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
          />
        </Field>

        <Field label="Исполнитель">
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
          >
            <option value="">Не назначен</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user.first_name} {m.user.last_name ?? ""}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex gap-3">
          <Field label="Дата" className="flex-1">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
            />
          </Field>
          <Field label="Время" className="flex-1">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
            />
          </Field>
        </div>

        {date && (
          <Field label="Повторение">
            <select
              value={recurrenceRule}
              onChange={(e) => setRecurrenceRule(e.target.value as RecurrenceRule | "")}
              className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
            >
              <option value="">Не повторяется</option>
              {(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map((rule) => (
                <option key={rule} value={rule}>
                  {RECURRENCE_LABELS[rule]}
                </option>
              ))}
            </select>
          </Field>
        )}

        {date && recurrenceRule && (
          <div className="flex gap-3">
            <Field label="Каждые N раз" className="flex-1">
              <input
                type="number"
                min={1}
                max={365}
                value={recurrenceInterval}
                onChange={(e) => setRecurrenceInterval(e.target.value)}
                className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
              />
            </Field>
            <Field label="Повторять до (необязательно)" className="flex-1">
              <input
                type="date"
                value={recurrenceUntil}
                onChange={(e) => setRecurrenceUntil(e.target.value)}
                className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
              />
            </Field>
          </div>
        )}

        <Field label="Статус">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="w-full rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm"
          >
            <option value="todo">К выполнению</option>
            <option value="in_progress">В работе</option>
            <option value="done">Выполнено</option>
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !workspaceId || !title.trim()}
          className="mt-2 rounded-xl bg-tg-button py-3 text-sm font-medium text-tg-buttonText disabled:opacity-50"
        >
          {submitting ? "Создание..." : "Создать задачу"}
        </button>
      </form>
    </PageLayout>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-sm font-medium text-tg-hint">{label}</span>
      {children}
    </label>
  );
}

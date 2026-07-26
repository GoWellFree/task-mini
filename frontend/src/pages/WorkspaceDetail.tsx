import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage, EmptyState } from "../components/Feedback";
import { PRIORITY_LABELS, STATUS_LABELS, TaskListItem } from "../components/TaskBits";
import type { Label, Project, Task, TaskPriority, TaskStatus, Workspace, WorkspaceMemberWithUser } from "../types";
import { TASK_PRIORITY_VALUES, TASK_STATUS_VALUES } from "../types";

interface Filters {
  status: TaskStatus | "";
  priority: TaskPriority | "";
  projectId: string;
  assigneeId: string;
  labelId: string;
  dueBefore: string;
}

const EMPTY_FILTERS: Filters = { status: "", priority: "", projectId: "", assigneeId: "", labelId: "", dueBefore: "" };

export function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  async function loadWorkspace() {
    if (!id) return;
    setError(null);
    try {
      const [workspaceRes, membersRes, projectsRes, labelsRes] = await Promise.all([
        api.get<{ workspace: Workspace }>(`/api/workspaces/${id}`),
        api.get<{ members: WorkspaceMemberWithUser[] }>(`/api/workspaces/${id}/members`),
        api.get<{ projects: Project[] }>(`/api/v1/workspaces/${id}/projects`),
        api.get<{ labels: Label[] }>(`/api/v1/workspaces/${id}/labels`),
      ]);
      setWorkspace(workspaceRes.workspace);
      setMembers(membersRes.members);
      setProjects(projectsRes.projects);
      setLabels(labelsRes.labels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить группу");
    }
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
    if (filters.labelId) params.set("labelId", filters.labelId);
    if (filters.dueBefore) params.set("dueBefore", new Date(filters.dueBefore).toISOString());
    const str = params.toString();
    return str ? `?${str}` : "";
  }, [query, filters]);

  async function loadTasks() {
    if (!id) return;
    try {
      const tasksRes = await api.get<{ tasks: Task[] }>(`/api/workspaces/${id}/tasks${queryString}`);
      setTasks(tasksRes.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить задачи");
    }
  }

  useEffect(() => {
    loadWorkspace();
  }, [id]);

  // Debounced: re-fetching on every keystroke of the search box would spam
  // the search endpoint (and its FTS/trigram fallback) for no benefit.
  useEffect(() => {
    const handle = setTimeout(loadTasks, 300);
    return () => clearTimeout(handle);
  }, [id, queryString]);

  function copyInviteLink() {
    if (!workspace) return;
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string;
    const link = `https://t.me/${botUsername}/app?startapp=invite_${workspace.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (error) return <PageLayout title="Группа" onBack><ErrorMessage message={error} onRetry={loadWorkspace} /></PageLayout>;
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
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-tg-hint">Задачи группы</h2>
          <button
            onClick={() => setShowFilters((s) => !s)}
            className={`text-xs font-medium ${hasActiveFilters ? "text-tg-link" : "text-tg-hint"}`}
          >
            Фильтры{hasActiveFilters ? " ●" : ""}
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по задачам..."
          className="mb-2 w-full rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-sm"
        />

        {showFilters && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-tg-secondaryBg p-3">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as TaskStatus | "" }))}
              className="rounded-lg border border-tg-hint/30 bg-tg-bg px-2 py-1.5 text-sm"
            >
              <option value="">Любой статус</option>
              {TASK_STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as TaskPriority | "" }))}
              className="rounded-lg border border-tg-hint/30 bg-tg-bg px-2 py-1.5 text-sm"
            >
              <option value="">Любой приоритет</option>
              {TASK_PRIORITY_VALUES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>

            {projects.length > 0 && (
              <select
                value={filters.projectId}
                onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
                className="rounded-lg border border-tg-hint/30 bg-tg-bg px-2 py-1.5 text-sm"
              >
                <option value="">Любой проект</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={filters.assigneeId}
              onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
              className="rounded-lg border border-tg-hint/30 bg-tg-bg px-2 py-1.5 text-sm"
            >
              <option value="">Любой исполнитель</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user.first_name} {m.user.last_name ?? ""}
                </option>
              ))}
            </select>

            {labels.length > 0 && (
              <select
                value={filters.labelId}
                onChange={(e) => setFilters((f) => ({ ...f, labelId: e.target.value }))}
                className="rounded-lg border border-tg-hint/30 bg-tg-bg px-2 py-1.5 text-sm"
              >
                <option value="">Любая метка</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="date"
              value={filters.dueBefore}
              onChange={(e) => setFilters((f) => ({ ...f, dueBefore: e.target.value }))}
              className="rounded-lg border border-tg-hint/30 bg-tg-bg px-2 py-1.5 text-sm"
            />

            {hasActiveFilters && (
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="col-span-2 rounded-lg bg-tg-bg py-1.5 text-xs font-medium text-tg-hint"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}

        {tasks.length === 0 ? (
          <EmptyState title={query.trim() || hasActiveFilters ? "Ничего не найдено" : "Пока нет задач"} />
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

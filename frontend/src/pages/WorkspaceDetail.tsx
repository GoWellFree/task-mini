import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MoreHorizontal, Plus, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage } from "../components/Feedback";
import { EmptyState } from "../components/ui/EmptyState";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { SearchInput } from "../components/ui/SearchInput";
import { PriorityBadge, PRIORITY_DISPLAY } from "../components/ui/PriorityBadge";
import { IconButton } from "../components/ui/IconButton";
import { ActionSheet, type ActionSheetItem } from "../components/ui/ActionSheet";
import { BottomSheet } from "../components/ui/BottomSheet";
import { TaskItem } from "../components/tasks/TaskItem";
import { TeamPanel } from "../components/team/TeamPanel";
import { useQuickAdd } from "../lib/QuickAddContext";
import { useToast } from "../components/ui/Toast";
import type { Label, Project, Task, TaskPriority, TaskStatus, Workspace, WorkspaceMemberWithUser } from "../types";
import { TASK_PRIORITY_VALUES } from "../types";

interface Filters {
  status: TaskStatus | "";
  priority: TaskPriority | "";
  projectId: string;
  assigneeId: string;
  labelId: string;
  dueBefore: string;
}

const EMPTY_FILTERS: Filters = { status: "", priority: "", projectId: "", assigneeId: "", labelId: "", dueBefore: "" };

const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "К выполнению" },
  { status: "in_progress", label: "В работе" },
  { status: "done", label: "Готово" },
];

export function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const { openQuickAdd } = useQuickAdd();
  const { showToast } = useToast();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board" | "team">("list");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить проект");
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
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить задачи");
    }
  }

  useEffect(() => {
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const handle = setTimeout(loadTasks, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, queryString]);

  async function toggleTask(task: Task) {
    if (!tasks) return;
    const nextStatus = task.status === "done" ? "todo" : "done";
    setTasks((prev) => prev!.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      const res = await api.patch<{ task: Task }>(`/api/tasks/${task.id}`, { version: task.version, status: nextStatus });
      setTasks((prev) => prev!.map((t) => (t.id === task.id ? res.task : t)));
    } catch (err) {
      setTasks((prev) => prev!.map((t) => (t.id === task.id ? task : t)));
      showToast(err instanceof ApiError ? err.message : "Не удалось обновить задачу", { tone: "error" });
    }
  }

  async function moveTask(task: Task, status: TaskStatus) {
    if (!tasks) return;
    try {
      const res = await api.patch<{ task: Task }>(`/api/tasks/${task.id}`, { version: task.version, status });
      setTasks((prev) => prev!.map((t) => (t.id === task.id ? res.task : t)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось переместить задачу", { tone: "error" });
    }
  }

  function copyInviteLink() {
    if (!workspace) return;
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string;
    const link = `https://t.me/${botUsername}/app?startapp=invite_${workspace.invite_code}`;
    navigator.clipboard.writeText(link).then(() => showToast("Ссылка скопирована", { tone: "success" }));
  }

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (error) return <PageLayout title="Проект" onBack><ErrorMessage message={error} onRetry={loadWorkspace} /></PageLayout>;
  if (!workspace || !members || !tasks) return <PageLayout title="Проект" onBack><Loading /></PageLayout>;

  const grouped = BOARD_COLUMNS.map((col) => ({ ...col, tasks: tasks.filter((t) => t.status === col.status) }));
  const otherStatusTasks = tasks.filter((t) => !BOARD_COLUMNS.some((c) => c.status === t.status));

  const menuItems: ActionSheetItem[] = [
    ...(workspace.type !== "personal" ? [{ label: "Пригласить участника", onSelect: copyInviteLink }] : []),
  ];

  return (
    <PageLayout
      title={workspace.name}
      onBack
      headerAction={
        menuItems.length > 0 && <IconButton icon={<MoreHorizontal size={20} />} aria-label="Ещё" onClick={() => setMenuOpen(true)} />
      }
    >
      <p className="mb-3 text-sm text-content-tertiary">
        {tasks.length} {tasks.length === 1 ? "задача" : "задач"} · {members.length} {members.length === 1 ? "участник" : "участников"}
      </p>

      <div className="mb-4 flex items-center justify-between gap-2">
        <SegmentedControl
          options={[
            { value: "list", label: "Список" },
            { value: "board", label: "Доска" },
            { value: "team", label: "Команда" },
          ]}
          value={view}
          onChange={setView}
        />
        <button
          onClick={() => openQuickAdd({ workspaceId: workspace.id, onCreated: loadTasks })}
          aria-label="Новая задача"
          className="flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white"
        >
          <Plus size={16} /> Задача
        </button>
      </div>

      {view !== "team" && (
        <div className="mb-4 flex gap-2">
          <div className="flex-1">
            <SearchInput value={query} onChange={setQuery} placeholder="Поиск по задачам" />
          </div>
          <IconButton
            icon={<SlidersHorizontal size={17} />}
            aria-label="Фильтры"
            variant={hasActiveFilters ? "primary" : "secondary"}
            onClick={() => setFilterSheetOpen(true)}
          />
        </div>
      )}

      {view === "team" ? (
        <TeamPanel members={members} tasks={tasks} />
      ) : view === "list" ? (
        tasks.length === 0 ? (
          <EmptyState icon={<SearchIcon size={28} />} title={query.trim() || hasActiveFilters ? "Ничего не найдено" : "Пока нет задач"} />
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map(
              (col) =>
                col.tasks.length > 0 && (
                  <section key={col.status}>
                    <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-content-secondary">
                      {col.label} <span className="text-content-tertiary">{col.tasks.length}</span>
                    </h3>
                    <div className="flex flex-col divide-y divide-border-subtle">
                      {col.tasks.map((t) => (
                        <TaskItem key={t.id} task={t} onToggle={toggleTask} onChanged={loadTasks} showWorkspace={false} />
                      ))}
                    </div>
                  </section>
                ),
            )}
            {otherStatusTasks.length > 0 && (
              <section>
                <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-content-secondary">Другое</h3>
                <div className="flex flex-col divide-y divide-border-subtle">
                  {otherStatusTasks.map((t) => (
                    <TaskItem key={t.id} task={t} onToggle={toggleTask} onChanged={loadTasks} showWorkspace={false} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      ) : (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {grouped.map((col) => (
            <div key={col.status} className="w-[85%] shrink-0 snap-start sm:w-[320px]">
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-content-secondary">
                {col.label} <span className="text-content-tertiary">{col.tasks.length}</span>
              </h3>
              <div className="flex flex-col gap-2">
                {col.tasks.map((t) => (
                  <BoardCard key={t.id} task={t} columns={BOARD_COLUMNS} onMove={(status) => moveTask(t, status)} />
                ))}
                {col.tasks.length === 0 && <p className="rounded-lg border border-dashed border-border-subtle py-6 text-center text-xs text-content-tertiary">Пусто</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Фильтры">
        <div className="flex flex-col gap-3">
          <FilterSelect label="Статус" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v as TaskStatus | "" }))}>
            <option value="">Любой статус</option>
            {BOARD_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Приоритет" value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v as TaskPriority | "" }))}>
            <option value="">Любой приоритет</option>
            <option value="none">Без приоритета</option>
            {TASK_PRIORITY_VALUES.filter((p) => p !== "none").map((p) => <option key={p} value={p}>{PRIORITY_DISPLAY[p].label}</option>)}
          </FilterSelect>
          {projects.length > 0 && (
            <FilterSelect label="Проект" value={filters.projectId} onChange={(v) => setFilters((f) => ({ ...f, projectId: v }))}>
              <option value="">Любой проект</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
          )}
          <FilterSelect label="Исполнитель" value={filters.assigneeId} onChange={(v) => setFilters((f) => ({ ...f, assigneeId: v }))}>
            <option value="">Любой исполнитель</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user.first_name} {m.user.last_name ?? ""}</option>)}
          </FilterSelect>
          {labels.length > 0 && (
            <FilterSelect label="Метка" value={filters.labelId} onChange={(v) => setFilters((f) => ({ ...f, labelId: v }))}>
              <option value="">Любая метка</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </FilterSelect>
          )}
          {hasActiveFilters && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-lg bg-surface-secondary py-2.5 text-sm font-medium text-content-secondary">
              Сбросить фильтры
            </button>
          )}
        </div>
      </BottomSheet>

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} />
    </PageLayout>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-content-secondary">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm">
        {children}
      </select>
    </label>
  );
}

function BoardCard({ task, columns, onMove }: { task: Task; columns: { status: TaskStatus; label: string }[]; onMove: (status: TaskStatus) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="w-full rounded-lg border border-border-subtle bg-surface-elevated p-3 text-left active:opacity-80"
      >
        <p className="line-clamp-2 text-sm font-medium text-content-primary">{task.title}</p>
        <div className="mt-2 flex items-center justify-between">
          <PriorityBadge priority={task.priority} compact />
          {task.due_at && <span className="text-xs text-content-tertiary">{new Date(task.due_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>}
        </div>
      </button>
      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={task.title}
        items={[
          ...columns
            .filter((c) => c.status !== task.status)
            .map((c) => ({ label: `Перенести в «${c.label}»`, onSelect: () => onMove(c.status) })),
        ]}
      />
    </>
  );
}

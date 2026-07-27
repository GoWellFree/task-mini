import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage } from "../components/Feedback";
import { STATUS_LABELS, StatusBadge, ConfirmDialog } from "../components/TaskBits";
import type {
  ChecklistItem,
  Label,
  Task,
  TaskComment,
  TaskCommentWithAuthor,
  TaskStatus,
  WorkspaceMemberWithUser,
} from "../types";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

interface DependencyTaskInfo {
  id: string;
  title: string;
  status: TaskStatus;
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [workspaceLabels, setWorkspaceLabels] = useState<Label[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<TaskCommentWithAuthor[]>([]);
  const [dependsOn, setDependsOn] = useState<DependencyTaskInfo[]>([]);
  const [blocks, setBlocks] = useState<DependencyTaskInfo[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Separate from `error`: a recoverable, already-resolved condition (we DO
  // have fresh task data to show) rather than "failed to load the page".
  const [notice, setNotice] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function load() {
    if (!id) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api.get<{ task: Task }>(`/api/tasks/${id}`);
      setTask(res.task);
      const [membersRes, labelsRes, workspaceLabelsRes, checklistRes, commentsRes, dependenciesRes, workspaceTasksRes] =
        await Promise.all([
          api.get<{ members: WorkspaceMemberWithUser[] }>(`/api/workspaces/${res.task.workspace_id}/members`),
          api.get<{ labels: Label[] }>(`/api/tasks/${id}/labels`),
          api.get<{ labels: Label[] }>(`/api/v1/workspaces/${res.task.workspace_id}/labels`),
          api.get<{ items: ChecklistItem[] }>(`/api/tasks/${id}/checklist`),
          api.get<{ comments: TaskCommentWithAuthor[] }>(`/api/tasks/${id}/comments`),
          api.get<{ dependsOn: DependencyTaskInfo[]; blocks: DependencyTaskInfo[] }>(`/api/tasks/${id}/dependencies`),
          api.get<{ tasks: Task[] }>(`/api/workspaces/${res.task.workspace_id}/tasks`),
        ]);
      setMembers(membersRes.members);
      setLabels(labelsRes.labels);
      setWorkspaceLabels(workspaceLabelsRes.labels);
      setChecklist(checklistRes.items);
      setComments(commentsRes.comments);
      setDependsOn(dependenciesRes.dependsOn);
      setBlocks(dependenciesRes.blocks);
      setWorkspaceTasks(workspaceTasksRes.tasks);
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
    setNotice(null);
    try {
      const res = await api.patch<{ task: Task }>(`/api/tasks/${task.id}`, { version: task.version, status });
      setTask(res.task);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TASK_VERSION_CONFLICT") {
        // Someone else changed this task first. Fetch the real state and
        // show it — this is not a load failure, so `error` (which blanks the
        // whole page) is the wrong place for it.
        try {
          const fresh = await api.get<{ task: Task }>(`/api/tasks/${task.id}`);
          setTask(fresh.task);
          setNotice("Задача изменена в другом месте. Показана актуальная версия — повторите действие при необходимости.");
        } catch {
          setError("Задача изменена в другом месте. Обновите страницу.");
        }
      } else if (err instanceof ApiError && err.code === "TASK_BLOCKED_BY_DEPENDENCIES") {
        // Also a recoverable, already-resolved condition — the task itself
        // loaded fine, it just can't be completed yet.
        setNotice(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Не удалось обновить статус");
      }
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

  // --- labels ---
  async function attachLabel(labelId: string) {
    if (!task) return;
    try {
      const res = await api.post<{ labels: Label[] }>(`/api/tasks/${task.id}/labels`, { labelId });
      setLabels(res.labels);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось добавить метку");
    }
  }

  async function detachLabel(labelId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/labels/${labelId}`);
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось убрать метку");
    }
  }

  async function createAndAttachLabel(name: string) {
    if (!task || !name.trim()) return;
    try {
      const created = await api.post<{ label: Label }>(`/api/v1/workspaces/${task.workspace_id}/labels`, {
        name: name.trim(),
      });
      setWorkspaceLabels((prev) => [...prev, created.label]);
      await attachLabel(created.label.id);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось создать метку");
    }
  }

  // --- checklist ---
  async function addChecklistItem(title: string) {
    if (!task || !title.trim()) return;
    try {
      const res = await api.post<{ item: ChecklistItem }>(`/api/tasks/${task.id}/checklist`, { title: title.trim() });
      setChecklist((prev) => [...prev, res.item]);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось добавить пункт");
    }
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    if (!task) return;
    try {
      const res = await api.patch<{ item: ChecklistItem }>(`/api/tasks/${task.id}/checklist/${item.id}`, {
        isDone: !item.is_done,
      });
      setChecklist((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось обновить пункт");
    }
  }

  async function deleteChecklistItem(itemId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/checklist/${itemId}`);
      setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось удалить пункт");
    }
  }

  // --- dependencies ---
  async function addDependency(dependsOnTaskId: string) {
    if (!task) return;
    try {
      const res = await api.post<{ dependsOn: DependencyTaskInfo[] }>(`/api/tasks/${task.id}/dependencies`, {
        dependsOnTaskId,
      });
      setDependsOn(res.dependsOn);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось добавить зависимость");
    }
  }

  async function removeDependency(dependsOnTaskId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/dependencies/${dependsOnTaskId}`);
      setDependsOn((prev) => prev.filter((t) => t.id !== dependsOnTaskId));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось удалить зависимость");
    }
  }

  // --- comments ---
  async function addComment(body: string, parentCommentId?: string) {
    if (!task || !user || !body.trim()) return;
    try {
      const res = await api.post<{ comment: TaskComment }>(`/api/tasks/${task.id}/comments`, {
        body: body.trim(),
        ...(parentCommentId ? { parentCommentId } : {}),
      });
      // The create response is a bare comment — no embedded `author` the way
      // the list endpoint provides one. It's always the current user, so
      // filling it in locally avoids a round-trip just to render it.
      setComments((prev) => [
        ...prev,
        {
          ...res.comment,
          author: { id: user.id, username: user.username, first_name: user.first_name, last_name: user.last_name, telegram_id: user.telegram_id },
        },
      ]);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось отправить комментарий");
    }
  }

  async function editComment(commentId: string, body: string) {
    if (!task || !body.trim()) return;
    try {
      const res = await api.patch<{ comment: TaskComment }>(`/api/tasks/${task.id}/comments/${commentId}`, {
        body: body.trim(),
      });
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...res.comment } : c)));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось изменить комментарий");
    }
  }

  async function deleteComment(commentId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId));
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Не удалось удалить комментарий");
    }
  }

  if (error) return <PageLayout title="Задача" onBack><ErrorMessage message={error} onRetry={load} /></PageLayout>;
  if (!task) return <PageLayout title="Задача" onBack><Loading /></PageLayout>;

  const assignee = members.find((m) => m.user_id === task.assignee_id);
  const membership = members.find((m) => m.user_id === user?.id);
  const isManager = task.creator_id === user?.id || membership?.role === "owner" || membership?.role === "admin";
  const isViewer = membership?.role === "viewer";
  const canToggleChecklist = isManager || task.assignee_id === user?.id;
  const canDelete = isManager;
  const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length]!;
  const unattachedLabels = workspaceLabels.filter((wl) => !labels.some((l) => l.id === wl.id));
  const dependencyCandidates = workspaceTasks.filter((t) => t.id !== task.id);

  return (
    <PageLayout title="Задача" onBack>
      {notice && (
        <div className="mb-4 flex items-start justify-between gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 font-medium">
            ✕
          </button>
        </div>
      )}

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

      <LabelsSection
        labels={labels}
        unattachedLabels={unattachedLabels}
        canManage={isManager}
        onAttach={attachLabel}
        onDetach={detachLabel}
        onCreate={createAndAttachLabel}
      />

      <ChecklistSection
        items={checklist}
        canManage={isManager}
        canToggle={canToggleChecklist}
        onAdd={addChecklistItem}
        onToggle={toggleChecklistItem}
        onDelete={deleteChecklistItem}
      />

      <DependenciesSection
        dependsOn={dependsOn}
        blocks={blocks}
        candidates={dependencyCandidates}
        canManage={isManager}
        onAdd={addDependency}
        onRemove={removeDependency}
      />

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

      <CommentsSection
        comments={comments}
        currentUserId={user?.id}
        canComment={!isViewer}
        canModerate={isManager}
        onAdd={addComment}
        onEdit={editComment}
        onDelete={deleteComment}
      />

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

function LabelsSection({
  labels,
  unattachedLabels,
  canManage,
  onAttach,
  onDetach,
  onCreate,
}: {
  labels: Label[];
  unattachedLabels: Label[];
  canManage: boolean;
  onAttach: (labelId: string) => void;
  onDetach: (labelId: string) => void;
  onCreate: (name: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");

  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium text-tg-hint">Метки</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {labels.map((label) => (
          <span
            key={label.id}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: label.color ?? "#e5e7eb", color: label.color ? "#fff" : "#374151" }}
          >
            {label.name}
            {canManage && (
              <button onClick={() => onDetach(label.id)} className="opacity-70 hover:opacity-100" aria-label={`Убрать метку ${label.name}`}>
                ✕
              </button>
            )}
          </span>
        ))}
        {labels.length === 0 && <span className="text-sm text-tg-hint">Нет меток</span>}
        {canManage && (
          <button
            onClick={() => setPicking((p) => !p)}
            className="rounded-full bg-tg-secondaryBg px-2.5 py-1 text-xs font-medium"
          >
            + Добавить
          </button>
        )}
      </div>

      {picking && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl bg-tg-secondaryBg p-3">
          {unattachedLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unattachedLabels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => {
                    onAttach(label.id);
                    setPicking(false);
                  }}
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ backgroundColor: label.color ?? "#e5e7eb", color: label.color ? "#fff" : "#374151" }}
                >
                  {label.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="Новая метка"
              className="flex-1 rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-sm"
            />
            <button
              onClick={() => {
                if (!newLabelName.trim()) return;
                onCreate(newLabelName);
                setNewLabelName("");
                setPicking(false);
              }}
              className="rounded-lg bg-tg-button px-3 py-2 text-sm font-medium text-tg-buttonText"
            >
              Создать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistSection({
  items,
  canManage,
  canToggle,
  onAdd,
  onToggle,
  onDelete,
}: {
  items: ChecklistItem[];
  canManage: boolean;
  canToggle: boolean;
  onAdd: (title: string) => void;
  onToggle: (item: ChecklistItem) => void;
  onDelete: (itemId: string) => void;
}) {
  const [newItemTitle, setNewItemTitle] = useState("");
  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-tg-hint">Чек-лист</h3>
        {items.length > 0 && (
          <span className="text-xs text-tg-hint">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg bg-tg-secondaryBg px-3 py-2">
            <input
              type="checkbox"
              checked={item.is_done}
              disabled={!canToggle}
              onChange={() => onToggle(item)}
              className="h-4 w-4 shrink-0"
            />
            <span className={`flex-1 text-sm ${item.is_done ? "text-tg-hint line-through" : ""}`}>{item.title}</span>
            {canManage && (
              <button onClick={() => onDelete(item.id)} className="shrink-0 text-xs text-red-600" aria-label="Удалить пункт">
                ✕
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-tg-hint">Пунктов пока нет</p>}
      </div>

      {canManage && (
        <div className="mt-2 flex gap-2">
          <input
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="Новый пункт"
            className="flex-1 rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (!newItemTitle.trim()) return;
              onAdd(newItemTitle);
              setNewItemTitle("");
            }}
            className="rounded-lg bg-tg-button px-3 py-2 text-sm font-medium text-tg-buttonText"
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}

function DependenciesSection({
  dependsOn,
  blocks,
  candidates,
  canManage,
  onAdd,
  onRemove,
}: {
  dependsOn: DependencyTaskInfo[];
  blocks: DependencyTaskInfo[];
  candidates: Pick<Task, "id" | "title" | "status">[];
  canManage: boolean;
  onAdd: (taskId: string) => void;
  onRemove: (taskId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const pickable = candidates.filter((c) => !dependsOn.some((d) => d.id === c.id));

  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium text-tg-hint">Зависит от</h3>
      <div className="mt-2 flex flex-col gap-1.5">
        {dependsOn.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg bg-tg-secondaryBg px-3 py-2">
            <StatusBadge status={t.status} />
            <span className="flex-1 text-sm">{t.title}</span>
            {canManage && (
              <button
                onClick={() => onRemove(t.id)}
                className="shrink-0 text-xs text-red-600"
                aria-label={`Убрать зависимость от «${t.title}»`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {dependsOn.length === 0 && <p className="text-sm text-tg-hint">Нет зависимостей</p>}
      </div>

      {canManage && (
        <div className="mt-2">
          <button
            onClick={() => setPicking((p) => !p)}
            className="rounded-full bg-tg-secondaryBg px-2.5 py-1 text-xs font-medium"
          >
            + Добавить зависимость
          </button>

          {picking && (
            <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-tg-secondaryBg p-3">
              {pickable.length === 0 && <p className="text-sm text-tg-hint">Нет других задач для выбора</p>}
              {pickable.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onAdd(t.id);
                    setPicking(false);
                  }}
                  className="rounded-lg bg-tg-bg px-3 py-2 text-left text-sm"
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-medium text-tg-hint">Блокирует</h4>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {blocks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg bg-tg-secondaryBg px-3 py-2">
                <StatusBadge status={t.status} />
                <span className="flex-1 text-sm">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentsSection({
  comments,
  currentUserId,
  canComment,
  canModerate,
  onAdd,
  onEdit,
  onDelete,
}: {
  comments: TaskCommentWithAuthor[];
  currentUserId: string | undefined;
  canComment: boolean;
  canModerate: boolean;
  onAdd: (body: string, parentCommentId?: string) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const [newBody, setNewBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesTo = (commentId: string) => comments.filter((c) => c.parent_comment_id === commentId);

  function renderComment(comment: TaskCommentWithAuthor, isReply: boolean) {
    const isAuthor = comment.author_id === currentUserId;
    const isEditing = editingId === comment.id;

    return (
      <div key={comment.id} className={isReply ? "ml-6 mt-2" : "mt-3"}>
        <div className="rounded-xl bg-tg-secondaryBg p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-tg-hint">
            <span className="font-medium text-tg-text">
              {comment.author.first_name} {comment.author.last_name ?? ""}
            </span>
            <span>{new Date(comment.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          {isEditing ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-sm"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onEdit(comment.id, editBody);
                    setEditingId(null);
                  }}
                  className="rounded-lg bg-tg-button px-3 py-1.5 text-xs font-medium text-tg-buttonText"
                >
                  Сохранить
                </button>
                <button onClick={() => setEditingId(null)} className="rounded-lg bg-tg-bg px-3 py-1.5 text-xs font-medium">
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
          )}

          {!isEditing && (
            <div className="mt-2 flex gap-3 text-xs text-tg-hint">
              {!isReply && canComment && (
                <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}>Ответить</button>
              )}
              {isAuthor && (
                <button
                  onClick={() => {
                    setEditingId(comment.id);
                    setEditBody(comment.body);
                  }}
                >
                  Изменить
                </button>
              )}
              {(isAuthor || canModerate) && <button onClick={() => onDelete(comment.id)}>Удалить</button>}
            </div>
          )}
        </div>

        {!isReply && replyingTo === comment.id && (
          <div className="ml-6 mt-2 flex gap-2">
            <input
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Ответить..."
              className="flex-1 rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-sm"
            />
            <button
              onClick={() => {
                if (!replyBody.trim()) return;
                onAdd(replyBody, comment.id);
                setReplyBody("");
                setReplyingTo(null);
              }}
              className="rounded-lg bg-tg-button px-3 py-2 text-sm font-medium text-tg-buttonText"
            >
              Отправить
            </button>
          </div>
        )}

        {!isReply && repliesTo(comment.id).map((reply) => renderComment(reply, true))}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-tg-hint">Комментарии</h3>

      {topLevel.length === 0 && <p className="mt-2 text-sm text-tg-hint">Комментариев пока нет</p>}
      {topLevel.map((comment) => renderComment(comment, false))}

      {canComment && (
        <div className="mt-3 flex gap-2">
          <input
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Написать комментарий..."
            className="flex-1 rounded-lg border border-tg-hint/30 bg-tg-bg px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (!newBody.trim()) return;
              onAdd(newBody);
              setNewBody("");
            }}
            className="rounded-lg bg-tg-button px-3 py-2 text-sm font-medium text-tg-buttonText"
          >
            Отправить
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Download, MoreHorizontal, Paperclip, Plus, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage } from "../components/Feedback";
import { Card } from "../components/ui/Card";
import { Chip } from "../components/ui/Chip";
import { Badge } from "../components/ui/Badge";
import { PriorityBadge, PRIORITY_DISPLAY } from "../components/ui/PriorityBadge";
import { Avatar } from "../components/ui/Avatar";
import { Checkbox } from "../components/ui/Checkbox";
import { IconButton } from "../components/ui/IconButton";
import { ActionSheet, type ActionSheetItem } from "../components/ui/ActionSheet";
import { DatePicker } from "../components/ui/DatePicker";
import { useToast } from "../components/ui/Toast";
import { haptics } from "../lib/haptics";
import type {
  ChecklistItem,
  Label,
  Task,
  TaskAttachmentWithUploader,
  TaskComment,
  TaskCommentWithAuthor,
  TaskPriority,
  TaskStatus,
  WorkspaceMemberWithUser,
} from "../types";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const STATUS_CYCLE: TaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_LABELS_CYCLE: Record<string, string> = { todo: "К выполнению", in_progress: "В работе", done: "Выполнено" };

interface DependencyTaskInfo {
  id: string;
  title: string;
  status: TaskStatus;
}

function toDateOnly(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeOnly(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [workspaceLabels, setWorkspaceLabels] = useState<Label[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<TaskCommentWithAuthor[]>([]);
  const [dependsOn, setDependsOn] = useState<DependencyTaskInfo[]>([]);
  const [blocks, setBlocks] = useState<DependencyTaskInfo[]>([]);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachmentWithUploader[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);

  async function load() {
    if (!id) return;
    setError(null);
    try {
      const res = await api.get<{ task: Task }>(`/api/tasks/${id}`);
      setTask(res.task);
      const [membersRes, labelsRes, workspaceLabelsRes, checklistRes, commentsRes, dependenciesRes, workspaceTasksRes, attachmentsRes] =
        await Promise.all([
          api.get<{ members: WorkspaceMemberWithUser[] }>(`/api/workspaces/${res.task.workspace_id}/members`),
          api.get<{ labels: Label[] }>(`/api/tasks/${id}/labels`),
          api.get<{ labels: Label[] }>(`/api/v1/workspaces/${res.task.workspace_id}/labels`),
          api.get<{ items: ChecklistItem[] }>(`/api/tasks/${id}/checklist`),
          api.get<{ comments: TaskCommentWithAuthor[] }>(`/api/tasks/${id}/comments`),
          api.get<{ dependsOn: DependencyTaskInfo[]; blocks: DependencyTaskInfo[] }>(`/api/tasks/${id}/dependencies`),
          api.get<{ tasks: Task[] }>(`/api/workspaces/${res.task.workspace_id}/tasks`),
          api.get<{ attachments: TaskAttachmentWithUploader[] }>(`/api/tasks/${id}/attachments`),
        ]);
      setMembers(membersRes.members);
      setLabels(labelsRes.labels);
      setWorkspaceLabels(workspaceLabelsRes.labels);
      setChecklist(checklistRes.items);
      setComments(commentsRes.comments);
      setDependsOn(dependenciesRes.dependsOn);
      setBlocks(dependenciesRes.blocks);
      setWorkspaceTasks(workspaceTasksRes.tasks);
      setAttachments(attachmentsRes.attachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить задачу");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patchTask(patch: Record<string, unknown>): Promise<boolean> {
    if (!task) return false;
    setUpdating(true);
    try {
      const res = await api.patch<{ task: Task }>(`/api/tasks/${task.id}`, { version: task.version, ...patch });
      setTask(res.task);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "TASK_VERSION_CONFLICT") {
        try {
          const fresh = await api.get<{ task: Task }>(`/api/tasks/${task.id}`);
          setTask(fresh.task);
          showToast("Задача изменена в другом месте — показана актуальная версия", { tone: "error" });
        } catch {
          setError("Задача изменена в другом месте. Обновите страницу.");
        }
      } else if (err instanceof ApiError && err.code === "TASK_BLOCKED_BY_DEPENDENCIES") {
        const unresolved = dependsOn.filter((t) => t.status !== "done").map((t) => t.title);
        showToast(unresolved.length > 0 ? `${err.message}: ${unresolved.join(", ")}` : err.message, { tone: "error" });
      } else {
        haptics.error();
        showToast(err instanceof ApiError ? err.message : "Не удалось обновить задачу", { tone: "error" });
      }
      return false;
    } finally {
      setUpdating(false);
    }
  }

  async function toggleDone() {
    if (!task) return;
    haptics.success();
    await patchTask({ status: task.status === "done" ? "todo" : "done" });
  }

  async function cycleStatus() {
    if (!task) return;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length]!;
    haptics.tap();
    await patchTask({ status: next });
  }

  async function handleDelete() {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}`);
      showToast("Задача удалена", { tone: "success" });
      navigate("/my-tasks", { replace: true });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось удалить задачу", { tone: "error" });
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
      showToast(err instanceof ApiError ? err.message : "Не удалось добавить метку", { tone: "error" });
    }
  }
  async function detachLabel(labelId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/labels/${labelId}`);
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось убрать метку", { tone: "error" });
    }
  }
  async function createAndAttachLabel(name: string) {
    if (!task || !name.trim()) return;
    try {
      const created = await api.post<{ label: Label }>(`/api/v1/workspaces/${task.workspace_id}/labels`, { name: name.trim() });
      setWorkspaceLabels((prev) => [...prev, created.label]);
      await attachLabel(created.label.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось создать метку", { tone: "error" });
    }
  }

  // --- checklist ---
  async function addChecklistItem(title: string) {
    if (!task || !title.trim()) return;
    try {
      const res = await api.post<{ item: ChecklistItem }>(`/api/tasks/${task.id}/checklist`, { title: title.trim() });
      setChecklist((prev) => [...prev, res.item]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось добавить пункт", { tone: "error" });
    }
  }
  async function toggleChecklistItem(item: ChecklistItem) {
    if (!task) return;
    haptics.tap();
    try {
      const res = await api.patch<{ item: ChecklistItem }>(`/api/tasks/${task.id}/checklist/${item.id}`, { isDone: !item.is_done });
      setChecklist((prev) => prev.map((i) => (i.id === item.id ? res.item : i)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось обновить пункт", { tone: "error" });
    }
  }
  async function deleteChecklistItem(itemId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/checklist/${itemId}`);
      setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось удалить пункт", { tone: "error" });
    }
  }

  // --- dependencies ---
  async function addDependency(dependsOnTaskId: string) {
    if (!task) return;
    try {
      const res = await api.post<{ dependsOn: DependencyTaskInfo[] }>(`/api/tasks/${task.id}/dependencies`, { dependsOnTaskId });
      setDependsOn(res.dependsOn);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось добавить зависимость", { tone: "error" });
    }
  }
  async function removeDependency(dependsOnTaskId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/dependencies/${dependsOnTaskId}`);
      setDependsOn((prev) => prev.filter((t) => t.id !== dependsOnTaskId));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось удалить зависимость", { tone: "error" });
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
      setComments((prev) => [
        ...prev,
        { ...res.comment, author: { id: user.id, username: user.username, first_name: user.first_name, last_name: user.last_name, telegram_id: user.telegram_id } },
      ]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось отправить комментарий", { tone: "error" });
    }
  }
  async function editComment(commentId: string, body: string) {
    if (!task || !body.trim()) return;
    try {
      const res = await api.patch<{ comment: TaskComment }>(`/api/tasks/${task.id}/comments/${commentId}`, { body: body.trim() });
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...res.comment } : c)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось изменить комментарий", { tone: "error" });
    }
  }
  async function deleteComment(commentId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось удалить комментарий", { tone: "error" });
    }
  }

  // --- attachments ---
  async function uploadAttachment(file: File) {
    if (!task) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      showToast("Файл слишком большой (максимум 15 МБ)", { tone: "error" });
      return;
    }
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.upload<{ attachment: TaskAttachmentWithUploader }>(`/api/tasks/${task.id}/attachments`, formData);
      setAttachments((prev) => [...prev, res.attachment]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось загрузить файл", { tone: "error" });
    } finally {
      setUploadingAttachment(false);
    }
  }
  async function downloadAttachment(attachmentId: string) {
    if (!task) return;
    try {
      const res = await api.get<{ url: string }>(`/api/tasks/${task.id}/attachments/${attachmentId}/download`);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось открыть файл", { tone: "error" });
    }
  }
  async function deleteAttachment(attachmentId: string) {
    if (!task) return;
    try {
      await api.delete(`/api/tasks/${task.id}/attachments/${attachmentId}`);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось удалить файл", { tone: "error" });
    }
  }

  if (error) return <PageLayout title="Задача" onBack><ErrorMessage message={error} onRetry={load} /></PageLayout>;
  if (!task) return <PageLayout title="Задача" onBack><Loading /></PageLayout>;

  const assignee = members.find((m) => m.user_id === task.assignee_id);
  const membership = members.find((m) => m.user_id === user?.id);
  const isManager = task.creator_id === user?.id || membership?.role === "owner" || membership?.role === "admin";
  const isViewer = membership?.role === "viewer";
  const canToggleChecklist = isManager || task.assignee_id === user?.id;
  const unattachedLabels = workspaceLabels.filter((wl) => !labels.some((l) => l.id === wl.id));
  const dependencyCandidates = workspaceTasks.filter(
    (t) => t.id !== task.id && !blocks.some((b) => b.id === t.id) && t.status !== "cancelled" && !t.archived_at,
  );

  const menuItems: ActionSheetItem[] = [
    ...(isManager
      ? [{ label: "Удалить задачу", tone: "danger" as const, icon: <X size={18} />, onSelect: () => setConfirmingDelete(true) }]
      : []),
  ];

  const priorityItems: ActionSheetItem[] = [
    { label: "Без приоритета", onSelect: () => patchTask({ priority: "none" satisfies TaskPriority }) },
    ...(["low", "medium", "high", "urgent"] as const).map((p) => ({
      label: PRIORITY_DISPLAY[p].label,
      icon: <span className={`h-2 w-2 rounded-full ${PRIORITY_DISPLAY[p].dot}`} />,
      onSelect: () => patchTask({ priority: p }),
    })),
  ];

  const assigneeItems: ActionSheetItem[] = [
    { label: "Не назначен", onSelect: () => patchTask({ assigneeId: null }) },
    ...members.map((m) => ({
      label: `${m.user.first_name} ${m.user.last_name ?? ""}`.trim(),
      icon: <Avatar firstName={m.user.first_name} lastName={m.user.last_name} size={24} />,
      onSelect: () => patchTask({ assigneeId: m.user_id }),
    })),
  ];

  return (
    <PageLayout
      title={STATUS_LABELS_CYCLE[task.status] ?? "Задача"}
      onBack
      headerAction={
        menuItems.length > 0 && (
          <IconButton icon={<MoreHorizontal size={20} />} aria-label="Ещё" onClick={() => setMenuOpen(true)} />
        )
      }
    >
      <div className="flex items-start gap-3">
        <button
          onClick={toggleDone}
          disabled={updating}
          aria-label={task.status === "done" ? "Возобновить задачу" : "Выполнить задачу"}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
              task.status === "done" ? "border-success bg-success" : "border-border-subtle"
            }`}
          >
            {task.status === "done" && <Check size={14} strokeWidth={3} className="text-white" />}
          </span>
        </button>
        <h1 className={`flex-1 text-xl font-semibold leading-snug ${task.status === "done" ? "text-content-tertiary line-through" : "text-content-primary"}`}>
          {task.title}
        </h1>
      </div>

      {task.description && <p className="ml-11 mt-2 whitespace-pre-wrap text-sm text-content-secondary">{task.description}</p>}

      <Card className="mt-4 flex flex-col divide-y divide-border-subtle p-0">
        <DetailRow label="Срок" onClick={() => setDatePickerOpen(true)}>
          {task.due_at ? (
            <span className={new Date(task.due_at) < new Date() && task.status !== "done" ? "font-medium text-danger" : "text-content-primary"}>
              {new Date(task.due_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : (
            <span className="text-content-tertiary">Не указан</span>
          )}
        </DetailRow>
        <DetailRow label="Приоритет" onClick={() => setPriorityPickerOpen(true)}>
          {task.priority === "none" ? <span className="text-content-tertiary">Не указан</span> : <PriorityBadge priority={task.priority} />}
        </DetailRow>
        <DetailRow label="Исполнитель" onClick={() => setAssigneePickerOpen(true)}>
          {assignee ? (
            <span className="flex items-center gap-2">
              <Avatar firstName={assignee.user.first_name} lastName={assignee.user.last_name} size={24} />
              {assignee.user.first_name}
            </span>
          ) : (
            <span className="text-content-tertiary">Не назначен</span>
          )}
        </DetailRow>
      </Card>

      {task.status !== "done" && (
        <button
          onClick={cycleStatus}
          disabled={updating}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-lg border border-border-subtle bg-surface-primary text-sm font-medium text-content-primary disabled:opacity-50"
        >
          {updating ? "Обновление..." : `Перевести в «${STATUS_LABELS_CYCLE[STATUS_CYCLE[(STATUS_CYCLE.indexOf(task.status) + 1) % STATUS_CYCLE.length]!]}»`}
        </button>
      )}

      <LabelsSection labels={labels} unattachedLabels={unattachedLabels} canManage={isManager} onAttach={attachLabel} onDetach={detachLabel} onCreate={createAndAttachLabel} />
      <ChecklistSection items={checklist} canManage={isManager} canToggle={canToggleChecklist} onAdd={addChecklistItem} onToggle={toggleChecklistItem} onDelete={deleteChecklistItem} />
      <AttachmentsSection
        attachments={attachments}
        currentUserId={user?.id}
        canUpload={!isViewer}
        canManage={isManager}
        uploading={uploadingAttachment}
        onUpload={uploadAttachment}
        onDownload={downloadAttachment}
        onDelete={deleteAttachment}
      />
      <DependenciesSection dependsOn={dependsOn} blocks={blocks} candidates={dependencyCandidates} canManage={isManager} onAdd={addDependency} onRemove={removeDependency} />
      <CommentsSection comments={comments} currentUserId={user?.id} canComment={!isViewer} canModerate={isManager} onAdd={addComment} onEdit={editComment} onDelete={deleteComment} />

      <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} />
      <ActionSheet open={priorityPickerOpen} onClose={() => setPriorityPickerOpen(false)} title="Приоритет" items={priorityItems} />
      <ActionSheet open={assigneePickerOpen} onClose={() => setAssigneePickerOpen(false)} title="Исполнитель" items={assigneeItems} />
      <DatePicker
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        value={task.due_at ? toDateOnly(task.due_at) : null}
        onChange={(date) => {
          const time = task.due_at ? toTimeOnly(task.due_at) : "00:00";
          patchTask({ dueAt: date ? new Date(`${date}T${time}`).toISOString() : null });
        }}
      />

      <ActionSheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Удалить эту задачу? Это действие необратимо."
        items={[{ label: "Удалить", tone: "danger", onSelect: handleDelete }]}
      />
    </PageLayout>
  );
}

function DetailRow({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm active:bg-surface-secondary">
      <span className="text-content-secondary">{label}</span>
      <span className="text-sm">{children}</span>
    </button>
  );
}

function LabelsSection({
  labels, unattachedLabels, canManage, onAttach, onDetach, onCreate,
}: {
  labels: Label[]; unattachedLabels: Label[]; canManage: boolean;
  onAttach: (labelId: string) => void; onDetach: (labelId: string) => void; onCreate: (name: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");

  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-content-secondary">Метки</h3>
      <div className="flex flex-wrap items-center gap-2">
        {labels.map((label) => (
          <Chip key={label.id} onRemove={canManage ? () => onDetach(label.id) : undefined}>
            {label.name}
          </Chip>
        ))}
        {labels.length === 0 && <span className="text-sm text-content-tertiary">Нет меток</span>}
        {canManage && (
          <button onClick={() => setPicking((p) => !p)} className="flex h-9 items-center gap-1 rounded-pill bg-surface-secondary px-3 text-xs font-medium text-content-secondary">
            <Plus size={13} /> Добавить
          </button>
        )}
      </div>

      {picking && (
        <Card className="mt-2 flex flex-col gap-2 p-3">
          {unattachedLabels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unattachedLabels.map((label) => (
                <Chip key={label.id} onClick={() => { onAttach(label.id); setPicking(false); }}>
                  {label.name}
                </Chip>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="Новая метка"
              className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm"
            />
            <button
              onClick={() => { if (!newLabelName.trim()) return; onCreate(newLabelName); setNewLabelName(""); setPicking(false); }}
              disabled={!newLabelName.trim()}
              className="h-10 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Создать
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ChecklistSection({
  items, canManage, canToggle, onAdd, onToggle, onDelete,
}: {
  items: ChecklistItem[]; canManage: boolean; canToggle: boolean;
  onAdd: (title: string) => void; onToggle: (item: ChecklistItem) => void; onDelete: (itemId: string) => void;
}) {
  const [newItemTitle, setNewItemTitle] = useState("");
  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-content-secondary">Подзадачи</h3>
        {items.length > 0 && <span className="text-xs text-content-tertiary">{doneCount}/{items.length}</span>}
      </div>

      <div className="mt-2 flex flex-col divide-y divide-border-subtle">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5 py-2">
            <Checkbox checked={item.is_done} onChange={() => onToggle(item)} disabled={!canToggle} aria-label={item.title} />
            <span className={`flex-1 text-sm ${item.is_done ? "text-content-tertiary line-through" : "text-content-primary"}`}>{item.title}</span>
            {canManage && (
              <button onClick={() => onDelete(item.id)} className="shrink-0 text-content-tertiary" aria-label="Удалить пункт">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="py-2 text-sm text-content-tertiary">Пунктов пока нет</p>}
      </div>

      {canManage && (
        <div className="mt-2 flex gap-2">
          <input
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newItemTitle.trim()) { onAdd(newItemTitle); setNewItemTitle(""); } } }}
            placeholder="Новый пункт"
            className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm"
          />
          <button
            onClick={() => { if (!newItemTitle.trim()) return; onAdd(newItemTitle); setNewItemTitle(""); }}
            disabled={!newItemTitle.trim()}
            className="h-10 shrink-0 rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm font-medium text-content-primary disabled:opacity-40"
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}

function AttachmentsSection({
  attachments, currentUserId, canUpload, canManage, uploading, onUpload, onDownload, onDelete,
}: {
  attachments: TaskAttachmentWithUploader[]; currentUserId: string | undefined; canUpload: boolean; canManage: boolean;
  uploading: boolean; onUpload: (file: File) => void; onDownload: (attachmentId: string) => void; onDelete: (attachmentId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-content-secondary">Вложения</h3>
        {attachments.length > 0 && <span className="text-xs text-content-tertiary">{attachments.length}</span>}
      </div>

      <div className="mt-2 flex flex-col divide-y divide-border-subtle">
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center gap-2.5 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-content-secondary">
              <Paperclip size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-content-primary">{a.file_name}</p>
              <p className="truncate text-xs text-content-tertiary">
                {formatFileSize(a.file_size)} · {a.uploader.first_name}
              </p>
            </div>
            <button onClick={() => onDownload(a.id)} className="shrink-0 p-1.5 text-content-secondary" aria-label={`Скачать ${a.file_name}`}>
              <Download size={16} />
            </button>
            {(canManage || a.uploader_id === currentUserId) && (
              <button onClick={() => onDelete(a.id)} className="shrink-0 p-1.5 text-content-tertiary" aria-label={`Удалить ${a.file_name}`}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {attachments.length === 0 && <p className="py-2 text-sm text-content-tertiary">Файлов пока нет</p>}
      </div>

      {canUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-primary text-sm font-medium text-content-primary disabled:opacity-50"
          >
            <Paperclip size={15} />
            {uploading ? "Загрузка..." : "Прикрепить файл"}
          </button>
        </>
      )}
    </div>
  );
}

function DependenciesSection({
  dependsOn, blocks, candidates, canManage, onAdd, onRemove,
}: {
  dependsOn: DependencyTaskInfo[]; blocks: DependencyTaskInfo[]; candidates: Pick<Task, "id" | "title" | "status">[];
  canManage: boolean; onAdd: (taskId: string) => void; onRemove: (taskId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const pickable = candidates.filter((c) => !dependsOn.some((d) => d.id === c.id));

  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-content-secondary">Зависит от</h3>
      <div className="flex flex-col divide-y divide-border-subtle">
        {dependsOn.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-2">
            <Badge tone={t.status === "done" ? "success" : "neutral"}>{t.status === "done" ? "Готово" : "В работе"}</Badge>
            <span className="flex-1 truncate text-sm">{t.title}</span>
            {canManage && (
              <button onClick={() => onRemove(t.id)} className="shrink-0 text-content-tertiary" aria-label={`Убрать зависимость от «${t.title}»`}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        {dependsOn.length === 0 && <p className="py-2 text-sm text-content-tertiary">Нет зависимостей</p>}
      </div>

      {canManage && (
        <div className="mt-2">
          <button onClick={() => setPicking((p) => !p)} className="flex h-9 items-center gap-1 rounded-pill bg-surface-secondary px-3 text-xs font-medium text-content-secondary">
            <Plus size={13} /> Добавить зависимость
          </button>
          {picking && (
            <Card className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto p-3">
              {pickable.length === 0 && <p className="text-sm text-content-tertiary">Нет других задач для выбора</p>}
              {pickable.map((t) => (
                <button key={t.id} onClick={() => { onAdd(t.id); setPicking(false); }} className="rounded-lg bg-surface-secondary px-3 py-2 text-left text-sm">
                  {t.title}
                </button>
              ))}
            </Card>
          )}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1.5 text-xs font-medium text-content-tertiary">Блокирует</h4>
          <div className="flex flex-col divide-y divide-border-subtle">
            {blocks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-2">
                <Badge tone={t.status === "done" ? "success" : "neutral"}>{t.status === "done" ? "Готово" : "В работе"}</Badge>
                <span className="flex-1 truncate text-sm">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentsSection({
  comments, currentUserId, canComment, canModerate, onAdd, onEdit, onDelete,
}: {
  comments: TaskCommentWithAuthor[]; currentUserId: string | undefined; canComment: boolean; canModerate: boolean;
  onAdd: (body: string, parentCommentId?: string) => void; onEdit: (commentId: string, body: string) => void; onDelete: (commentId: string) => void;
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
      <div key={comment.id} className={isReply ? "ml-8 mt-2" : "mt-3"}>
        <div className="rounded-lg bg-surface-secondary p-3">
          <div className="flex items-center gap-2 text-xs text-content-tertiary">
            <Avatar firstName={comment.author.first_name} lastName={comment.author.last_name} size={24} />
            <span className="font-medium text-content-primary">{comment.author.first_name} {comment.author.last_name ?? ""}</span>
            <span>{new Date(comment.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          {isEditing ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} className="w-full rounded-lg border border-border-subtle bg-surface-primary px-3 py-2 text-sm" rows={2} />
              <div className="flex gap-2">
                <button
                  onClick={() => { onEdit(comment.id, editBody); setEditingId(null); }}
                  disabled={!editBody.trim()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  Сохранить
                </button>
                <button onClick={() => setEditingId(null)} className="rounded-lg bg-surface-primary px-3 py-1.5 text-xs font-medium">Отмена</button>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-content-primary">{comment.body}</p>
          )}

          {!isEditing && (
            <div className="mt-2 flex gap-3 text-xs text-content-tertiary">
              {!isReply && canComment && <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}>Ответить</button>}
              {isAuthor && <button onClick={() => { setEditingId(comment.id); setEditBody(comment.body); }}>Изменить</button>}
              {(isAuthor || canModerate) && <button onClick={() => onDelete(comment.id)}>Удалить</button>}
            </div>
          )}
        </div>

        {!isReply && replyingTo === comment.id && (
          <div className="ml-8 mt-2 flex gap-2">
            <input value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Ответить..." className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm" />
            <button
              onClick={() => { if (!replyBody.trim()) return; onAdd(replyBody, comment.id); setReplyBody(""); setReplyingTo(null); }}
              disabled={!replyBody.trim()}
              className="h-10 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-40"
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
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-content-secondary">Активность</h3>
      {topLevel.length === 0 && <p className="mt-2 text-sm text-content-tertiary">Комментариев пока нет</p>}
      {topLevel.map((comment) => renderComment(comment, false))}

      {canComment && (
        <div className="mt-3 flex gap-2">
          <input value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Написать комментарий..." className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm" />
          <button
            onClick={() => { if (!newBody.trim()) return; onAdd(newBody); setNewBody(""); }}
            disabled={!newBody.trim()}
            className="h-10 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-white disabled:opacity-40"
          >
            Отправить
          </button>
        </div>
      )}
    </div>
  );
}

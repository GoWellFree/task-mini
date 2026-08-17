import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { BottomSheet } from "../ui/BottomSheet";
import { Chip } from "../ui/Chip";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { DatePicker } from "../ui/DatePicker";
import { TimePicker } from "../ui/TimePicker";
import { ActionSheet, type ActionSheetItem } from "../ui/ActionSheet";
import { PRIORITY_DISPLAY } from "../ui/PriorityBadge";
import { api, ApiError } from "../../lib/api";
import { haptics } from "../../lib/haptics";
import { useAuth } from "../../lib/AuthContext";
import { useToast } from "../ui/Toast";
import type { RecurrenceRule, Task, TaskPriority, Workspace, WorkspaceMemberWithUser } from "../../types";

const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  daily: "Каждый день",
  weekly: "Каждую неделю",
  monthly: "Каждый месяц",
  yearly: "Каждый год",
};

const PRIORITY_ORDER: Exclude<TaskPriority, "none">[] = ["low", "medium", "high", "urgent"];

interface QuickAddSheetProps {
  open: boolean;
  onClose: () => void;
  defaultWorkspaceId?: string;
  onCreated: (task: Task) => void;
}

function todayDateOnly(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function QuickAddSheet({ open, onClose, defaultWorkspaceId, onCreated }: QuickAddSheetProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId ?? "");
  const [members, setMembers] = useState<WorkspaceMemberWithUser[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(user?.id ?? "");
  const [description, setDescription] = useState("");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setWorkspaceId(defaultWorkspaceId ?? "");
    setDueDate(null);
    setDueTime("");
    setPriority("none");
    setAdvancedOpen(false);
    setAssigneeId(user?.id ?? "");
    setDescription("");
    setSubtasks([]);
    setSubtaskDraft("");
    setRecurrenceRule("");
    setError(null);
    api.get<{ workspaces: Workspace[] }>("/api/workspaces").then((res) => {
      setWorkspaces(res.workspaces);
      setWorkspaceId((current) => current || defaultWorkspaceId || res.workspaces[0]?.id || "");
    });
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [open, defaultWorkspaceId, user?.id]);

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

  async function handleSubmit() {
    if (!title.trim() || !workspaceId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const dueAt = dueDate ? new Date(`${dueDate}T${dueTime || "00:00"}`).toISOString() : undefined;
      const res = await api.post<{ task: Task }>("/api/tasks", {
        workspaceId,
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        priority: priority !== "none" ? priority : undefined,
        dueAt,
        ...(dueAt && recurrenceRule ? { recurrenceRule, recurrenceInterval: 1 } : {}),
      });

      if (subtasks.length > 0) {
        await Promise.all(
          subtasks.map((t) => api.post(`/api/tasks/${res.task.id}/checklist`, { title: t }).catch(() => null)),
        );
      }

      haptics.success();
      showToast("Задача создана", { tone: "success" });
      onCreated(res.task);
      onClose();
    } catch (err) {
      haptics.error();
      setError(err instanceof ApiError ? err.message : "Не удалось создать задачу");
    } finally {
      setSubmitting(false);
    }
  }

  function addSubtask() {
    if (!subtaskDraft.trim()) return;
    setSubtasks((prev) => [...prev, subtaskDraft.trim()]);
    setSubtaskDraft("");
  }

  const dateLabel = !dueDate
    ? "Срок"
    : dueDate === todayDateOnly()
      ? dueTime
        ? `Сегодня, ${dueTime}`
        : "Сегодня"
      : new Date(dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + (dueTime ? `, ${dueTime}` : "");

  return (
    <BottomSheet open={open} onClose={onClose} title="Новая задача">
      <div className="flex flex-col gap-3">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Что нужно сделать?"
          className="w-full border-0 bg-transparent text-[17px] font-medium text-content-primary placeholder:text-content-tertiary focus:outline-none"
        />

        {workspaces.length > 1 && (
          <button
            type="button"
            onClick={() => setWorkspacePickerOpen(true)}
            className="flex h-10 w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm text-content-primary"
          >
            {workspaces.find((w) => w.id === workspaceId)?.name ?? "Выберите пространство"}
            <ChevronDown size={15} className="text-content-tertiary" />
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          <Chip selected={Boolean(dueDate)} onClick={() => setDatePickerOpen(true)}>
            {dateLabel}
          </Chip>
          <Chip selected={priority !== "none"} onClick={() => setPriorityPickerOpen((p) => !p)}>
            {priority === "none" ? "Приоритет" : PRIORITY_DISPLAY[priority].label}
          </Chip>
        </div>

        {priorityPickerOpen && (
          <div className="flex flex-wrap gap-2 rounded-lg bg-surface-secondary p-2.5">
            {PRIORITY_ORDER.map((p) => (
              <Chip
                key={p}
                selected={priority === p}
                onClick={() => {
                  setPriority(priority === p ? "none" : p);
                  setPriorityPickerOpen(false);
                }}
              >
                {PRIORITY_DISPLAY[p].label}
              </Chip>
            ))}
          </div>
        )}

        {dueDate && <TimePicker value={dueTime} onChange={setDueTime} />}

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1 self-start text-sm font-medium text-content-secondary"
        >
          Дополнительно
          <ChevronDown size={15} className={`transition-transform duration-150 ${advancedOpen ? "rotate-180" : ""}`} />
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-3">
            {members.length > 0 && (
              <button
                type="button"
                onClick={() => setAssigneePickerOpen(true)}
                className="flex h-10 w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm text-content-primary"
              >
                {members.find((m) => m.user_id === assigneeId)
                  ? `${members.find((m) => m.user_id === assigneeId)!.user.first_name} ${members.find((m) => m.user_id === assigneeId)!.user.last_name ?? ""}`
                  : "Исполнитель не назначен"}
                <ChevronDown size={15} className="text-content-tertiary" />
              </button>
            )}

            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Описание"
              rows={2}
            />

            {dueDate && (
              <button
                type="button"
                onClick={() => setRecurrencePickerOpen(true)}
                className="flex h-10 w-full items-center justify-between rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm text-content-primary"
              >
                {recurrenceRule ? RECURRENCE_LABELS[recurrenceRule] : "Не повторять"}
                <ChevronDown size={15} className="text-content-tertiary" />
              </button>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium text-content-secondary">Подзадачи</p>
              <div className="flex flex-col gap-1.5">
                {subtasks.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2 text-sm">
                    {s}
                    <button
                      onClick={() => setSubtasks((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Убрать подзадачу"
                      className="text-content-tertiary"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    value={subtaskDraft}
                    onChange={(e) => setSubtaskDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder="Добавить пункт"
                    className="h-10 flex-1 rounded-lg border border-border-subtle bg-surface-primary px-3 text-sm"
                  />
                  <button
                    onClick={addSubtask}
                    aria-label="Добавить подзадачу"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-content-secondary"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!title.trim() || !workspaceId || submitting}
          onClick={handleSubmit}
          className="mt-1"
        >
          {submitting ? "Создание..." : "Создать"}
        </Button>
      </div>

      <DatePicker
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        value={dueDate}
        onChange={setDueDate}
      />
      <ActionSheet
        open={workspacePickerOpen}
        onClose={() => setWorkspacePickerOpen(false)}
        title="Пространство"
        items={workspaces.map(
          (w): ActionSheetItem => ({ label: w.name, onSelect: () => setWorkspaceId(w.id) }),
        )}
      />
      <ActionSheet
        open={assigneePickerOpen}
        onClose={() => setAssigneePickerOpen(false)}
        title="Исполнитель"
        items={[
          { label: "Не назначен", onSelect: () => setAssigneeId("") },
          ...members.map(
            (m): ActionSheetItem => ({
              label: `${m.user.first_name} ${m.user.last_name ?? ""}`.trim(),
              onSelect: () => setAssigneeId(m.user_id),
            }),
          ),
        ]}
      />
      <ActionSheet
        open={recurrencePickerOpen}
        onClose={() => setRecurrencePickerOpen(false)}
        title="Повторение"
        items={[
          { label: "Не повторять", onSelect: () => setRecurrenceRule("") },
          ...(Object.keys(RECURRENCE_LABELS) as RecurrenceRule[]).map(
            (r): ActionSheetItem => ({ label: RECURRENCE_LABELS[r], onSelect: () => setRecurrenceRule(r) }),
          ),
        ]}
      />
    </BottomSheet>
  );
}

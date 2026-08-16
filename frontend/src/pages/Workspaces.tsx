import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { CardSkeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { AvatarGroup } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Input } from "../components/ui/Input";
import { ErrorMessage } from "../components/Feedback";
import type { Task, Workspace, WorkspaceMemberWithUser } from "../types";

interface WorkspaceSummary {
  workspace: Workspace;
  total: number;
  done: number;
  members: WorkspaceMemberWithUser[];
}

export function Workspaces() {
  const [summaries, setSummaries] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.get<{ workspaces: Workspace[] }>("/api/workspaces");
      // N+1 by design for now: /api/workspaces has no summary counts of its
      // own. Fine at this scale (a handful of workspaces per user); worth a
      // dedicated /api/workspaces/:id/summary endpoint if that changes.
      const withSummary = await Promise.all(
        res.workspaces.map(async (workspace) => {
          const [tasksRes, membersRes] = await Promise.all([
            api.get<{ tasks: Task[] }>(`/api/workspaces/${workspace.id}/tasks`),
            api.get<{ members: WorkspaceMemberWithUser[] }>(`/api/workspaces/${workspace.id}/members`),
          ]);
          return {
            workspace,
            total: tasksRes.tasks.length,
            done: tasksRes.tasks.filter((t) => t.status === "done").length,
            members: membersRes.members,
          };
        }),
      );
      setSummaries(withSummary);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить группы");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post<{ workspace: Workspace }>("/api/workspaces", { name: name.trim() });
      setName("");
      setCreating(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать группу");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-content px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
      <PageHeader title="Проекты" action={<Button size="sm" onClick={() => setCreating(true)}>+ Проект</Button>} />

      {error && <ErrorMessage message={error} onRetry={load} />}

      {!error && !summaries && (
        <div className="flex flex-col gap-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {!error && summaries && summaries.length === 0 && (
        <EmptyState
          icon={<FolderPlus size={28} />}
          title="Пока нет проектов"
          hint="Создайте первый проект и объедините связанные задачи в одном месте."
          actionLabel="Создать проект"
          onAction={() => setCreating(true)}
        />
      )}

      {summaries && summaries.length > 0 && (
        <div className="flex flex-col gap-3">
          {summaries.map((s) => (
            <ProjectCard key={s.workspace.id} summary={s} />
          ))}
        </div>
      )}

      <BottomSheet open={creating} onClose={() => setCreating(false)} title="Новый проект">
        <div className="flex flex-col gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название проекта"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button variant="primary" size="lg" fullWidth disabled={!name.trim() || submitting} onClick={handleCreate}>
            {submitting ? "Создание..." : "Создать"}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

function ProjectCard({ summary }: { summary: WorkspaceSummary }) {
  const { workspace, total, done, members } = summary;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link to={`/workspaces/${workspace.id}`}>
      <Card className="p-4 active:opacity-80">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
          <h3 className="truncate text-[15px] font-semibold text-content-primary">{workspace.name}</h3>
        </div>

        {total > 0 ? (
          <>
            <p className="mt-2 text-sm text-content-secondary">
              {total} {total === 1 ? "задача" : "задач"} · {done} выполнено
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-secondary">
              <div className="h-full rounded-pill bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-content-tertiary">Нет задач</p>
        )}

        {members.length > 0 && (
          <div className="mt-3">
            <AvatarGroup people={members.map((m) => ({ firstName: m.user.first_name, lastName: m.user.last_name }))} size={24} />
          </div>
        )}
      </Card>
    </Link>
  );
}

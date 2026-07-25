import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { PageLayout } from "../components/PageLayout";
import { Loading, ErrorMessage, EmptyState } from "../components/Feedback";
import type { Workspace } from "../types";

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await api.get<{ workspaces: Workspace[] }>("/api/workspaces");
      setWorkspaces(res.workspaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить группы");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await api.post<{ workspace: Workspace }>("/api/workspaces", { name });
      setWorkspaces((prev) => [res.workspace, ...(prev ?? [])]);
      setName("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Не удалось создать группу");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageLayout title="Рабочие группы">
      <form onSubmit={handleCreate} className="mb-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название новой группы"
          className="flex-1 rounded-xl bg-tg-secondaryBg px-3.5 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="shrink-0 rounded-xl bg-tg-button px-4 py-2.5 text-sm font-medium text-tg-buttonText disabled:opacity-50"
        >
          Создать
        </button>
      </form>
      {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}

      {error && <ErrorMessage message={error} onRetry={load} />}
      {!error && !workspaces && <Loading />}
      {!error && workspaces && workspaces.length === 0 && (
        <EmptyState title="У вас пока нет групп" hint="Создайте первую группу выше" />
      )}
      {workspaces && workspaces.length > 0 && (
        <div className="flex flex-col gap-2">
          {workspaces.map((w) => (
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
    </PageLayout>
  );
}

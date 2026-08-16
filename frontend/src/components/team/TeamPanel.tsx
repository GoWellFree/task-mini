import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import type { Task, WorkspaceMemberWithUser } from "../../types";

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  admin: "Админ",
  manager: "Менеджер",
  member: "Участник",
  viewer: "Гость",
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

interface MemberLoad {
  member: WorkspaceMemberWithUser;
  active: number;
  today: number;
  overdue: number;
}

/** Members with active (non-done) task counts and a simple relative workload bar — the spec explicitly warns against turning this into a BI panel. */
export function TeamPanel({ members, tasks }: { members: WorkspaceMemberWithUser[]; tasks: Task[] }) {
  const now = new Date();
  const loads: MemberLoad[] = members.map((member) => {
    const mine = tasks.filter((t) => t.assignee_id === member.user_id && t.status !== "done");
    return {
      member,
      active: mine.length,
      today: mine.filter((t) => t.due_at && new Date(t.due_at) >= startOfDay(now) && new Date(t.due_at) <= endOfDay(now)).length,
      overdue: mine.filter((t) => t.due_at && new Date(t.due_at) < startOfDay(now)).length,
    };
  });
  const maxActive = Math.max(1, ...loads.map((l) => l.active));

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {loads.map(({ member, active, today, overdue }) => (
        <div key={member.id} className="flex items-center gap-3 py-3">
          <Avatar firstName={member.user.first_name} lastName={member.user.last_name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium text-content-primary">{member.user.first_name} {member.user.last_name ?? ""}</p>
              {member.role === "owner" && <Badge tone="accent">Владелец</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-content-tertiary">
              {active} {active === 1 ? "задача" : "задач"}
              {today > 0 && ` · ${today} сегодня`}
              {overdue > 0 && ` · ${overdue} просрочено`}
            </p>
            <div className="mt-1.5 h-1.5 w-full max-w-[160px] overflow-hidden rounded-pill bg-surface-secondary">
              <div className="h-full rounded-pill bg-accent transition-[width] duration-300" style={{ width: `${(active / maxActive) * 100}%` }} />
            </div>
          </div>
          {member.role !== "owner" && <span className="shrink-0 text-xs text-content-tertiary">{ROLE_LABELS[member.role] ?? member.role}</span>}
        </div>
      ))}
    </div>
  );
}

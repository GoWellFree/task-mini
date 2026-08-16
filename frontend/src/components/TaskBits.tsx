import type { TaskPriority, TaskStatus } from "../types";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Без приоритета",
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочный",
};

// The create/edit UI only offers todo/in_progress/done for now (kanban and a
// full status picker are later work) — the rest are labeled here so any task
// already carrying one of the wider API statuses still displays sensibly.
export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Входящие",
  todo: "К выполнению",
  in_progress: "В работе",
  waiting: "Ожидание",
  review: "На проверке",
  done: "Выполнено",
  cancelled: "Отменено",
};

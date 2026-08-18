import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BottomSheet } from "./BottomSheet";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function nextWeekday(from: Date, targetDay: number): Date {
  const diff = (targetDay - from.getDay() + 7) % 7 || 7;
  return addDays(from, diff);
}

interface DatePickerProps {
  open: boolean;
  onClose: () => void;
  /**
   * yyyy-mm-dd, null for "explicitly no due date" (highlights the "Без
   * срока" shortcut), or undefined for "nothing chosen yet" — e.g. a bulk
   * action with no single current date to show, where highlighting "Без
   * срока" would misleadingly look like an existing selection.
   */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}

export function DatePicker({ open, onClose, value, onChange }: DatePickerProps) {
  const today = startOfDay(new Date());
  const initialMonth = value ? new Date(value) : today;
  const [viewMonth, setViewMonth] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));

  function pick(d: Date | null) {
    onChange(d ? toDateOnly(d) : null);
    onClose();
  }

  const shortcuts: { label: string; date: Date | null }[] = [
    { label: "Сегодня", date: today },
    { label: "Завтра", date: addDays(today, 1) },
    { label: "Эти выходные", date: nextWeekday(today, 6) },
    { label: "Следующая неделя", date: nextWeekday(today, 1) },
    { label: "Без срока", date: null },
  ];

  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Срок">
      <div className="flex flex-wrap gap-2">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            onClick={() => pick(s.date)}
            className={`rounded-pill border px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${
              value !== undefined && (value === null) === (s.date === null) && (s.date === null || value === toDateOnly(s.date))
                ? "border-accent bg-accent-soft text-accent"
                : "border-border-subtle text-content-secondary active:opacity-70"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          aria-label="Предыдущий месяц"
          className="flex h-8 w-8 items-center justify-center rounded-full text-content-secondary active:bg-surface-secondary"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-content-primary">
          {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          aria-label="Следующий месяц"
          className="flex h-8 w-8 items-center justify-center rounded-full text-content-secondary active:bg-surface-secondary"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-xs font-medium text-content-tertiary">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const isSelected = value === toDateOnly(d);
          const isToday = toDateOnly(d) === toDateOnly(today);
          return (
            <button
              key={i}
              onClick={() => pick(d)}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors duration-150 ${
                isSelected
                  ? "bg-accent font-semibold text-white"
                  : isToday
                    ? "font-semibold text-accent"
                    : "text-content-primary active:bg-surface-secondary"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

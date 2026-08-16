/** Small, dependency-free per-user local-time helpers for the digest worker. */

export interface LocalTimeParts {
  /** "YYYY-MM-DD" in the given timezone. */
  dateStr: string;
  hours: number;
  minutes: number;
}

export function getLocalTimeParts(instant: Date, timezone: string): LocalTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  // Some engines render midnight as hour "24" under hour12:false.
  const hours = parts.hour === "24" ? 0 : Number(parts.hour);
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hours, minutes: Number(parts.minute) };
}

/**
 * The UTC instant corresponding to `HH:MM` wall-clock time on `dateStr` in
 * `timezone`. Standard "guess UTC, measure the zoned discrepancy, correct for
 * it" trick — avoids a timezone-database dependency. Not exact across a DST
 * transition (the local day could be 23h/25h, not 24h), which is an
 * acceptable margin for a once-a-day digest boundary, not worth a library for.
 *
 * Deliberately never round-trips through `new Date(someString)`: parsing a
 * plain (non-"Z"/non-offset) string uses the RUNTIME's own local timezone,
 * not UTC, so that would silently corrupt this on any host whose local
 * timezone isn't UTC. `Date.UTC` and `formatToParts` are used instead — both
 * are explicit about which timezone they mean, never implicit.
 */
function zonedWallTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number) as [number, number, number];
  const [hour, minute] = timeStr.split(":").map(Number) as [number, number];
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(naiveUtc)).map((p) => [p.type, p.value]));
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const diff = naiveUtc - zonedAsUtc;
  return new Date(naiveUtc + diff);
}

export function localDayBoundsUtc(dateStr: string, timezone: string): { start: Date; end: Date } {
  const start = zonedWallTimeToUtc(dateStr, "00:00", timezone);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function matchesTimeOfDay(hours: number, minutes: number, timeStr: string): boolean {
  const [h, m] = timeStr.split(":").map(Number);
  return hours === h && minutes === m;
}

/** Handles a window that wraps past midnight (e.g. 22:00–07:00). Null bounds mean "no quiet hours configured". */
export function isWithinQuietHours(
  hours: number,
  minutes: number,
  quietStart: string | null,
  quietEnd: string | null,
): boolean {
  if (!quietStart || !quietEnd) return false;
  const current = hours * 60 + minutes;
  const [startH, startM] = quietStart.split(":").map(Number) as [number, number];
  const [endH, endM] = quietEnd.split(":").map(Number) as [number, number];
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

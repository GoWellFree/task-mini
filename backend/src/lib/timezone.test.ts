import { describe, expect, it } from "vitest";
import { getLocalTimeParts, isWithinQuietHours, localDayBoundsUtc, matchesTimeOfDay } from "./timezone.js";

describe("getLocalTimeParts", () => {
  it("reads UTC as-is", () => {
    const parts = getLocalTimeParts(new Date("2026-03-15T09:30:00.000Z"), "UTC");
    expect(parts).toEqual({ dateStr: "2026-03-15", hours: 9, minutes: 30 });
  });

  it("shifts forward for a positive offset (Europe/Moscow, UTC+3)", () => {
    const parts = getLocalTimeParts(new Date("2026-03-15T22:15:00.000Z"), "Europe/Moscow");
    expect(parts).toEqual({ dateStr: "2026-03-16", hours: 1, minutes: 15 });
  });

  it("shifts backward for a negative offset and rolls to the previous day", () => {
    // US DST starts 2026-03-08, so 2026-03-15 is already EDT (UTC-4).
    const parts = getLocalTimeParts(new Date("2026-03-15T02:00:00.000Z"), "America/New_York");
    expect(parts.dateStr).toBe("2026-03-14");
    expect(parts.hours).toBe(22);
    expect(parts.minutes).toBe(0);
  });
});

describe("localDayBoundsUtc", () => {
  it("returns a 24h window starting at local midnight", () => {
    const { start, end } = localDayBoundsUtc("2026-03-15", "Europe/Moscow");
    expect(start.toISOString()).toBe("2026-03-14T21:00:00.000Z"); // 00:00 MSK = 21:00 UTC the day before
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("round-trips with getLocalTimeParts for the same instant", () => {
    const { start } = localDayBoundsUtc("2026-06-01", "Asia/Tokyo");
    const parts = getLocalTimeParts(start, "Asia/Tokyo");
    expect(parts).toEqual({ dateStr: "2026-06-01", hours: 0, minutes: 0 });
  });
});

describe("matchesTimeOfDay", () => {
  it("matches exact hour and minute", () => {
    expect(matchesTimeOfDay(9, 0, "09:00")).toBe(true);
  });

  it("does not match a different minute", () => {
    expect(matchesTimeOfDay(9, 1, "09:00")).toBe(false);
  });
});

describe("isWithinQuietHours", () => {
  it("is false when neither bound is configured", () => {
    expect(isWithinQuietHours(23, 0, null, null)).toBe(false);
  });

  it("handles a same-day window (e.g. 13:00-14:00)", () => {
    expect(isWithinQuietHours(13, 30, "13:00", "14:00")).toBe(true);
    expect(isWithinQuietHours(14, 0, "13:00", "14:00")).toBe(false); // end is exclusive
    expect(isWithinQuietHours(12, 59, "13:00", "14:00")).toBe(false);
  });

  it("handles a window that wraps past midnight (22:00-07:00)", () => {
    expect(isWithinQuietHours(23, 0, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(3, 0, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(12, 0, "22:00", "07:00")).toBe(false);
    expect(isWithinQuietHours(22, 0, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(6, 59, "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(7, 0, "22:00", "07:00")).toBe(false);
  });

  it("treats an equal start/end as no quiet hours", () => {
    expect(isWithinQuietHours(10, 0, "08:00", "08:00")).toBe(false);
  });
});

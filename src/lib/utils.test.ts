import { describe, it, expect } from "vitest";
import { dayGroup, dayKey, formatTime, getDayGutter } from "./utils";

// 2026-07-17 15:00 local time
const now = new Date(2026, 6, 17, 15, 0, 0);
const startOfToday = new Date(2026, 6, 17).getTime();

describe("dayGroup", () => {
  it("buckets by local-midnight boundaries", () => {
    expect(dayGroup(startOfToday, now)).toBe("today");
    expect(dayGroup(startOfToday + 1, now)).toBe("today"); // future same day
    expect(dayGroup(startOfToday - 1, now)).toBe("yesterday");
    expect(dayGroup(startOfToday - 86_400_000, now)).toBe("yesterday");
    expect(dayGroup(startOfToday - 86_400_000 - 1, now)).toBe("earlier");
  });
});

describe("dayKey", () => {
  it("groups same-day timestamps and splits across midnights", () => {
    expect(dayKey(startOfToday)).toBe(startOfToday);
    expect(dayKey(startOfToday + 3_600_000)).toBe(startOfToday);
    expect(dayKey(startOfToday - 1)).toBe(startOfToday - 86_400_000);
  });
});

describe("formatTime", () => {
  it("renders an HH:mm-like localized time", () => {
    const ts = new Date(2026, 6, 17, 9, 5).getTime();
    expect(formatTime(ts, "zh")).toMatch(/\d{1,2}:\d{2}/);
    expect(formatTime(ts, "fr")).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("getDayGutter", () => {
  it("splits day, weekday and month", () => {
    const g = getDayGutter(startOfToday, "zh");
    expect(g.day).toBe(17);
    expect(g.weekday.length).toBeGreaterThan(0);
    expect(g.month.length).toBeGreaterThan(0);
    expect(g.year).toBeNull();
  });

  it("appends the year for past years", () => {
    const old = new Date(2020, 0, 5).getTime();
    const g = getDayGutter(old, "en");
    expect(g.day).toBe(5);
    expect(g.year).toBe("2020");
  });
});

import { describe, it, expect } from "vitest";
import { dayGroup } from "./utils";

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

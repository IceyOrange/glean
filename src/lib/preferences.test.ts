import { describe, it, expect, beforeEach } from "vitest";
import {
  getAutoThought,
  setAutoThought,
  noteThoughtSkip,
  resetThoughtSkips,
  THOUGHT_SKIP_THRESHOLD,
} from "./preferences";

function makeChrome() {
  let store: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        get: async (keys?: string | string[] | null) => {
          if (keys == null) return { ...store };
          if (typeof keys === "string") return { [keys]: store[keys] };
          return Object.fromEntries(keys.map((k) => [k, store[k]]));
        },
        set: async (obj: Record<string, unknown>) => {
          store = { ...store, ...obj };
        },
        remove: async (k: string) => {
          delete store[k];
        },
      },
    },
  };
}

describe("auto-thought preference", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).chrome = makeChrome();
  });

  it("defaults to true when unset", async () => {
    expect(await getAutoThought()).toBe(true);
  });

  it("persists explicit set", async () => {
    await setAutoThought(false);
    expect(await getAutoThought()).toBe(false);
    await setAutoThought(true);
    expect(await getAutoThought()).toBe(true);
  });

  it("turns auto-open off after THOUGHT_SKIP_THRESHOLD consecutive skips", async () => {
    for (let i = 0; i < THOUGHT_SKIP_THRESHOLD - 1; i++) {
      expect(await noteThoughtSkip()).toBe(false);
      expect(await getAutoThought()).toBe(true);
    }
    expect(await noteThoughtSkip()).toBe(true);
    expect(await getAutoThought()).toBe(false);
  });

  it("resets the skip streak so it never reaches the threshold", async () => {
    for (let i = 0; i < THOUGHT_SKIP_THRESHOLD - 1; i++) {
      await noteThoughtSkip();
    }
    await resetThoughtSkips();
    for (let i = 0; i < THOUGHT_SKIP_THRESHOLD - 1; i++) {
      expect(await noteThoughtSkip()).toBe(false);
    }
    expect(await getAutoThought()).toBe(true);
  });

  it("clears the skip count when manually re-enabled", async () => {
    for (let i = 0; i < THOUGHT_SKIP_THRESHOLD; i++) {
      await noteThoughtSkip();
    }
    expect(await getAutoThought()).toBe(false);
    await setAutoThought(true);
    // A fresh streak starts from zero: threshold - 1 skips are not enough.
    for (let i = 0; i < THOUGHT_SKIP_THRESHOLD - 1; i++) {
      expect(await noteThoughtSkip()).toBe(false);
    }
    expect(await getAutoThought()).toBe(true);
  });
});

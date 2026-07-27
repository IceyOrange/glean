import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const STYLE_ID = "glean-highlight-flash-style";
const HIGHLIGHT_NAME = "glean-flash";

function makeMocks() {
  let styleEl: Record<string, unknown> | null = null;
  const highlights = new Map<string, unknown>();
  const rafCallbacks = new Map<number, (time: number) => void>();
  let rafId = 0;
  let now = 0;
  let reducedMotion = false;

  const documentMock = {
    getElementById: (id: string) => (id === STYLE_ID ? styleEl : null),
    createElement: (tag: string) => {
      const el = {
        tagName: tag,
        id: "",
        textContent: "",
        appendChild: vi.fn(),
        remove: vi.fn(),
      };
      if (tag === "style") styleEl = el;
      return el;
    },
    head: { appendChild: vi.fn() },
    documentElement: { appendChild: vi.fn() },
  };

  const CSSMock = {
    highlights: {
      set: vi.fn((name: string, value: unknown) => highlights.set(name, value)),
      delete: vi.fn((name: string) => highlights.delete(name)),
      has: (name: string) => highlights.has(name),
    },
  };

  const HighlightMock = vi.fn((range: unknown) => ({ range }));

  const windowMock = {
    matchMedia: (query: string) => ({
      matches:
        query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
    }),
  };

  const performanceMock = {
    now: () => now,
  };

  const requestAnimationFrameMock = (cb: (time: number) => void) => {
    rafId += 1;
    rafCallbacks.set(rafId, cb);
    return rafId;
  };

  const cancelAnimationFrameMock = (id: number) => {
    rafCallbacks.delete(id);
  };

  (globalThis as Record<string, unknown>).document = documentMock;
  (globalThis as Record<string, unknown>).CSS = CSSMock;
  (globalThis as Record<string, unknown>).Highlight = HighlightMock;
  (globalThis as Record<string, unknown>).window = windowMock;
  (globalThis as Record<string, unknown>).performance = performanceMock;
  (globalThis as Record<string, unknown>).requestAnimationFrame =
    requestAnimationFrameMock;
  (globalThis as Record<string, unknown>).cancelAnimationFrame =
    cancelAnimationFrameMock;

  return {
    highlights,
    get style() {
      return styleEl;
    },
    alpha: () =>
      parseFloat(
        (styleEl?.textContent as string | undefined)?.match(
          /rgba\(214, 122, 90, ([\d.]+)\)/
        )?.[1] ?? "0"
      ),
    runRaf: (id: number, time?: number) => {
      const cb = rafCallbacks.get(id);
      if (cb) cb(time ?? now);
    },
    getNextRafId: () => rafId,
    setNow: (value: number) => {
      now = value;
    },
    setReducedMotion: (value: boolean) => {
      reducedMotion = value;
    },
  };
}

async function loadFlash() {
  vi.resetModules();
  const mod = await import("./highlight-flash");
  return mod;
}

function makeSelection(range: { collapsed: boolean }) {
  return {
    rangeCount: 1,
    getRangeAt: () => ({
      cloneRange: () => range,
      collapsed: range.collapsed,
    }),
  } as unknown as Selection;
}

describe("flashSelection + releaseFlash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when CSS.highlights is unavailable", async () => {
    const mocks = makeMocks();
    (globalThis as Record<string, unknown>).CSS = {};
    const { flashSelection } = await loadFlash();
    expect(flashSelection(makeSelection({ collapsed: false }))).toBeNull();
    expect(mocks.highlights.size).toBe(0);
  });

  it("does nothing for a collapsed selection", async () => {
    const mocks = makeMocks();
    const { flashSelection } = await loadFlash();
    expect(flashSelection(makeSelection({ collapsed: true }))).toBeNull();
    expect(mocks.highlights.size).toBe(0);
    expect(mocks.style).toBeNull();
  });

  it("blooms to peak, settles to rest, then holds without rAF", async () => {
    const mocks = makeMocks();
    const { flashSelection } = await loadFlash();
    mocks.setNow(0);
    const gen = flashSelection(makeSelection({ collapsed: false }));
    expect(gen).not.toBeNull();
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(true);

    // Mid-bloom: between 0 and peak.
    let id = mocks.getNextRafId();
    mocks.runRaf(id, 110);
    expect(mocks.alpha()).toBeGreaterThan(0);
    expect(mocks.alpha()).toBeLessThan(0.36);

    // Peak at end of bloom (220ms).
    id = mocks.getNextRafId();
    mocks.runRaf(id, 220);
    expect(mocks.alpha()).toBeCloseTo(0.36, 2);

    // Settled to rest at 220 + 650ms.
    id = mocks.getNextRafId();
    mocks.runRaf(id, 870);
    expect(mocks.alpha()).toBeCloseTo(0.24, 2);

    // Holding: no further rAF is scheduled.
    expect(mocks.getNextRafId()).toBe(id);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(true);
  });

  it("holds until released, then fades slowly to zero", async () => {
    const mocks = makeMocks();
    const { flashSelection, releaseFlash } = await loadFlash();
    mocks.setNow(0);
    const gen = flashSelection(makeSelection({ collapsed: false }));

    // Settle to rest.
    mocks.runRaf(mocks.getNextRafId(), 870);

    // Still highlighted long afterwards (the toast is still open).
    mocks.setNow(15_000);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(true);
    expect(mocks.alpha()).toBeCloseTo(0.24, 2);

    // Release → fade begins.
    releaseFlash(gen ?? undefined);
    const fadeId = mocks.getNextRafId();

    // Mid-fade: below rest but above zero.
    mocks.runRaf(fadeId, 15_000 + 1200);
    expect(mocks.alpha()).toBeGreaterThan(0);
    expect(mocks.alpha()).toBeLessThan(0.24);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(true);

    // Fade complete → removed.
    mocks.runRaf(mocks.getNextRafId(), 15_000 + 2400);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("ignores a stale release token after a newer save supersedes", async () => {
    const mocks = makeMocks();
    const { flashSelection, releaseFlash } = await loadFlash();
    mocks.setNow(0);
    const genA = flashSelection(makeSelection({ collapsed: false }));
    mocks.runRaf(mocks.getNextRafId(), 870); // A rests

    mocks.setNow(1000);
    const genB = flashSelection(makeSelection({ collapsed: false }));
    expect(genB).toBeGreaterThan(genA ?? 0);

    // Releasing A is a no-op: B's highlight is untouched.
    releaseFlash(genA ?? undefined);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(true);

    // B blooms again from its own timeline.
    mocks.runRaf(mocks.getNextRafId(), 1000 + 220);
    expect(mocks.alpha()).toBeCloseTo(0.36, 2);
  });

  it("in reduced motion, rests immediately and removes instantly on release", async () => {
    const mocks = makeMocks();
    mocks.setReducedMotion(true);
    const { flashSelection, releaseFlash } = await loadFlash();
    const gen = flashSelection(makeSelection({ collapsed: false }));

    expect(mocks.alpha()).toBeCloseTo(0.24, 2);
    expect(mocks.getNextRafId()).toBe(0);

    releaseFlash(gen ?? undefined);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(false);
  });

  it("fades on its own if the release never arrives (safety cap)", async () => {
    vi.useFakeTimers();
    const mocks = makeMocks();
    const { flashSelection } = await loadFlash();
    mocks.setNow(0);
    flashSelection(makeSelection({ collapsed: false }));
    mocks.runRaf(mocks.getNextRafId(), 870); // settle → safety timer armed

    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);

    // Safety release kicked in: a fade rAF is now scheduled.
    mocks.setNow(870 + 60_000);
    expect(mocks.getNextRafId()).toBeGreaterThan(1);
    mocks.runRaf(mocks.getNextRafId(), 870 + 60_000 + 2400);
    expect(mocks.highlights.has(HIGHLIGHT_NAME)).toBe(false);
  });
});

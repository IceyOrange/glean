/**
 * Selection highlight, bound to the saved-toast lifecycle.
 *
 * Design contract (see docs/capture-ux.md):
 * - On save success the selected text blooms to a warm tint, then settles to
 *   a calm resting alpha. It STAYS while the toast is open — the highlight is
 *   the toast's anchor on the page, not a self-timed notification.
 * - Only when the toast is gone (thought submitted, clicked away, reading
 *   release) does the highlight fade — slowly (~2.4s ease-out).
 * - A new save supersedes the previous highlight immediately.
 *
 * Technical notes:
 * - `::highlight()` rules must live in page-level CSS, not the shadow root,
 *   so we inject a <style> element into <head>. Strict CSP (style-src without
 *   'unsafe-inline') may silently block it — the save flow is unaffected.
 * - Chrome 105+ / Firefox 140+. Everything is feature-detected and wrapped in
 *   try/catch: this is confirmation polish, never worth breaking a save.
 */

const STYLE_ID = "glean-highlight-flash-style";
const HIGHLIGHT_NAME = "glean-flash";

// Warm seal tone, readable on both light and dark pages.
const FLASH_RGB = "214, 122, 90";
const PEAK_ALPHA = 0.36; // brief attention bloom on save
const REST_ALPHA = 0.24; // calm resting tint while the toast is open
const BLOOM_MS = 220; // 0 → peak
const SETTLE_MS = 650; // peak → rest
const FADE_MS = 2400; // rest → 0, only after the toast is gone
const MAX_HOLD_MS = 60_000; // safety net if release never arrives

let flashGen = 0;
let activeRafId: number | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let currentAlpha = 0;

function reducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

function stopRaf() {
  if (activeRafId !== null) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }
}

function stopHoldTimer() {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

/**
 * Tint the selection and return the generation token owning this highlight.
 * Pass the token to releaseFlash() when the toast goes away; a stale token
 * (superseded by a newer save) makes releaseFlash a no-op.
 * Returns null when the Custom Highlight API is unavailable.
 */
export function flashSelection(sel: Selection): number | null {
  try {
    if (typeof CSS === "undefined" || !CSS.highlights) return null;
    if (typeof Highlight === "undefined") return null;
    if (sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0).cloneRange();
    if (range.collapsed) return null;

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    const setAlpha = (alpha: number) => {
      currentAlpha = alpha;
      if (!style) return;
      style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(${FLASH_RGB}, ${alpha.toFixed(3)}); }`;
    };

    // A new save supersedes any in-flight bloom/fade and takes over the ranges.
    stopRaf();
    stopHoldTimer();
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
    const gen = ++flashGen;

    // Safety net: never leave a page tinted forever if the release is lost.
    const armHoldSafety = () => {
      stopHoldTimer();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        releaseFlash(gen);
      }, MAX_HOLD_MS);
    };

    if (reducedMotion()) {
      setAlpha(REST_ALPHA);
      armHoldSafety();
      return gen;
    }

    // Bloom to peak, settle to rest, then hold (no rAF while holding).
    const start = performance.now();
    const tick = (now: number) => {
      if (gen !== flashGen) return;
      const elapsed = now - start;
      if (elapsed < BLOOM_MS) {
        setAlpha(PEAK_ALPHA * easeOutCubic(elapsed / BLOOM_MS));
      } else if (elapsed < BLOOM_MS + SETTLE_MS) {
        const u = (elapsed - BLOOM_MS) / SETTLE_MS;
        setAlpha(PEAK_ALPHA + (REST_ALPHA - PEAK_ALPHA) * easeOutCubic(u));
      } else {
        setAlpha(REST_ALPHA);
        activeRafId = null;
        armHoldSafety();
        return;
      }
      activeRafId = requestAnimationFrame(tick);
    };
    setAlpha(0);
    activeRafId = requestAnimationFrame(tick);
    return gen;
  } catch {
    // Probe only — ignore failures (old engines, exotic selections, CSP).
    return null;
  }
}

/**
 * Begin the slow fade-out. Called when the saved toast disappears.
 * `gen` must be the token returned by flashSelection; a stale token (a newer
 * save already replaced the highlight) makes this a no-op.
 */
export function releaseFlash(gen?: number): void {
  try {
    if (typeof CSS === "undefined" || !CSS.highlights) return;
    if (gen !== undefined && gen !== flashGen) return;
    if (!CSS.highlights.has(HIGHLIGHT_NAME)) return;

    stopRaf();
    stopHoldTimer();
    const myGen = flashGen;
    const style = document.getElementById(STYLE_ID);

    const finish = () => {
      if (myGen !== flashGen) return;
      CSS.highlights.delete(HIGHLIGHT_NAME);
      style?.remove();
    };

    if (reducedMotion()) {
      finish();
      return;
    }

    const fromAlpha = currentAlpha;
    const start = performance.now();
    const tick = (now: number) => {
      if (myGen !== flashGen) return;
      const elapsed = now - start;
      if (elapsed >= FADE_MS) {
        finish();
        activeRafId = null;
        return;
      }
      const alpha = fromAlpha * (1 - easeOutCubic(elapsed / FADE_MS));
      currentAlpha = alpha;
      if (style) {
        style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(${FLASH_RGB}, ${alpha.toFixed(3)}); }`;
      }
      activeRafId = requestAnimationFrame(tick);
    };
    activeRafId = requestAnimationFrame(tick);
  } catch {
    // Probe only.
  }
}

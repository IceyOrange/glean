/** Toast geometry constants and helpers. */

export const SHORT_WIDTH = 220;
export const LONG_WIDTH_BASE = 380;
export const WIDTH_EXPAND_THRESHOLD = 18; // px before edge
export const WIDTH_CONTRACT_THRESHOLD = 40; // px of headroom before contracting

/** Max textarea width that fits the viewport with margins. */
export function getMaxTextareaWidth(): number {
  // viewport margins (8px each side) + toast border + thought-area padding
  // + flex gap + send button. Keep the short width as a floor.
  return Math.max(SHORT_WIDTH, window.innerWidth - 72);
}

/** Keep the toast element inside the viewport. */
export function clampToastPosition(toastEl: HTMLElement): void {
  const rect = toastEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = parseFloat(toastEl.style.left) || rect.left;
  let top = parseFloat(toastEl.style.top) || rect.top;

  if (rect.right > vw - 8) left = vw - rect.width - 8;
  if (rect.bottom > vh - 8) top = vh - rect.height - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  toastEl.style.left = `${left}px`;
  toastEl.style.top = `${top}px`;
}

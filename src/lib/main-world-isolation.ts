/**
 * This function is executed in the page's main world via
 * chrome.scripting.executeScript. It must be completely self-contained
 * because it is serialized before injection.
 *
 * It isolates the extension's thought textarea from page-level event
 * listeners and programmatic focus calls, which prevents AI chat sites
 * (ChatGPT, Claude, etc.) from stealing focus while the user is typing a
 * thought.
 */
export function mainWorldIsolation() {
  if ((window as unknown as Record<string, unknown>).__gleanKeyboardIsolation) return;
  (window as unknown as Record<string, unknown>).__gleanKeyboardIsolation = true;

  const isInsideGlean = (e: Event): boolean => {
    const path = e.composedPath ? e.composedPath() : [];
    return path.some(
      (el) =>
        el instanceof Element &&
        ((el as Element).id === "glean-thought" ||
          (el as Element).id === "glean-popover-host")
    );
  };

  // 1. Patch stopPropagation/stopImmediatePropagation so page scripts cannot
  //    prevent our extension's handlers from running. We keep references to
  //    the originals so our own listeners can still stop events from escaping.
  const originalStopPropagation = Event.prototype.stopPropagation;
  const originalStopImmediatePropagation = Event.prototype.stopImmediatePropagation;

  Event.prototype.stopPropagation = function (this: Event) {
    if (isInsideGlean(this)) return;
    return originalStopPropagation.call(this);
  };

  Event.prototype.stopImmediatePropagation = function (this: Event) {
    if (isInsideGlean(this)) return;
    return originalStopImmediatePropagation.call(this);
  };

  // 2. Stop keyboard/input/composition/focus events from escaping our Shadow
  //    DOM after they reach the textarea. We listen on document in the bubble
  //    phase so our own capture/target handlers run first; then we use the
  //    saved originals to stop propagation before the rest of the page sees
  //    the event.
  const EVENTS = [
    "keydown",
    "keyup",
    "keypress",
    "input",
    "beforeinput",
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "focusin",
    "focusout",
    "selectstart",
  ];
  EVENTS.forEach((name) => {
    document.addEventListener(
      name,
      (e) => {
        if (isInsideGlean(e)) {
          originalStopPropagation.call(e);
          originalStopImmediatePropagation.call(e);
        }
      },
      false
    );
  });

  // 3. Guard HTMLElement.prototype.focus: while our thought textarea is
  //    focused, prevent the page from programmatically focusing anything
  //    outside our extension UI.
  const originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    const active = document.activeElement;
    const host = document.getElementById("glean-popover-host");
    const thought =
      host && host.shadowRoot
        ? host.shadowRoot.getElementById("glean-thought")
        : null;

    if (
      thought &&
      active &&
      (active === thought || host === active || host?.contains(active))
    ) {
      let el: Element | null | undefined = this;
      let isInsideExtension = false;
      while (el) {
        if (
          el.id === "glean-popover-host" ||
          el.id === "glean-thought"
        ) {
          isInsideExtension = true;
          break;
        }
        el =
          el.parentElement ||
          (el.getRootNode && (el.getRootNode() as ShadowRoot).host);
      }
      if (!isInsideExtension) {
        return;
      }
    }

    return originalFocus.call(this, options);
  };
}

import { saveCard, updateCard, deleteCard } from "@/lib/storage";
import type { Card, CitationSource } from "@/lib/types";
import type { SaveCardResult } from "@/lib/storage";
import { getLang, t, type Lang } from "@/lib/i18n";
import { STYLES } from "@/lib/content/styles";
import { flashSelection, releaseFlash } from "@/lib/content/highlight-flash";
import { extractCitationSource } from "@/lib/content/citation";
import {
  getAutoThought,
  noteThoughtSkip,
  resetThoughtSkips,
} from "@/lib/preferences";
import {
  SHORT_WIDTH,
  LONG_WIDTH_BASE,
  WIDTH_EXPAND_THRESHOLD,
  WIDTH_CONTRACT_THRESHOLD,
  getMaxTextareaWidth,
  clampToastPosition,
} from "@/lib/content/geometry";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Guard against double initialization
    if (document.getElementById("glean-popover-host")) return;

    let host: HTMLElement | null = null;
    let shadowRoot: ShadowRoot | null = null;
    let currentLang: Lang = "zh";
    let lastSaveAttempt: { content: string; source: CitationSource } | null = null;
    const tr = (key: string) => t(key, currentLang);
    // Keep language in sync with storage
    getLang().then((l) => { currentLang = l; });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.glean_lang) {
        currentLang = (changes.glean_lang.newValue as Lang) || "zh";
      }
    });

    // ── Shared host / shadow ──────────────────────────

    function ensureHost() {
      if (host) return shadowRoot!;

      host = document.createElement("div");
      host.id = "glean-popover-host";
      host.style.cssText =
        "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;";
      // Append to <html> instead of <body>: if the page puts a CSS transform on
      // <body>, it becomes the containing block for fixed-position descendants and
      // the trigger would appear to scroll with the page. <html> is far less likely
      // to be transformed.
      (document.documentElement || document.body).appendChild(host);

      shadowRoot = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = STYLES;
      shadowRoot.appendChild(style);

      return shadowRoot;
    }

    // Auto-commit an unsubmitted thought so it is never lost when the toast
    // is displaced by a new save or dismissed by an outside click.
    // C2 fix: capture values into locals before any async work to prevent
    // destroyAll nullifying them during the async gap (TOCTOU).
    function flushPendingThought() {
      if (!shadowRoot || !activeToastCardId) return;
      const ta = shadowRoot.getElementById(
        "glean-thought"
      ) as HTMLTextAreaElement | null;
      const text = ta?.value.trim();
      const cardId = activeToastCardId;
      if (text) void updateCard(cardId, { thought: text });
    }

    function destroyAll() {
      removeTrigger();
      removeToast();
      if (host) host.remove();
      host = null;
      shadowRoot = null;
    }

    function clearAll() {
      if (!shadowRoot) return;
      removeTrigger();
      removeToast();
    }

    // ── Trigger icon (click = instant save) ───────────

    let triggerEl: HTMLElement | null = null;
    let triggerScrollHandler: (() => void) | null = null;
    let toastEl: HTMLElement | null = null;
    let activeToastCardId: string | null = null;
    let toastScrollHandler: (() => void) | null = null;
    let toastDocPos: { left: number; top: number } | null = null;
    let toastWheelHandler: ((e: WheelEvent) => void) | null = null;
    let toastRemovalTimer: ReturnType<typeof setTimeout> | null = null;
    // Set by showSavedToast; run exactly once when the toast goes away,
    // regardless of which path (dismiss, outside click, new save) tears it down.
    // `neutral` = the dismissal carries no "user didn't want the thought box"
    // signal (reading release, replacement by a newer save) and must not feed
    // the adaptive auto-thought learning.
    let accountToastDismissal: ((neutral?: boolean) => void) | null = null;
    // Generation token of the highlight flash owned by the current toast.
    // The highlight lives while the toast lives; releasing starts its fade.
    let activeFlashGen: number | null = null;

    function removeTrigger() {
      if (triggerScrollHandler) {
        window.removeEventListener("scroll", triggerScrollHandler, { passive: true } as EventListenerOptions);
        triggerScrollHandler = null;
      }
      triggerEl?.remove();
      triggerEl = null;
    }

    function prefersReducedMotion(): boolean {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    }

    function releaseActiveFlash() {
      if (activeFlashGen === null) return;
      releaseFlash(activeFlashGen);
      activeFlashGen = null;
    }

    function detachToastHandlers(neutral = false) {
      if (toastScrollHandler) {
        window.removeEventListener("scroll", toastScrollHandler, { passive: true } as EventListenerOptions);
        toastScrollHandler = null;
      }
      toastDocPos = null;
      if (toastWheelHandler) {
        window.removeEventListener("wheel", toastWheelHandler);
        toastWheelHandler = null;
      }
      accountToastDismissal?.(neutral);
      accountToastDismissal = null;
    }

    function removeToast() {
      if (toastRemovalTimer) {
        clearTimeout(toastRemovalTimer);
        toastRemovalTimer = null;
      }
      detachToastHandlers();
      toastEl?.remove();
      toastEl = null;
      activeToastCardId = null;
      // The toast is gone — only now does the highlight begin its slow fade.
      releaseActiveFlash();
    }

    /**
     * Animate the toast out, then run the normal removeToast cleanup.
     * Idempotent: multiple calls while the animation is running are ignored.
     */
    function animateToastRemoval(onRemoved?: () => void) {
      if (!toastEl) {
        onRemoved?.();
        return;
      }
      if (prefersReducedMotion()) {
        removeToast();
        onRemoved?.();
        return;
      }
      if (toastEl.classList.contains("toast-out")) {
        // Already fading; just make sure the cleanup callback fires.
        if (onRemoved && !toastRemovalTimer) {
          toastRemovalTimer = setTimeout(() => {
            toastRemovalTimer = null;
            onRemoved();
          }, 180);
        }
        return;
      }
      toastEl.classList.add("toast-out");
      toastRemovalTimer = setTimeout(() => {
        toastRemovalTimer = null;
        removeToast();
        onRemoved?.();
      }, 200);
    }

    /**
     * Animate out the current toast without destroying the host, so a new
     * toast/trigger can appear immediately while the old one fades.
     */
    function animateToastReplacement() {
      const oldToast = toastEl;
      if (!oldToast) return;
      // Neutral: being replaced by a newer save says nothing about whether
      // the user wants the thought box — don't feed it to the learning.
      detachToastHandlers(true);
      toastEl = null;
      activeToastCardId = null;
      // The old toast's highlight fades; the new save re-flashes right after.
      releaseActiveFlash();
      if (prefersReducedMotion()) {
        oldToast.remove();
        return;
      }
      oldToast.classList.add("toast-out");
      setTimeout(() => oldToast.remove(), 200);
    }

    function anchorToastToDocument() {
      if (!toastEl) return;
      const rect = toastEl.getBoundingClientRect();
      toastDocPos = {
        left: (parseFloat(toastEl.style.left) || rect.left) + window.scrollX,
        top: (parseFloat(toastEl.style.top) || rect.top) + window.scrollY,
      };
      if (!toastScrollHandler) {
        toastScrollHandler = () => {
          if (!toastEl || !toastDocPos) return;
          toastEl.style.left = `${toastDocPos.left - window.scrollX}px`;
          toastEl.style.top = `${toastDocPos.top - window.scrollY}px`;
        };
        window.addEventListener("scroll", toastScrollHandler, { passive: true });
      }
    }

    /** Viewport position for the trigger/toast: end of the selected text. */
    function getSelectionAnchor(
      sel: Selection,
      mouseX: number,
      mouseY: number
    ): { x: number; y: number } {
      const size = 28;
      const gap = 8;
      let left: number;
      let top: number;

      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rects = range.getClientRects();
        // Use the last rect (where the selection ended) when available, falling
        // back to the full bounding rect for collapsed or unusual selections.
        const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
        left = rect.right + gap;
        top = rect.top - size - gap;
        if (left + size > window.innerWidth - 4) left = rect.left - size - gap;
        if (top < 4) top = rect.bottom + gap;
      } else {
        left = mouseX + gap;
        top = mouseY - size - gap;
        if (left + size > window.innerWidth - 4) left = mouseX - size - gap;
        if (top < 4) top = mouseY + gap;
      }
      return { x: left, y: top };
    }

    /**
     * Shared save path (trigger click / Alt+G hotkey / error retry).
     * Flashes the selection on success and shows the saved toast at (x, y).
     */
    async function saveSelection(sel: Selection, x: number, y: number) {
      const text = sel.toString().trim();
      if (!text) return;

      flushPendingThought();
      animateToastReplacement();

      lastSaveAttempt = { content: text, source: extractCitationSource() };
      try {
        const result: SaveCardResult = await saveCard(lastSaveAttempt);
        activeFlashGen = flashSelection(sel);
        showSavedToast(triggerEl, x, y, result.card, result.duplicated);
      } catch {
        showErrorToast(x, y, lastSaveAttempt);
      }
    }

    function showTrigger(sel: Selection, mouseX: number, mouseY: number) {
      flushPendingThought();
      clearAll();
      const sr = ensureHost();

      triggerEl = document.createElement("div");
      triggerEl.className = "trigger";
      triggerEl.setAttribute("tabindex", "0");
      triggerEl.setAttribute("role", "button");
      triggerEl.setAttribute("aria-label", tr("saveSelection"));
      triggerEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.193 0-2.31-.565-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.193 0-2.31-.565-2.917-1.179z"/></svg>`;
      sr.appendChild(triggerEl);
      // Keyboard support
      triggerEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          triggerEl?.dispatchEvent(new MouseEvent("mousedown", { bubbles: false }));
        }
        if (e.key === "Escape") destroyAll();
      });

      // Position at the end of the selected text so the icon scrolls with the
      // page content, staying visually anchored to the sentence that was selected.
      const { x: viewportLeft, y: viewportTop } = getSelectionAnchor(sel, mouseX, mouseY);

      // Store document coordinates and update on scroll. Because the host is
      // fixed to the viewport, the INITIAL placement must be viewport
      // coordinates (doc - scroll); the scroll listener keeps it anchored to
      // the selected text afterwards.
      const docLeft = viewportLeft + window.scrollX;
      const docTop = viewportTop + window.scrollY;
      triggerEl.style.left = `${docLeft - window.scrollX}px`;
      triggerEl.style.top = `${docTop - window.scrollY}px`;

      triggerScrollHandler = () => {
        if (!triggerEl) return;
        triggerEl.style.left = `${docLeft - window.scrollX}px`;
        triggerEl.style.top = `${docTop - window.scrollY}px`;
      };
      window.addEventListener("scroll", triggerScrollHandler, { passive: true });

      const successCheckIcon = `<svg class="trigger-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

      // Click trigger = instant save
      triggerEl.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const text = sel.toString().trim();
        if (!text) return;

        const clickedTrigger = triggerEl;
        if (!clickedTrigger) return;

        // Show saving state on trigger
        clickedTrigger.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        clickedTrigger.style.pointerEvents = "none";

        // Use the icon's current viewport position in case the user scrolled
        // between showing the trigger and clicking it.
        const currentRect = clickedTrigger.getBoundingClientRect();
        const toastX = currentRect.left;
        const toastY = currentRect.top;

        // Disown the global trigger so showSavedToast doesn't crossfade it;
        // we handle the success morph locally and in parallel with the toast.
        triggerEl = null;
        try {
          await saveSelection(sel, toastX, toastY);
        } catch {
          triggerEl = clickedTrigger;
          removeTrigger();
          return;
        }

        if (!clickedTrigger.isConnected) return;
        if (prefersReducedMotion()) {
          triggerEl = clickedTrigger;
          removeTrigger();
          return;
        }

        // Success micro-animation: seal check pops in, then the trigger fades.
        clickedTrigger.innerHTML = successCheckIcon;
        clickedTrigger.classList.add("trigger-success");
        clickedTrigger.style.pointerEvents = "none";

        setTimeout(() => {
          if (!clickedTrigger.isConnected) return;
          clickedTrigger.style.transition = "opacity .15s var(--gl-ease-out), transform .15s var(--gl-ease-out)";
          clickedTrigger.style.opacity = "0";
          clickedTrigger.style.transform = "scale(.85)";
          setTimeout(() => {
            triggerEl = clickedTrigger;
            removeTrigger();
          }, 160);
        }, 350);
      });
    }

    // ── Saved toast (morphed from trigger) ────────────

    async function showSavedToast(
      trigger: HTMLElement | null,
      x: number,
      y: number,
      card: Card,
      duplicated = false,
    ) {
      if (!shadowRoot) return;
      currentLang = await getLang();
      const cardId = card.id;
      activeToastCardId = cardId;

      // Open the thought editor right after saving so the user can immediately
      // capture their idea — unless the user repeatedly dismissed it empty, in
      // which case we learned to show only the compact confirmation bar.
      const autoThought = await getAutoThought();

      // Crossfade the trigger into the toast so the popup feels continuous.
      if (trigger && trigger === triggerEl) {
        trigger.style.transition = "opacity .15s var(--gl-ease-out), transform .15s var(--gl-ease-out)";
        trigger.style.opacity = "0";
        trigger.style.transform = "scale(.85)";
        setTimeout(() => removeTrigger(), 160);
      }
      triggerEl = null;

      toastEl = document.createElement("div");
      toastEl.className = "toast toast-enter";
      toastEl.setAttribute("role", "dialog");
      toastEl.setAttribute("aria-label", tr("savedToast"));
      toastEl.style.left = `${x}px`;
      toastEl.style.top = `${y}px`;

      // Clamp to viewport after the first paint so the enter animation starts
      // from a visible position, then pin the toast to the document so it
      // scrolls together with the saved text.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!toastEl) return;
          clampToastPosition(toastEl);
          anchorToastToDocument();
        });
      });

      let showThought = autoThought;
      const autoOpened = autoThought;
      let thoughtText = "";
      let thoughtWritten = false;
      let skipAccounting = false; // undo deletes the card — not a thought skip
      // Reading release (scroll / Space-page) means "I'm moving on", NOT
      // "I don't want the thought box" — it must not feed the learning.
      let releasedForReading = false;
      let dismissed = false;
      let dismissTimer: ReturnType<typeof setTimeout> | null = null;

      // ── P1+P2 fix: bind toastEl-level listeners ONCE ──
      // These used to be inside render(), causing accumulation on every toggle.

      // Prevent keyboard/input events from escaping the toast's Shadow DOM.
      // Without this, pages (e.g. AI chatboxes) with focus-stealing shortcuts
      // see a retargeted event target and think the user is not typing in an
      // input, so they steal focus back to their own composer.
      for (const evt of ["keydown", "keyup", "input", "keypress", "beforeinput"] as const) {
        toastEl.addEventListener(evt, (e) => e.stopPropagation());
      }

      // Reading-intent release: scrolling the page means "I'm moving on", so
      // dismiss the toast unless the user has an unsubmitted thought.
      // (Focus is NOT trapped — Tab and clicks leave the toast naturally.)
      toastWheelHandler = (e: WheelEvent) => {
        if (dismissed || !toastEl) return;
        // e.target is retargeted to the host for events inside our shadow
        // DOM, so use composedPath() to tell "over the toast" from "outside".
        if (e.composedPath().includes(toastEl)) return;
        const ta = shadowRoot?.getElementById("glean-thought") as HTMLTextAreaElement | null;
        if (showThought && (ta?.value.trim() || thoughtText.trim())) return;
        releasedForReading = true;
        dismiss();
      };
      window.addEventListener("wheel", toastWheelHandler, { passive: true });

      // Learn from this dismissal when the toast goes away (any teardown path).
      accountToastDismissal = (neutral = false) => {
        if (skipAccounting || neutral || releasedForReading) return;
        const ta = shadowRoot?.getElementById("glean-thought") as HTMLTextAreaElement | null;
        if (thoughtWritten || thoughtText.trim() || ta?.value.trim()) {
          void resetThoughtSkips();
        } else if (autoOpened) {
          void noteThoughtSkip();
        }
      };

      // Prevent toast clicks from bubbling to page
      toastEl.addEventListener("mousedown", (e) => e.stopPropagation());

      // Allow hover to pause dismiss
      toastEl.addEventListener("mouseenter", () => {
        if (dismissTimer) clearTimeout(dismissTimer);
      });
      toastEl.addEventListener("mouseleave", () => {
        if (!dismissed) scheduleDismiss();
      });

      // ── Event delegation: single click handler on toastEl ──
      toastEl.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).closest("[id]");
        if (!target) return;
        const id = (target as HTMLElement).id;

        if (id === "glean-undo") {
          e.stopPropagation();
          skipAccounting = true; // deleting the card is not a thought skip
          if (dismissTimer) clearTimeout(dismissTimer);
          void deleteCard(cardId).catch(() => { /* Card already gone */ });
          activeToastCardId = null;
          if (toastEl) {
            const label = toastEl.querySelector(".toast-label") as HTMLElement | null;
            if (label) label.textContent = tr("deletedToast");
            for (const sel of [".toast-thought", ".toast-sep", "#glean-note", "#glean-undo", "#glean-journal"]) {
              const el = toastEl.querySelector(sel) as HTMLElement | null;
              if (el) el.style.display = "none";
            }
          }
          setTimeout(dismiss, 900);
          return;
        }

        if (id === "glean-journal") {
          e.stopPropagation();
          const url = `${chrome.runtime.getURL("journal.html")}#${cardId}`;
          chrome.runtime.sendMessage({ type: "openTab", url });
          dismiss();
          return;
        }

        if (id === "glean-note") {
          e.stopPropagation();
          const ta = shadowRoot?.getElementById("glean-thought") as HTMLTextAreaElement | null;
          if (ta) thoughtText = ta.value;
          showThought = !showThought;
          render();
          if (showThought) {
            const newTa = shadowRoot?.getElementById("glean-thought") as HTMLTextAreaElement | null;
            newTa?.focus();
          }
          return;
        }

        if (id === "glean-send") {
          e.stopPropagation();
          void submitThought();
          return;
        }
      });

      // ── render(): only updates DOM, no listener binding ──

      function render() {
        if (!toastEl || dismissed) return;

        const undoIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
        const noteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
        const journalIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>`;

        let html = `
          <div class="toast-bar">
            <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span class="toast-label">${duplicated ? tr("syncAlreadySaved") : tr("savedToast")}</span>
            <button class="toast-undo" id="glean-undo" title="${tr("undo")}">${undoIcon}</button>
            <div class="toast-sep"></div>
            <button class="toast-journal" id="glean-journal" title="${tr("viewJournal")}">${journalIcon}</button>
            ${!showThought ? `<div class="toast-sep"></div><button class="toast-note" id="glean-note" title="${tr("addThought")}">${noteIcon}</button>` : ""}
          </div>
        `;

        if (showThought) {
          html += `
            <div class="toast-thought">
              <textarea id="glean-thought" placeholder="${tr("thoughtPlaceholder")}">${escapeHtml(thoughtText)}</textarea>
              <button class="toast-send" id="glean-send">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
              </button>
            </div>
          `;
        }

        toastEl.innerHTML = html;

        // Auto-dismiss only while idle (an editor with typed text stays open)
        scheduleDismiss();

        // Bind textarea-specific listeners (these are on the textarea element
        // which is recreated on each render, so they must be rebound).
        bindTextareaListeners();
      }

      // ── Textarea-specific listeners (rebound on each render) ──

      let enterSubmitting = false;
      let shiftHeld = false;

      function bindTextareaListeners() {
        const textarea = shadowRoot?.getElementById(
          "glean-thought"
        ) as HTMLTextAreaElement | null;
        if (!textarea) return;

        // Auto-resize textarea (width + height)
        const oldMeasure = shadowRoot!.querySelector(".glean-measure");
        if (oldMeasure) oldMeasure.remove();
        const measure = document.createElement("span");
        measure.className = "glean-measure";
        measure.style.cssText =
          "position:absolute;visibility:hidden;white-space:pre;font:13px/1.4 Georgia,'Songti SC',serif;padding:8px 10px;";
        shadowRoot!.appendChild(measure);

        // Set explicit initial width so CSS transition has a starting value
        textarea.style.width = `${SHORT_WIDTH}px`;
        textarea.style.maxWidth = `${getMaxTextareaWidth()}px`;

        let widthExpanded = false;
        let widthContractTimer: ReturnType<typeof setTimeout> | null = null;

        const autoResize = () => {
          if (!textarea) return;

          const val = textarea.value;
          const maxW = getMaxTextareaWidth();
          const longW = Math.min(LONG_WIDTH_BASE, maxW);
          textarea.style.maxWidth = `${maxW}px`;

          // Measure the longest line so multi-line text only expands when a
          // single line is about to hit the short width, not because the total
          // character count grew.
          const lines = val.split("\n");
          let longestLineW = 0;
          for (const line of lines) {
            measure.textContent = line || " ";
            longestLineW = Math.max(longestLineW, measure.offsetWidth + 2);
          }

          const currentW = textarea.getBoundingClientRect().width;

          if (val.trim()) {
            if (!widthExpanded && longestLineW >= currentW - WIDTH_EXPAND_THRESHOLD) {
              widthExpanded = true;
              if (widthContractTimer) { clearTimeout(widthContractTimer); widthContractTimer = null; }
              textarea.style.width = `${longW}px`;
              // Ensure the toast doesn't spill outside the viewport after it grows.
              setTimeout(() => {
                if (!toastEl) return;
                clampToastPosition(toastEl);
                anchorToastToDocument();
              }, 50);
            }
          } else if (widthExpanded) {
            // Contract back once there is comfortable headroom (avoid jitter while typing)
            if (longestLineW < SHORT_WIDTH - WIDTH_CONTRACT_THRESHOLD || !val.trim()) {
              if (!widthContractTimer) {
                widthContractTimer = setTimeout(() => {
                  widthContractTimer = null;
                  if (!textarea) return;
                  const latestVal = textarea.value;
                  const latestLines = latestVal.split("\n");
                  let latestLongest = 0;
                  for (const line of latestLines) {
                    measure.textContent = line || " ";
                    latestLongest = Math.max(latestLongest, measure.offsetWidth + 2);
                  }
                  if (latestVal.trim() && latestLongest >= SHORT_WIDTH - WIDTH_CONTRACT_THRESHOLD) return;
                  widthExpanded = false;
                  textarea.style.width = `${SHORT_WIDTH}px`;
                  setTimeout(() => {
                if (!toastEl) return;
                clampToastPosition(toastEl);
                anchorToastToDocument();
              }, 50);
                }, 400);
              }
            } else if (widthContractTimer) {
              clearTimeout(widthContractTimer);
              widthContractTimer = null;
            }
          }

          // Measure height
          textarea.style.height = "36px";
          const targetH = Math.min(textarea.scrollHeight, 120);
          textarea.style.height = targetH + "px";
        };

        textarea.addEventListener("input", autoResize);

        // Track whether Enter already triggered submission so the keydown,
        // beforeinput and input fallbacks do not submit more than once.
        const tryEnterSubmit = (e?: Event) => {
          if (enterSubmitting) return;
          enterSubmitting = true;
          if (e) {
            e.preventDefault?.();
            e.stopPropagation?.();
          }
          void submitThought();
        };

        textarea.addEventListener("keydown", (e) => {
          shiftHeld = e.shiftKey;

          // Reading-intent release: on an empty editor, scroll keys mean the
          // user wants to keep reading, not type. Dismiss and perform the
          // scroll the key would have caused on the page.
          // (Skipped during IME composition, where Space confirms candidates.)
          const emptyThought = !textarea.value.trim();
          if (!e.isComposing && emptyThought && (e.key === " " || e.key === "PageDown" || e.key === "PageUp")) {
            e.preventDefault();
            e.stopPropagation();
            const up = e.key === "PageUp" || (e.key === " " && e.shiftKey);
            releasedForReading = true;
            dismiss();
            window.scrollBy(0, (up ? -1 : 1) * window.innerHeight * 0.85);
            return;
          }

          const isEnter = e.key === "Enter" || e.keyCode === 13 || e.code === "Enter";
          if (isEnter && e.shiftKey) {
            // Let Shift+Enter insert a newline (default behaviour).
            return;
          }
          if (isEnter && !e.isComposing) {
            tryEnterSubmit(e);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            dismiss();
          }
        }, true);

        textarea.addEventListener("keyup", () => {
          shiftHeld = false;
        });

        // Fallback for pages that intercept keydown: catch Enter at the
        // beforeinput/input level and remove the inserted newline.
        textarea.addEventListener("beforeinput", (e) => {
          const ie = e as InputEvent;
          const isLineBreak =
            ie.inputType === "insertLineBreak" ||
            ie.inputType === "insertParagraph";
          if (isLineBreak && !shiftHeld && !ie.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            tryEnterSubmit();
          }
        });

        textarea.addEventListener("input", (e) => {
          if (!textarea) return;
          // If a newline somehow got inserted (key interception fallback),
          // strip it and submit unless the user is composing or holding Shift.
          const ie = e as InputEvent;
          if (
            textarea.value.endsWith("\n") &&
            !ie.isComposing &&
            !shiftHeld
          ) {
            e.preventDefault?.();
            e.stopPropagation?.();
            textarea.value = textarea.value.slice(0, -1);
            tryEnterSubmit();
          }
        });
      }

      // ── submitThought ──

      async function submitThought() {
        const textarea = shadowRoot?.getElementById(
          "glean-thought"
        ) as HTMLTextAreaElement | null;
        const sendBtn = shadowRoot?.getElementById("glean-send") as HTMLButtonElement | null;
        const text = textarea?.value ?? thoughtText;
        thoughtText = text;
        if (!text.trim()) {
          dismiss();
          return;
        }
        // Show saving state
        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
        }
        try {
          await updateCard(cardId, { thought: text.trim() });
          thoughtWritten = true;
          if (toastEl) {
            const thoughtArea = toastEl.querySelector(".toast-thought") as HTMLElement | null;
            const label = toastEl.querySelector(".toast-label") as HTMLElement | null;

            if (prefersReducedMotion()) {
              thoughtArea?.remove();
              if (label) label.textContent = tr("thoughtSaved");
            } else {
              // Freeze the toast at its current size so the inner thought area
              // can collapse without the whole box snapping smaller first.
              const startRect = toastEl.getBoundingClientRect();
              toastEl.style.width = `${startRect.width}px`;
              toastEl.style.height = `${startRect.height}px`;
              toastEl.style.transition = "none";
              toastEl.style.overflow = "hidden";

              if (thoughtArea) {
                thoughtArea.style.maxHeight = thoughtArea.scrollHeight + "px";
                thoughtArea.offsetHeight;
                thoughtArea.style.transition = "max-height .25s var(--gl-ease-out), opacity .2s var(--gl-ease-out), padding .25s var(--gl-ease-out)";
                thoughtArea.style.maxHeight = "0";
                thoughtArea.style.opacity = "0";
                thoughtArea.style.padding = "0 8px";
                thoughtArea.style.overflow = "hidden";
                thoughtArea.addEventListener("transitionend", () => thoughtArea.remove(), { once: true });
              }

              if (label) {
                label.style.transition = "opacity .15s ease";
                label.style.opacity = "0";
                setTimeout(() => {
                  if (!label.isConnected) return;
                  label.textContent = tr("thoughtSaved");
                  label.style.opacity = "1";
                }, 150);
              }

              // Once the thought area has collapsed, measure the compact bar
              // size and animate the toast itself down to it.
              setTimeout(() => {
                if (!toastEl) return;
                toastEl.style.width = "";
                toastEl.style.height = "";
                const compactRect = toastEl.getBoundingClientRect();

                requestAnimationFrame(() => {
                  if (!toastEl) return;
                  toastEl.style.width = `${startRect.width}px`;
                  toastEl.style.height = `${startRect.height}px`;
                  toastEl.style.transition = "none";
                  toastEl.offsetHeight; // force reflow

                  requestAnimationFrame(() => {
                    if (!toastEl) return;
                    toastEl.style.transition = "width .35s var(--gl-ease-out), height .3s var(--gl-ease-out)";
                    toastEl.style.width = `${compactRect.width}px`;
                    toastEl.style.height = `${compactRect.height}px`;

                    const onDone = (e: TransitionEvent) => {
                      if (e.propertyName !== "width" || !toastEl) return;
                      toastEl.style.width = "";
                      toastEl.style.height = "";
                      toastEl.style.overflow = "";
                      toastEl.style.transition = "";
                      toastEl.removeEventListener("transitionend", onDone);
                    };
                    toastEl.addEventListener("transitionend", onDone);
                  });
                });
              }, 280);
            }
          }
          setTimeout(dismiss, 1800);
        } catch {
          dismiss();
        }
      }

      function scheduleDismiss() {
        if (dismissTimer) clearTimeout(dismissTimer);
        dismissTimer = setTimeout(dismissIfIdle, showThought ? 6000 : 3500);
      }

      // Dismiss only when idle: an editor with typed text stays alive.
      function dismissIfIdle() {
        const ta = shadowRoot?.getElementById(
          "glean-thought"
        ) as HTMLTextAreaElement | null;
        if (showThought && ta && ta.value.trim()) {
          scheduleDismiss();
          return;
        }
        dismiss();
      }

      function dismiss() {
        if (dismissed) return;
        dismissed = true;
        if (dismissTimer) clearTimeout(dismissTimer);
        animateToastRemoval(() => destroyAll());
      }

      shadowRoot.appendChild(toastEl);
      render();
      if (showThought) {
        const ta = shadowRoot.getElementById(
          "glean-thought"
        ) as HTMLTextAreaElement | null;
        ta?.focus();
      }
    }

    async function showErrorToast(
      x: number,
      y: number,
      attempt: { content: string; source: CitationSource } | null = null
    ) {
      if (!shadowRoot) return;
      currentLang = await getLang();
      removeTrigger();

      toastEl = document.createElement("div");
      toastEl.className = "toast toast-enter";
      toastEl.setAttribute("role", "alert");
      toastEl.style.left = `${x}px`;
      toastEl.style.top = `${y}px`;
      const retryButton = attempt
        ? `<button class="toast-retry" id="glean-retry">${tr("askRetry")}</button>`
        : "";
      toastEl.innerHTML = `
        <div class="toast-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <span class="toast-label error">${tr("failed")}</span>
          ${retryButton}
        </div>
      `;
      // Viewport clamping, then pin to the document like the saved toast.
      requestAnimationFrame(() => {
        if (!toastEl) return;
        const rect = toastEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw - 8) toastEl.style.left = `${vw - rect.width - 8}px`;
        if (rect.bottom > vh - 8) toastEl.style.top = `${vh - rect.height - 8}px`;
        if (parseFloat(toastEl.style.left) < 8) toastEl.style.left = "8px";
        if (parseFloat(toastEl.style.top) < 8) toastEl.style.top = "8px";
        anchorToastToDocument();
      });
      // Hover to pause auto-dismiss
      let errorTimer: ReturnType<typeof setTimeout> | null = null;
      errorTimer = setTimeout(() => animateToastRemoval(() => destroyAll()), 2500);
      toastEl.addEventListener("mouseenter", () => {
        if (errorTimer) clearTimeout(errorTimer);
        if (toastRemovalTimer) {
          clearTimeout(toastRemovalTimer);
          toastRemovalTimer = null;
          toastEl?.classList.remove("toast-out");
        }
      });
      toastEl.addEventListener("mouseleave", () => {
        if (toastEl && !toastEl.classList.contains("toast-out")) {
          errorTimer = setTimeout(() => animateToastRemoval(() => destroyAll()), 1500);
        }
      });
      toastEl.addEventListener("mousedown", (e) => e.stopPropagation());
      shadowRoot.appendChild(toastEl);

      if (attempt) {
        shadowRoot.getElementById("glean-retry")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const result: SaveCardResult = await saveCard(attempt);
            animateToastReplacement();
            showSavedToast(null, x, y, result.card, result.duplicated);
          } catch {
            // Stay on the error toast.
          }
        });
      }
    }

    // ── Helpers ────────────────────────────────────────

    function escapeHtml(s: string): string {
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    // ── Events ────────────────────────────────────────

    function handleSelectionEnd(clientX: number, clientY: number, path: EventTarget[]) {
      const realTarget = (path[0] ?? null) as HTMLElement | null;
      if (realTarget?.closest("input, textarea, select, [contenteditable]")) return;

      const insideToast = !!toastEl && path.some((el) => el === toastEl);

      setTimeout(() => {
        if (toastEl) {
          // Interacting with the open toast itself — leave it alone.
          if (insideToast) return;
          // A new selection elsewhere replaces the open toast; commit any
          // unsubmitted thought before tearing it down.
          flushPendingThought();
          destroyAll();
        }

        const sel = window.getSelection();
        const text = sel?.toString().trim();

        if (!text || text.length < 2 || !sel || sel.rangeCount === 0) {
          return;
        }

        showTrigger(sel, clientX, clientY);
      }, 10);
    }

    document.addEventListener("mouseup", (e) => {
      handleSelectionEnd(e.clientX, e.clientY, e.composedPath());
    });

    // Alt+G saves the current selection directly — no trigger click needed.
    // This is also the only entry point for keyboard-made selections.
    // (AltGr on Windows reports ctrlKey+altKey, so requiring no ctrl/meta
    // keeps AltGr combinations typing characters as usual.)
    document.addEventListener("keydown", (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (e.code !== "KeyG") return;
      const target = e.target as HTMLElement | null;
      // Typing in a field, or interacting with our own shadow UI.
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (host && target === host) return;

      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!sel || !text || text.length < 2 || sel.rangeCount === 0) return;

      e.preventDefault();
      e.stopPropagation();
      const { x, y } = getSelectionAnchor(sel, 0, 0);
      void saveSelection(sel, x, y);
    });

    document.addEventListener("touchend", (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      // Prevent the synthetic mouseup from double-triggering on the same selection.
      const path = e.composedPath();
      handleSelectionEnd(touch.clientX, touch.clientY, path);
    });

    function dismissIfOutside(target: EventTarget | null) {
      if (!host) return;
      if (host.contains(target as Node)) return;
      flushPendingThought();
      if (toastEl) {
        animateToastRemoval(() => destroyAll());
      } else {
        destroyAll();
      }
    }

    document.addEventListener("mousedown", (e) => dismissIfOutside(e.target));
    document.addEventListener("touchstart", (e) => dismissIfOutside(e.target), { passive: true });

    // Keep the toast inside the viewport when the window is resized and
    // prevent the textarea from growing wider than the new viewport.
    window.addEventListener("resize", () => {
      if (!toastEl) return;
      clampToastPosition(toastEl);
      anchorToastToDocument();
      const ta = shadowRoot?.getElementById("glean-thought") as HTMLTextAreaElement | null;
      if (!ta) return;
      const maxW = getMaxTextareaWidth();
      const longW = Math.min(LONG_WIDTH_BASE, maxW);
      ta.style.maxWidth = `${maxW}px`;
      const currentW = parseFloat(ta.style.width);
      if (currentW > longW) {
        ta.style.width = `${Math.max(SHORT_WIDTH, longW)}px`;
        setTimeout(() => { if (toastEl) clampToastPosition(toastEl); }, 50);
      }
    });
  },
});

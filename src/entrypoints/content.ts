import { saveCard, updateCard, deleteCard } from "@/lib/storage";
import type { Card, CitationSource } from "@/lib/types";
import { getLang, t, type Lang } from "@/lib/i18n";
import { STYLES } from "@/lib/content/styles";

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

    function extractCitationSource(): CitationSource {
      const getMeta = (name: string): string | undefined => {
        const el =
          document.querySelector(`meta[property="${name}"]`) ??
          document.querySelector(`meta[name="${name}"]`);
        return el?.getAttribute("content")?.trim() || undefined;
      };

      const heading = (() => {
        const article = document.querySelector("article");
        const scope = article ?? document;
        const h1 = scope.querySelector("h1");
        return h1?.textContent?.trim() || undefined;
      })();

      const siteName =
        getMeta("og:site_name") ?? getMeta("application-name") ?? undefined;

      const ldData = (() => {
        const el = document.querySelector('script[type="application/ld+json"]');
        if (!el) return null;
        try {
          return JSON.parse(el.textContent ?? "");
        } catch {
          return null;
        }
      })();

      const author = (() => {
        const meta =
          getMeta("author") ??
          getMeta("article:author") ??
          getMeta("og:article:author");
        if (meta) return meta;

        if (ldData) {
          if (ldData.author?.name) return ldData.author.name;
          if (typeof ldData.author === "string") return ldData.author;
        }

        const byline = document.querySelector(
          '[rel="author"], .author, .byline, [itemprop="author"]'
        );
        return byline?.textContent?.trim() || undefined;
      })();

      const publishedAt = (() => {
        const meta =
          getMeta("article:published_time") ??
          getMeta("date") ??
          getMeta("publish_date");
        if (meta) return meta;

        const timeEl = document.querySelector(
          "article time[datetime], time[datetime]"
        );
        if (timeEl) return timeEl.getAttribute("datetime") || undefined;

        if (ldData?.datePublished) return ldData.datePublished;

        return undefined;
      })();

      const favicon = (() => {
        const link = document.querySelector(
          'link[rel="icon"], link[rel="shortcut icon"]'
        );
        const href = link?.getAttribute("href");
        if (!href) return undefined;
        try {
          return new URL(href, location.origin).href;
        } catch {
          return undefined;
        }
      })();

      return {
        url: location.href,
        title: document.title,
        heading,
        siteName,
        author,
        publishedAt,
        favicon,
      };
    }

    // ── Shared host / shadow ──────────────────────────

    function ensureHost() {
      if (host) return shadowRoot!;

      host = document.createElement("div");
      host.id = "glean-popover-host";
      host.style.cssText =
        "position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;";
      document.body.appendChild(host);

      shadowRoot = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = STYLES;
      shadowRoot.appendChild(style);

      return shadowRoot;
    }

    // Auto-commit an unsubmitted thought so it is never lost when the toast
    // is displaced by a new save or dismissed by an outside click.
    function flushPendingThought() {
      if (!shadowRoot || !activeToastCardId) return;
      const ta = shadowRoot.getElementById(
        "glean-thought"
      ) as HTMLTextAreaElement | null;
      const text = ta?.value.trim();
      if (text) void updateCard(activeToastCardId, { thought: text });
    }

    function destroyAll() {
      if (host) host.remove();
      host = null;
      shadowRoot = null;
      triggerEl = null;
      toastEl = null;
      activeToastCardId = null;
    }

    function clearAll() {
      if (!shadowRoot) return;
      const old = shadowRoot.querySelector(".trigger, .toast");
      if (old) old.remove();
    }

    // ── Trigger icon (click = instant save) ───────────

    let triggerEl: HTMLElement | null = null;
    let toastEl: HTMLElement | null = null;
    let activeToastCardId: string | null = null;

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

      // Position near mouse release point
      const size = 28;
      const gap = 8;
      let left = mouseX + gap;
      let top = mouseY - size - gap;
      if (left + size > window.innerWidth - 4) left = mouseX - size - gap;
      if (top < 4) top = mouseY + gap;

      triggerEl.style.left = `${left}px`;
      triggerEl.style.top = `${top}px`;

      // Click trigger = instant save
      triggerEl.addEventListener("mousedown", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const text = sel.toString().trim();
        if (!text) return;

        lastSaveAttempt = { content: text, source: extractCitationSource() };

        // Show saving state on trigger
        if (triggerEl) {
          triggerEl.innerHTML = `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
          triggerEl.style.pointerEvents = "none";
        }

        try {
          const card = await saveCard(lastSaveAttempt);
          showSavedToast(left, top, card);
        } catch {
          showErrorToast(left, top, lastSaveAttempt);
        }
      });
    }

    // ── Saved toast (morphed from trigger) ────────────

    async function showSavedToast(x: number, y: number, card: Card) {
      if (!shadowRoot) return;
      currentLang = await getLang();
      const cardId = card.id;
      activeToastCardId = cardId;

      // Open the thought editor right after saving so the user can immediately capture their idea.
      const autoThought = true;

      // Remove trigger
      if (triggerEl) triggerEl.remove();
      triggerEl = null;

      toastEl = document.createElement("div");
      toastEl.className = "toast toast-enter";
      toastEl.setAttribute("role", "status");

      // Clamp to viewport after rendering
      toastEl.style.left = `${x}px`;
      toastEl.style.top = `${y}px`;
      requestAnimationFrame(() => {
        if (!toastEl) return;
        const rect = toastEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw - 8) toastEl.style.left = `${vw - rect.width - 8}px`;
        if (rect.bottom > vh - 8) toastEl.style.top = `${vh - rect.height - 8}px`;
        if (parseFloat(toastEl.style.left) < 8) toastEl.style.left = "8px";
        if (parseFloat(toastEl.style.top) < 8) toastEl.style.top = "8px";
      });

      let showThought = autoThought;
      let thoughtText = "";
      let dismissed = false;
      let dismissTimer: ReturnType<typeof setTimeout> | null = null;

      function render() {
        if (!toastEl || dismissed) return;

        const undoIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`;
        const noteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;

        let html = `
          <div class="toast-bar">
            <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span class="toast-label">${tr("savedToast")}</span>
            <button class="toast-undo" id="glean-undo" title="${tr("undo")}">${undoIcon}</button>
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

        toastEl!.innerHTML = html;

        // Auto-dismiss only while idle (an editor with typed text stays open)
        scheduleDismiss();

        // Bind events
        const noteBtn = shadowRoot!.getElementById("glean-note");
        const undoBtn = shadowRoot!.getElementById("glean-undo");
        const sendBtn = shadowRoot!.getElementById("glean-send") as HTMLButtonElement | null;
        const textarea = shadowRoot!.getElementById(
          "glean-thought"
        ) as HTMLTextAreaElement | null;

        // Prevent keyboard/input events from escaping the toast's Shadow DOM.
        // Without this, pages (e.g. AI chatboxes) with focus-stealing shortcuts
        // see a retargeted event target and think the user is not typing in an
        // input, so they steal focus back to their own composer.
        toastEl!.addEventListener("keydown", (e) => e.stopPropagation());
        toastEl!.addEventListener("keyup", (e) => e.stopPropagation());
        toastEl!.addEventListener("input", (e) => e.stopPropagation());
        toastEl!.addEventListener("keypress", (e) => e.stopPropagation());
        toastEl!.addEventListener("beforeinput", (e) => e.stopPropagation());

        // Focus trap: when the thought panel is open and focus leaves it,
        // bring it back to the textarea. This defends against pages that
        // programmatically steal focus (e.g. AI chatboxes refocusing their
        // composer while the user is typing).
        if (textarea) {
          const trapFocus = () => {
            if (!showThought || !toastEl || dismissed) return;
            const active = shadowRoot!.activeElement;
            if (!active || !toastEl.contains(active)) {
              textarea.focus();
            }
          };
          toastEl!.addEventListener("focusout", trapFocus);
        }

        undoBtn?.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (dismissTimer) clearTimeout(dismissTimer);
          try {
            await deleteCard(cardId);
          } catch {
            // Card already gone; dismiss either way
          }
          activeToastCardId = null;
          if (toastEl) {
            const label = toastEl.querySelector(".toast-label") as HTMLElement | null;
            if (label) label.textContent = tr("deletedToast");
            for (const sel of [".toast-thought", ".toast-sep", "#glean-note", "#glean-undo"]) {
              const el = toastEl.querySelector(sel) as HTMLElement | null;
              if (el) el.style.display = "none";
            }
          }
          setTimeout(dismiss, 900);
        });

        noteBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          if (textarea) thoughtText = textarea.value;
          showThought = !showThought;
          render();
          if (showThought) {
            const ta = shadowRoot!.getElementById(
              "glean-thought"
            ) as HTMLTextAreaElement | null;
            ta?.focus();
          }
        });

        async function submitThought() {
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
            if (toastEl) {
              const thoughtArea = toastEl.querySelector(".toast-thought") as HTMLElement | null;
              const label = toastEl.querySelector(".toast-label") as HTMLElement | null;

              if (thoughtArea) {
                thoughtArea.style.maxHeight = thoughtArea.scrollHeight + "px";
                thoughtArea.offsetHeight;
                thoughtArea.style.transition = "max-height .25s cubic-bezier(.4,0,.2,1), opacity .2s ease, padding .25s cubic-bezier(.4,0,.2,1)";
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
            }
            setTimeout(dismiss, 4000);
          } catch {
            dismiss();
          }
        }

        sendBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          void submitThought();
        });

        // Track whether Enter already triggered submission so the keydown,
        // beforeinput and input fallbacks do not submit more than once.
        let enterSubmitting = false;
        const tryEnterSubmit = (e?: Event) => {
          if (enterSubmitting) return;
          enterSubmitting = true;
          if (e) {
            e.preventDefault?.();
            e.stopPropagation?.();
          }
          void submitThought();
        };

        // Track Shift key state so beforeinput/input fallbacks can still allow
        // Shift+Enter to insert a newline even though InputEvent has no shiftKey.
        let shiftHeld = false;

        textarea?.addEventListener(
          "keydown",
          (e) => {
            shiftHeld = e.shiftKey;
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
          },
          true
        );

        textarea?.addEventListener("keyup", () => {
          shiftHeld = false;
        });

        // Fallback for pages that intercept keydown: catch Enter at the
        // beforeinput/input level and remove the inserted newline.
        textarea?.addEventListener("beforeinput", (e) => {
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

        textarea?.addEventListener("input", (e) => {
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

        // Auto-resize textarea (width + height)
        const oldMeasure = shadowRoot!.querySelector(".glean-measure");
        if (oldMeasure) oldMeasure.remove();
        const measure = document.createElement("span");
        measure.className = "glean-measure";
        measure.style.cssText =
          "position:absolute;visibility:hidden;white-space:pre;font:13px/1.4 Georgia,'Songti SC',serif;padding:8px 10px;";
        shadowRoot!.appendChild(measure);

        // Set explicit initial width so CSS transition has a starting value
        if (textarea) textarea.style.width = "220px";

        let widthExpanded = false;
        let widthContractTimer: ReturnType<typeof setTimeout> | null = null;
        const autoResize = () => {
          if (!textarea) return;

          const val = textarea.value;
          if (val) {
            measure.textContent = val;
            const textW = measure.offsetWidth + 2;

            // Expand once when text approaches min width
            if (!widthExpanded && textW >= 210) {
              widthExpanded = true;
              if (widthContractTimer) { clearTimeout(widthContractTimer); widthContractTimer = null; }
              textarea.style.width = "380px";
            }
          } else if (widthExpanded) {
            // Contract back after brief delay (avoid jitter while typing)
            if (!widthContractTimer) {
              widthContractTimer = setTimeout(() => {
                widthContractTimer = null;
                if (!textarea || textarea.value) return;
                widthExpanded = false;
                textarea.style.width = "220px";
              }, 400);
            }
          }

          // Measure height
          textarea.style.height = "36px";
          const targetH = Math.min(textarea.scrollHeight, 120);
          textarea.style.height = targetH + "px";
        };
        textarea?.addEventListener("input", autoResize);

        // Prevent toast clicks from bubbling to page
        toastEl!.addEventListener("mousedown", (e) => e.stopPropagation());
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
        if (toastEl) {
          toastEl.classList.add("toast-out");
          setTimeout(destroyAll, 200);
        }
      }

      // Allow hover to pause dismiss
      toastEl.addEventListener("mouseenter", () => {
        if (dismissTimer) clearTimeout(dismissTimer);
      });
      toastEl.addEventListener("mouseleave", () => {
        if (!dismissed) scheduleDismiss();
      });

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
      if (triggerEl) triggerEl.remove();
      triggerEl = null;

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
      // Viewport clamping
      requestAnimationFrame(() => {
        if (!toastEl) return;
        const rect = toastEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw - 8) toastEl.style.left = `${vw - rect.width - 8}px`;
        if (rect.bottom > vh - 8) toastEl.style.top = `${vh - rect.height - 8}px`;
        if (parseFloat(toastEl.style.left) < 8) toastEl.style.left = "8px";
        if (parseFloat(toastEl.style.top) < 8) toastEl.style.top = "8px";
      });
      // Hover to pause auto-dismiss
      let errorTimer = setTimeout(destroyAll, 2500);
      toastEl.addEventListener("mouseenter", () => clearTimeout(errorTimer));
      toastEl.addEventListener("mouseleave", () => { errorTimer = setTimeout(destroyAll, 1500); });
      toastEl.addEventListener("mousedown", (e) => e.stopPropagation());
      shadowRoot.appendChild(toastEl);

      if (attempt) {
        shadowRoot.getElementById("glean-retry")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const card = await saveCard(attempt);
            showSavedToast(x, y, card);
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
      destroyAll();
    }

    document.addEventListener("mousedown", (e) => dismissIfOutside(e.target));
    document.addEventListener("touchstart", (e) => dismissIfOutside(e.target), { passive: true });
  },
});


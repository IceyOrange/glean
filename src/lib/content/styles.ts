export const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* Theme variables — swapped wholesale in dark mode */
  :host {
    --gl-bg: #fbf9f4;
    --gl-bg-sub: #f4f0e7;
    --gl-bg-hover: #f0ebe0;
    --gl-border: #e6e1d6;
    --gl-border-strong: #d8d1c2;
    --gl-text: #332e27;
    --gl-text-2: #8a8175;
    --gl-placeholder: #a39a8b;
    --gl-seal: #b04a3c;
    --gl-error: #c03428;
    --gl-send-bg: #332e27;
    --gl-send-bg-hover: #4a4238;
    --gl-send-text: #fbf9f4;
    --gl-shadow: 0 8px 24px rgba(51,46,39,.07), 0 2px 6px rgba(51,46,39,.03);
    --gl-shadow-sm: 0 4px 12px rgba(51,46,39,.08), 0 1px 3px rgba(51,46,39,.04);
    --gl-shadow-hover: 0 6px 16px rgba(51,46,39,.1), 0 2px 4px rgba(51,46,39,.05);
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --gl-bg: #2a261f;
      --gl-bg-sub: #23201a;
      --gl-bg-hover: #3a342b;
      --gl-border: #464033;
      --gl-border-strong: #575143;
      --gl-text: #efe9dd;
      --gl-text-2: #a39a8b;
      --gl-placeholder: #6f675a;
      --gl-seal: #d76a5b;
      --gl-error: #e0685c;
      --gl-send-bg: #e8e2d5;
      --gl-send-bg-hover: #f5efe3;
      --gl-send-text: #2a261f;
      --gl-shadow: 0 8px 24px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.25);
      --gl-shadow-sm: 0 4px 12px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.25);
      --gl-shadow-hover: 0 6px 16px rgba(0,0,0,.4), 0 2px 4px rgba(0,0,0,.3);
    }
  }

  /* ── Trigger icon ( = save button) ────────── */

  .trigger {
    position: fixed;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gl-bg);
    color: var(--gl-text);
    border: 1px solid var(--gl-border);
    border-radius: 8px;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: var(--gl-shadow-sm);
    opacity: 0;
    transform: scale(.8) translateY(4px);
    animation: triggerIn .25s cubic-bezier(.34,1.56,.64,1) forwards;
    transition: background .15s, transform .15s, box-shadow .15s, border-color .15s;
  }
  .trigger:hover {
    background: var(--gl-bg-sub);
    border-color: var(--gl-border-strong);
    transform: scale(1.08);
    box-shadow: var(--gl-shadow-hover);
  }
  .trigger:active {
    transform: scale(.92);
  }
  .trigger:focus-visible {
    outline: 2px solid var(--gl-seal);
    outline-offset: 2px;
  }
  .trigger .spin {
    animation: spin .6s linear infinite;
  }

  @keyframes triggerIn {
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Toast (morphs from trigger) ───────────── */

  .toast {
    position: fixed;
    background: var(--gl-bg);
    border: 1px solid var(--gl-border);
    border-radius: 10px;
    box-shadow: var(--gl-shadow);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    font-size: 13px;
    color: var(--gl-text);
    pointer-events: auto;
  }
  .toast.toast-enter {
    opacity: 0;
    transform: scale(.85);
    animation: toastIn .3s cubic-bezier(.34,1.56,.64,1) forwards;
  }
  .toast.toast-out {
    animation: toastOut .2s ease forwards;
  }

  @keyframes toastIn {
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes toastOut {
    to { opacity: 0; transform: scale(.92); }
  }

  .toast-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px 6px 10px;
  }
  .toast-bar .check-icon {
    color: var(--gl-seal);
    flex-shrink: 0;
    animation: checkPop .3s cubic-bezier(.34,1.56,.64,1) .05s backwards;
  }
  .toast-label {
    font-weight: 500;
    color: var(--gl-seal);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .toast-label.error {
    color: var(--gl-error);
  }
  .toast-retry {
    margin-left: 4px;
    padding: 2px 6px;
    font-size: 12px;
    color: var(--gl-error);
    background: transparent;
    border: 1px solid var(--gl-border);
    border-radius: 5px;
    cursor: pointer;
    transition: background .12s, border-color .12s;
  }
  .toast-retry:hover {
    background: var(--gl-bg-hover);
    border-color: var(--gl-border-strong);
  }

  .toast-sep {
    width: 1px;
    height: 16px;
    background: var(--gl-border);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .toast-undo,
  .toast-note {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 5px;
    flex-shrink: 0;
    transition: color .15s, background .12s, transform .1s;
  }
  .toast-undo {
    color: var(--gl-text-2);
  }
  .toast-undo:hover {
    color: var(--gl-seal);
    background: var(--gl-bg-hover);
  }
  .toast-undo:active {
    transform: scale(.92);
  }

  .toast-note {
    color: var(--gl-seal);
  }
  .toast-note:hover {
    color: var(--gl-text);
    background: var(--gl-bg-hover);
  }
  .toast-note:active {
    transform: scale(.92);
  }

  @keyframes checkPop {
    from { opacity: 0; transform: scale(0) rotate(-15deg); }
    to   { opacity: 1; transform: scale(1) rotate(0deg); }
  }

  /* ── Thought area (inside toast) ──────────── */

  .toast-thought {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 0 8px 8px;
    animation: slideDown .2s cubic-bezier(.34,1.56,.64,1);
  }
  .toast-thought textarea {
    border: 1px solid var(--gl-border);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    line-height: 1.4;
    font-family: Georgia, "Songti SC", "SimSun", serif;
    resize: none;
    min-height: 36px;
    min-width: 220px;
    max-width: 380px;
    max-height: 120px;
    outline: none;
    color: var(--gl-text);
    background: var(--gl-bg-sub);
    overflow-y: auto;
    overflow-x: hidden;
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
    transition: border-color .4s, background .4s, height .12s ease, width .45s cubic-bezier(.4,0,.2,1);
  }
  .toast-thought textarea:focus {
    border-color: var(--gl-seal);
    background: var(--gl-bg);
  }
  .toast-thought textarea::placeholder {
    color: var(--gl-placeholder);
  }

  .toast-send {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--gl-send-bg);
    border-radius: 8px;
    background: var(--gl-send-bg);
    color: var(--gl-send-text);
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s, transform .1s, border-color .15s;
  }
  .toast-send:hover {
    background: var(--gl-send-bg-hover);
    border-color: var(--gl-send-bg-hover);
  }
  .toast-send:active {
    transform: scale(.92);
  }
  .toast-send:disabled {
    opacity: .7;
    cursor: default;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .trigger,
    .toast,
    .toast-bar .check-icon,
    .toast-thought,
    .trigger .spin {
      animation-duration: .01ms !important;
      animation-iteration-count: 1 !important;
    }
    .trigger,
    .toast-send,
    .toast-thought textarea {
      transition-duration: .01ms !important;
    }
  }
`;

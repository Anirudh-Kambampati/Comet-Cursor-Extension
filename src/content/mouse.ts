import type { PointerState } from "./types.js";

// Interactive elements that trigger the hover state.
// tabindex="-1" is excluded: it marks programmatic focus targets (often whole page regions).
const HOVER_SELECTOR =
  "a, button, input, textarea, select, label, summary, [role=button], [tabindex]:not([tabindex='-1'])";

/**
 * Tracks raw pointer position and interaction state.
 * All event listeners are passive so they never block scrolling.
 * State is read directly each animation frame; `onChange` only wakes the loop.
 */
export function createPointerTracker(
  onChange: () => void,
  signal:   AbortSignal,
): PointerState {
  const state: PointerState = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    px: window.innerWidth / 2,
    py: window.innerHeight / 2,
    lastMove: 0,
    hovering: false,
    clicking: false,
    visible: false,
  };

  const opts = { passive: true, signal } as const;

  window.addEventListener(
    "pointermove",
    (e) => {
      // Touch has no hovering pointer to replace.
      if (e.pointerType === "touch") return;

      state.x = e.clientX;
      state.y = e.clientY;

      // Draw the core where the pointer is about to be, hiding ~1 frame of latency.
      const predicted =
        typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      const last = predicted[predicted.length - 1];
      state.px = last?.clientX ?? e.clientX;
      state.py = last?.clientY ?? e.clientY;

      state.lastMove = e.timeStamp;
      state.visible  = true;
      onChange();
    },
    opts,
  );

  // Hover only changes when the element under the pointer changes.
  document.addEventListener(
    "pointerover",
    (e) => {
      const hovering =
        e.target instanceof Element && e.target.closest(HOVER_SELECTOR) !== null;
      if (hovering !== state.hovering) {
        state.hovering = hovering;
        onChange();
      }
    },
    opts,
  );

  const release = (): void => {
    if (!state.clicking) return;
    state.clicking = false;
    onChange();
  };

  window.addEventListener("pointerdown",   () => { state.clicking = true; onChange(); }, opts);
  window.addEventListener("pointerup",     release, opts);
  window.addEventListener("pointercancel", release, opts);
  window.addEventListener("blur",          release, opts);

  // Pointer left the window (or entered an iframe): relatedTarget is null.
  document.addEventListener(
    "pointerout",
    (e) => {
      if (e.relatedTarget !== null) return;
      state.visible = false;
      onChange();
    },
    opts,
  );

  return state;
}

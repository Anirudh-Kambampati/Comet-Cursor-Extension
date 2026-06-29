import type { PointerState } from "./types.js";

// Interactive elements that trigger the hover state.
const HOVER_SELECTOR = "a, button, input, textarea, select, label, [role=button], [tabindex]";

/**
 * Tracks raw pointer position and interaction state.
 * All event listeners are passive so they never block scrolling.
 * State is read directly each animation frame — no callbacks.
 */
export function createPointerTracker(): PointerState & { vx: number; vy: number } {
  const state: PointerState & { vx: number; vy: number } = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    hovering: false,
    clicking: false,
    visible: false,
    vx: 0,
    vy: 0,
  };

  let prevX = state.x;
  let prevY = state.y;

  window.addEventListener(
    "pointermove",
    (e) => {
      const newX = e.clientX;
      const newY = e.clientY;

      // Simple velocity (delta per frame, smoothed later)
      state.vx = (newX - prevX) * 0.6;  // damping for smoothness
      state.vy = (newY - prevY) * 0.6;

      prevX = newX;
      prevY = newY;

      state.x = newX;
      state.y = newY;
      state.visible = true;
      state.hovering =
        e.target instanceof Element &&
        e.target.closest(HOVER_SELECTOR) !== null;
    },
    { passive: true }
  );

  window.addEventListener("pointerdown", () => { state.clicking = true; }, { passive: true });
  window.addEventListener("pointerup",   () => { state.clicking = false; }, { passive: true });

  // Hide cursor elements when the pointer leaves the window entirely.
  window.addEventListener("pointerleave", () => { state.visible = false; }, { passive: true });

  return state;
}
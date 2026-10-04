/**
 * cursor.ts — Comet cursor bootstrap.
 *
 * Creates the cursor DOM nodes (trail canvas, glow, ring, core canvas), wires
 * the pointer tracker to the on-demand animation loop, and can tear it all
 * down again when the popup toggle disables Comet.
 */

import type { CursorElements } from "./types.js";
import { createPointerTracker } from "./mouse.js";
import { createAnimation, type Animation } from "./animation.js";
import { createTrail }          from "./trail.js";
import { bakeSprite, type GlowShadow } from "./sprites.js";

/** Class on <html> that hides the native cursor — only while Comet is visible. */
const ACTIVE_CLASS = "comet-active";

/** CSS size of the core sparkle glyph in px (excluding glow). */
const CORE_SIZE = 20;

/** Glow baked into the core sparkle. */
const CORE_GLOW: readonly GlowShadow[] = [
  { blur: 4,  color: "rgba(255,255,255,1.0)" },
  { blur: 12, color: "rgba(168,85,247,0.95)" },
  { blur: 28, color: "rgba(139,92,246,0.65)" },
  { blur: 6,  color: "rgba(224,170,255,0.4)" },
];

let teardown: (() => void) | null = null;

export function enableCursor(): void {

  // Guard: already running (e.g. SPA re-injection).
  if (teardown !== null || document.getElementById("comet-core") !== null) return;

  const root       = document.documentElement;
  const controller = new AbortController();
  const signal     = controller.signal;

  // ── Nodes — appended in paint order (later = on top) ──────────────────────
  const trailCanvas = document.createElement("canvas");
  trailCanvas.id = "comet-trail";

  const glow = document.createElement("div");
  glow.id = "comet-glow";

  const ring = document.createElement("div");
  ring.id = "comet-ring";

  const core = document.createElement("canvas");
  core.id = "comet-core";

  root.append(trailCanvas, glow, ring, core);

  // ── Core sparkle: glow baked once, then only transformed ──────────────────
  bakeSprite(
    chrome.runtime.getURL("src/assets/sparkle.svg"),
    CORE_SIZE,
    CORE_GLOW,
    window.devicePixelRatio || 1,
  ).then(
    (sprite) => {
      if (signal.aborted) return;
      core.width  = sprite.canvas.width;
      core.height = sprite.canvas.height;
      core.style.width  = `${sprite.size}px`;
      core.style.height = `${sprite.size}px`;
      core.getContext("2d")?.drawImage(sprite.canvas, 0, 0);
    },
    (err) => { console.warn("[Comet] core sprite failed to load", err); },
  );

  const trail = createTrail(trailCanvas);
  window.addEventListener("resize", () => trail.resize(), { passive: true, signal });

  let animation: Animation | null = null;

  const pointer = createPointerTracker(() => {
    root.classList.toggle(ACTIVE_CLASS, pointer.visible);
    animation?.wake();
  }, signal);

  const elements: CursorElements = { core, ring, glow };
  animation = createAnimation(elements, pointer, trail);

  teardown = () => {
    controller.abort();
    animation?.stop();
    root.classList.remove(ACTIVE_CLASS);
    trailCanvas.remove();
    glow.remove();
    ring.remove();
    core.remove();
  };
}

export function disableCursor(): void {
  teardown?.();
  teardown = null;
}

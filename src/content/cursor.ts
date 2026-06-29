/**
 * cursor.ts — Comet cursor bootstrap.
 *
 * Creates the three cursor DOM nodes (core SVG, ring, glow), initialises the
 * trail pool, then hands off to the animation loop. Everything is idempotent —
 * a second call is a no-op (guard on #comet-core).
 */

import type { CursorElements } from "./types.js";
import { createPointerTracker } from "./mouse.js";
import { startAnimation }       from "./animation.js";
import { initTrail }            from "./trail.js";

export function initCursor(): void {

  // Guard: already initialised (e.g. SPA re-injection).
  if (document.getElementById("comet-core") !== null) return;

  const sparkleUrl = chrome.runtime.getURL("src/assets/sparkle.svg");

  // ── Core sparkle SVG ───────────────────────────────────────────────────────
  const core = document.createElement("img");
  core.id        = "comet-core";
  core.src       = sparkleUrl;
  core.draggable = false;

  // ── Trailing ring ──────────────────────────────────────────────────────────
  const ring = document.createElement("div");
  ring.id = "comet-ring";

  // ── Soft glow blob ─────────────────────────────────────────────────────────
  const glow = document.createElement("div");
  glow.id = "comet-glow";

  // Append cursor layers before trail sprites so sprites render behind the cursor.
  document.documentElement.append(core, ring, glow);

  // Initialise the trail pool — creates 80 <img> elements and appends to <html>.
  initTrail();

  const pointer = createPointerTracker();

  const elements: CursorElements = { core, ring, glow };

  startAnimation(elements, pointer);
}

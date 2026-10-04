/**
 * animation.ts — Comet animation loop.
 *
 * Drives cursor core / ring / glow via lerp, handles click + hover scale
 * states, and ticks the trail every frame.
 *
 * Only `transform` and `opacity` are mutated — no layout reads,
 * no getBoundingClientRect(), no top/left. GPU compositing only.
 *
 * The loop is on-demand: it runs while anything is moving or fading and
 * stops once everything has settled. `wake()` restarts it.
 *
 * All lerp factors are tuned per 60 fps frame and corrected for the real
 * frame time, so motion feels identical at 60 / 120 / 144 Hz.
 */

import type { CursorElements, PointerState } from "./types.js";
import type { Trail } from "./trail.js";

// ─── Lerp factors (per 60 fps frame) ──────────────────────────────────────────

/** How instantly the ring follows the raw cursor (0=frozen, 1=instant). */
const RING_LERP  = 0.68;

/** How quickly the glow follows the ring — secondary delay layer. */
const GLOW_LERP  = 0.42;

/** Lerp for visibility fade-in / fade-out. */
const OPACITY_LERP = 0.14;

// ─── Scale states ─────────────────────────────────────────────────────────────

const SCALE_CORE_CLICK  = 0.72;
const SCALE_RING_CLICK  = 0.82;
const SCALE_GLOW_CLICK  = 0.90;
const SCALE_RING_HOVER  = 1.22;

// ─── Tilt tuning ──────────────────────────────────────────────────────────────
/** Max tilt angle in degrees for directional momentum feel. */
const MAX_TILT_DEG = 12;
/** Degrees of tilt per px/frame of horizontal speed (leans into the motion). */
const TILT_PER_PX = 0.8;
/** How quickly tilt follows velocity (and returns to 0 when stopped). */
const TILT_LERP = 0.22;

// ─── Timing ───────────────────────────────────────────────────────────────────

const FRAME_MS = 1000 / 60;
/** Longest frame gap honoured — avoids jumps after a background tab resumes. */
const MAX_DT_MS = 100;
/** Predicted positions are trusted only this long after the last pointermove. */
const PREDICTION_TTL_MS = 24;
/** Below this distance (px) a lagged layer is considered caught up. */
const SETTLE_PX = 0.05;

/** Frame-rate–independent lerp factor: `k` per 60 fps frame, over `f` frames. */
function ease(k: number, f: number): number {
  return 1 - Math.pow(1 - k, f);
}

export interface Animation {
  wake(): void;
  stop(): void;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

export function createAnimation(
  el:    CursorElements,
  ptr:   PointerState,
  trail: Trail,
): Animation {

  // Lagged positions for ring and glow.
  let ringX = ptr.x;
  let ringY = ptr.y;
  let glowX = ptr.x;
  let glowY = ptr.y;

  // Smoothed visibility opacity (lerps toward 0 or 1).
  let opacity = 0;

  // Directional tilt for core, in degrees.
  let tilt  = 0;
  let prevX = ptr.x;

  let rafId = 0;
  let last  = 0;

  // Last written opacity strings — skip redundant style writes.
  let lastOp = "";

  function frame(now: number): void {
    const dt = last === 0 ? FRAME_MS : Math.min(Math.max(now - last, 0), MAX_DT_MS);
    const f  = dt / FRAME_MS;
    last = now;

    // ── Snap lagged layers when appearing from fully hidden ───────────────
    if (ptr.visible && opacity < 0.01) {
      ringX = glowX = prevX = ptr.x;
      ringY = glowY = ptr.y;
    }

    // ── Lerp lagged positions ─────────────────────────────────────────────
    const ringK = ease(RING_LERP, f);
    const glowK = ease(GLOW_LERP, f);
    ringX += (ptr.x - ringX) * ringK;
    ringY += (ptr.y - ringY) * ringK;
    glowX += (ringX - glowX) * glowK;
    glowY += (ringY - glowY) * glowK;

    // ── Directional tilt: lean into horizontal motion ─────────────────────
    const vx = f > 0 ? (ptr.x - prevX) / f : 0;
    prevX = ptr.x;
    const targetTilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, vx * TILT_PER_PX));
    tilt += (targetTilt - tilt) * ease(TILT_LERP, f);

    // ── Smooth fade in / out ──────────────────────────────────────────────
    const targetOpacity = ptr.visible ? 1 : 0;
    opacity += (targetOpacity - opacity) * ease(OPACITY_LERP, f);

    // ── Core uses the predicted position only while the pointer is moving ─
    const predicting = now - ptr.lastMove < PREDICTION_TTL_MS;
    const coreX = predicting ? ptr.px : ptr.x;
    const coreY = predicting ? ptr.py : ptr.y;

    // ── Settle detection ──────────────────────────────────────────────────
    const settled =
      !predicting &&
      Math.abs(ptr.x - ringX) < SETTLE_PX && Math.abs(ptr.y - ringY) < SETTLE_PX &&
      Math.abs(ringX - glowX) < SETTLE_PX && Math.abs(ringY - glowY) < SETTLE_PX &&
      Math.abs(targetOpacity - opacity) < 0.002 &&
      Math.abs(tilt) < 0.01;

    if (settled) {
      ringX = glowX = ptr.x;
      ringY = glowY = ptr.y;
      opacity = targetOpacity;
      tilt = 0;
    }

    // ── Scale states ──────────────────────────────────────────────────────
    const coreScale = ptr.clicking ? SCALE_CORE_CLICK : 1;
    const ringScale = ptr.clicking ? SCALE_RING_CLICK : ptr.hovering ? SCALE_RING_HOVER : 1;
    const glowScale = ptr.clicking ? SCALE_GLOW_CLICK : 1;

    // ── Apply transforms (GPU only) ───────────────────────────────────────
    el.core.style.transform =
      `translate3d(${coreX}px,${coreY}px,0) translate(-50%,-50%) rotate(${tilt.toFixed(2)}deg) scale(${coreScale})`;
    el.ring.style.transform =
      `translate3d(${ringX}px,${ringY}px,0) translate(-50%,-50%) scale(${ringScale})`;
    el.glow.style.transform =
      `translate3d(${glowX}px,${glowY}px,0) translate(-50%,-50%) scale(${glowScale})`;

    const op = opacity.toFixed(3);
    if (op !== lastOp) {
      lastOp = op;
      el.core.style.opacity = op;
      el.ring.style.opacity = (opacity * 0.90).toFixed(3);
      el.glow.style.opacity = (opacity * 0.85).toFixed(3);
    }

    // ── Trail ─────────────────────────────────────────────────────────────
    if (ptr.visible) {
      trail.update(ptr.x, ptr.y);
    }

    // Tick stars regardless of visibility so in-flight stars complete their
    // lifecycle naturally when the cursor leaves.
    const trailAlive = trail.tick(f);

    if (settled && !trailAlive) {
      rafId = 0;
      last  = 0;
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  return {
    wake(): void {
      if (rafId === 0) rafId = requestAnimationFrame(frame);
    },
    stop(): void {
      cancelAnimationFrame(rafId);
      rafId = 0;
      last  = 0;
    },
  };
}

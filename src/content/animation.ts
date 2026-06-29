/**
 * animation.ts — Comet animation loop.
 *
 * Drives cursor core / ring / glow via lerp, handles click + hover scale
 * states, and calls updateTrail() + tickTrail() every frame.
 *
 * Only `transform` and `opacity` are mutated — no layout reads,
 * no getBoundingClientRect(), no top/left. GPU compositing only.
 */

import type { CursorElements, PointerState } from "./types.js";
import { updateTrail, tickTrail } from "./trail.js";

// ─── Lerp factors ─────────────────────────────────────────────────────────────

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
/** How quickly tilt follows velocity direction. */
const TILT_LERP = 0.25;
/** How quickly tilt returns to 0 when stopped. */
const TILT_RETURN = 0.18;

// ─── Main loop ────────────────────────────────────────────────────────────────

export function startAnimation(
  el:  CursorElements,
  ptr: PointerState,
): void {

  // Lagged positions for ring and glow.
  let ringX = ptr.x;
  let ringY = ptr.y;
  let glowX = ptr.x;
  let glowY = ptr.y;

  // Smoothed visibility opacity (lerps toward 0 or 1).
  let opacity = 0;

  // Directional tilt for core
  let currentTilt = 0; // radians

  function frame(): void {
    // ── Lerp lagged positions ─────────────────────────────────────────────
    ringX += (ptr.x - ringX) * RING_LERP;
    ringY += (ptr.y - ringY) * RING_LERP;
    glowX += (ringX - glowX) * GLOW_LERP;
    glowY += (ringY - glowY) * GLOW_LERP;

    // ── Directional tilt for core sparkle ─────────────────────────────────
    const speed = Math.hypot((ptr as any).vx || 0, (ptr as any).vy || 0);
    if (speed > 0.5) {
      const targetAngle = Math.atan2((ptr as any).vy || 0, (ptr as any).vx || 0);
      currentTilt += (targetAngle - currentTilt) * TILT_LERP;
    } else {
      currentTilt *= (1 - TILT_RETURN);
    }

    // Clamp tilt
    const maxRad = (MAX_TILT_DEG * Math.PI) / 180;
    currentTilt = Math.max(-maxRad, Math.min(maxRad, currentTilt));

    // ── Smooth fade in / out ──────────────────────────────────────────────
    opacity += ((ptr.visible ? 1 : 0) - opacity) * OPACITY_LERP;

    // ── Scale states ──────────────────────────────────────────────────────
    const coreScale = ptr.clicking ? SCALE_CORE_CLICK : 1;
    const ringScale = ptr.clicking ? SCALE_RING_CLICK : ptr.hovering ? SCALE_RING_HOVER : 1;
    const glowScale = ptr.clicking ? SCALE_GLOW_CLICK : 1;

    // ── Apply transforms (GPU only) ───────────────────────────────────────
    const tiltDeg = (currentTilt * 180 / Math.PI).toFixed(2);
    el.core.style.transform =
      `translate3d(${ptr.x}px,${ptr.y}px,0) translate(-50%,-50%) rotate(${tiltDeg}deg) scale(${coreScale})`;
    el.ring.style.transform =
      `translate3d(${ringX}px,${ringY}px,0) translate(-50%,-50%) scale(${ringScale})`;
    el.glow.style.transform =
      `translate3d(${glowX}px,${glowY}px,0) translate(-50%,-50%) scale(${glowScale})`;

    const op     = opacity.toFixed(3);
    const opRing = (opacity * 0.90).toFixed(3);
    const opGlow = (opacity * 0.85).toFixed(3);

    el.core.style.opacity = op;
    el.ring.style.opacity = opRing;
    el.glow.style.opacity = opGlow;

    // ── Trail ─────────────────────────────────────────────────────────────
    if (ptr.visible) {
      updateTrail(ptr.x, ptr.y);
    }

    // Tick star fade/shrink/rotation regardless of visibility so in-flight
    // stars complete their lifecycle naturally when cursor leaves.
    tickTrail();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
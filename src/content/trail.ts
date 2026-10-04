/**
 * trail.ts — single-canvas trail engine for Comet.
 *
 * Architecture:
 *   - One full-viewport <canvas> instead of a DOM node per star: one compositor
 *     layer, no style recalcs, nothing injected into the page's DOM tree.
 *   - Each star is drawn from a pre-baked sprite (SVG + glow rasterised once).
 *   - Stars are stamped at spawn-time position, never moved — they stay exactly where born.
 *   - Only the region covered by last frame's stars is cleared each frame.
 *   - Trail hugs the cursor via a short history ring-buffer offset.
 *
 * Star lifecycle: spawn → opacity 1, scale ~1 → fade to 0, shrink → deactivate → recycle.
 */

import { bakeSprite, type BakedSprite, type GlowShadow } from "./sprites.js";

// ─── Tuning ─────────────────────────────────────────────────────────────────────

/** Minimum cursor travel (px) before spawning the next star. */
const SPAWN_DISTANCE = 10;

/** How many history frames behind the cursor to sample for spawn position.
 *  Keeps trail visually attached to the cursor with a tiny, natural curve. */
const HISTORY_OFFSET = 3;

/** Number of history slots in the ring buffer. */
const HISTORY_SIZE = 24;

/** Max simultaneous stars. */
const POOL_SIZE = 32;

/** CSS size of each star glyph in px (before scale, excluding glow). */
const STAR_SIZE = 14;

/** Per-frame (at 60 fps) opacity multiplier. Controls how quickly stars fade. */
const FADE_RATE = 0.915;

/** Per-frame (at 60 fps) scale multiplier. Stars shrink slightly as they fade. */
const SHRINK_RATE = 0.975;

/** Rotation increment per frame (at 60 fps) in radians. */
const ROTATION_DELTA = 0.018;

/** Below this opacity the star is deactivated and returned to pool. */
const OPACITY_KILL = 0.06;

/** Initial scale range [min, max]. */
const SCALE_MIN = 0.72;
const SCALE_MAX = 1.10;

/** Weighted sprite distribution: trail1=55%, trail2=20%, trail3=15%, trail4=10%. */
const WEIGHTS = [0.55, 0.75, 0.90, 1.0] as const;

/** Glow baked into every trail sprite. */
const STAR_GLOW: readonly GlowShadow[] = [
  { blur: 3,  color: "rgba(255,255,255,0.95)" },
  { blur: 8,  color: "rgba(168,85,247,0.85)" },
  { blur: 16, color: "rgba(139,92,246,0.6)" },
  { blur: 4,  color: "rgba(255,255,255,0.4)" },
];

const SPRITE_URLS = ["trail1.svg", "trail2.svg", "trail3.svg", "trail4.svg"] as const;

// ─── Types ───────────────────────────────────────────────────────────────────────

interface Star {
  x:        number;
  y:        number;
  scale:    number;
  rotation: number; // radians
  opacity:  number;
  sprite:   number;
  active:   boolean;
}

export interface Trail {
  /** Record the cursor position for this frame and spawn a star if it travelled far enough. */
  update(x: number, y: number): void;
  /** Advance and redraw all stars. `f` = elapsed time in 60 fps frames. Returns true while any star is alive. */
  tick(f: number): boolean;
  /** Match the canvas backing store to the viewport. */
  resize(): void;
}

// ─── Factory ─────────────────────────────────────────────────────────────────────

export function createTrail(canvas: HTMLCanvasElement): Trail {
  const ctx = canvas.getContext("2d");

  const sprites: BakedSprite[] = [];
  const pool: Star[] = Array.from({ length: POOL_SIZE }, () => ({
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 0, sprite: 0, active: false,
  }));
  const histX = new Float64Array(HISTORY_SIZE);
  const histY = new Float64Array(HISTORY_SIZE);

  let histHead  = 0;
  let histCount = 0;
  let poolHead  = 0;
  let lastSpawnX = -9999;
  let lastSpawnY = -9999;
  let dpr = 1;

  // Device-px rect painted last frame; empty when minX > maxX.
  let dirtyMinX = Infinity, dirtyMinY = Infinity, dirtyMaxX = -Infinity, dirtyMaxY = -Infinity;

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(window.innerWidth  * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    // Resizing wipes the canvas.
    dirtyMinX = dirtyMinY = Infinity;
    dirtyMaxX = dirtyMaxY = -Infinity;
  }
  resize();

  // Bake sprites in the background; spawning starts once they are ready.
  Promise.all(
    SPRITE_URLS.map((name) =>
      bakeSprite(chrome.runtime.getURL(`src/assets/${name}`), STAR_SIZE, STAR_GLOW, dpr)),
  ).then(
    (baked) => { sprites.push(...baked); },
    (err)   => { console.warn("[Comet] trail sprites failed to load", err); },
  );

  function pickSprite(): number {
    const r = Math.random();
    for (let i = 0; i < WEIGHTS.length; i++) {
      const w = WEIGHTS[i];
      if (w !== undefined && r < w) return i;
    }
    return 0;
  }

  function update(x: number, y: number): void {
    histX[histHead] = x;
    histY[histHead] = y;
    histHead = (histHead + 1) % HISTORY_SIZE;
    if (histCount < HISTORY_SIZE) histCount++;

    if (sprites.length === 0 || histCount <= HISTORY_OFFSET) return;
    if (Math.hypot(x - lastSpawnX, y - lastSpawnY) < SPAWN_DISTANCE) return;

    const idx  = (histHead - 1 - HISTORY_OFFSET + HISTORY_SIZE * 2) % HISTORY_SIZE;
    const star = pool[poolHead];
    if (star === undefined) return;
    poolHead = (poolHead + 1) % POOL_SIZE;

    star.active   = true;
    star.x        = histX[idx] ?? x;
    star.y        = histY[idx] ?? y;
    star.opacity  = 1.0;
    star.rotation = Math.random() * Math.PI * 2;
    star.scale    = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN);
    star.sprite   = pickSprite();

    lastSpawnX = x;
    lastSpawnY = y;
  }

  function tick(f: number): boolean {
    if (ctx === null) return false;

    // Clear only what was painted last frame.
    if (dirtyMinX <= dirtyMaxX) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(dirtyMinX, dirtyMinY, dirtyMaxX - dirtyMinX, dirtyMaxY - dirtyMinY);
      dirtyMinX = dirtyMinY = Infinity;
      dirtyMaxX = dirtyMaxY = -Infinity;
    }

    const fade   = Math.pow(FADE_RATE, f);
    const shrink = Math.pow(SHRINK_RATE, f);
    const spin   = ROTATION_DELTA * f;
    let alive = false;

    for (let i = 0; i < POOL_SIZE; i++) {
      const s = pool[i];
      if (s === undefined || !s.active) continue;

      s.opacity  *= fade;
      s.scale    *= shrink;
      s.rotation += spin;

      if (s.opacity < OPACITY_KILL) {
        s.active = false;
        continue;
      }

      const sp = sprites[s.sprite];
      if (sp === undefined) continue;
      alive = true;

      const cos  = Math.cos(s.rotation) * s.scale * dpr;
      const sin  = Math.sin(s.rotation) * s.scale * dpr;
      const half = sp.size / 2;
      ctx.globalAlpha = s.opacity;
      ctx.setTransform(cos, sin, -sin, cos, s.x * dpr, s.y * dpr);
      ctx.drawImage(sp.canvas, -half, -half, sp.size, sp.size);

      // Bounding box of the rotated sprite (√2 · half), plus 1px for AA.
      const r  = half * s.scale * dpr * Math.SQRT2 + 1;
      const cx = s.x * dpr;
      const cy = s.y * dpr;
      if (cx - r < dirtyMinX) dirtyMinX = Math.floor(cx - r);
      if (cy - r < dirtyMinY) dirtyMinY = Math.floor(cy - r);
      if (cx + r > dirtyMaxX) dirtyMaxX = Math.ceil(cx + r);
      if (cy + r > dirtyMaxY) dirtyMaxY = Math.ceil(cy + r);
    }

    return alive;
  }

  return { update, tick, resize };
}

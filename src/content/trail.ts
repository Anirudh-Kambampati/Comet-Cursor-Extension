/**
 * trail.ts — DOM SVG object-pool trail engine for Comet.
 *
 * Architecture:
 *   - Fixed pool of <img> elements, pre-created and recycled (no allocation during animation).
 *   - Each star is a real SVG asset, randomly chosen from 4 sprite variants.
 *   - Stars are stamped at spawn-time position, never moved — they stay exactly where born.
 *   - Fade + shrink + rotate per frame via transform/opacity — GPU composited, no layout.
 *   - Trail hugs the cursor via a short history ring-buffer offset.
 *
 * Star lifecycle: spawn → opacity 1, scale ~1 → fade to 0, shrink → deactivate → recycle.
 */

// ─── Tuning ─────────────────────────────────────────────────────────────────────

/** Minimum cursor travel (px) before spawning the next star. */
const SPAWN_DISTANCE = 10;

/** How many history frames behind the cursor to sample for spawn position.
 *  Keeps trail visually attached to the cursor with a tiny, natural curve. */
const HISTORY_OFFSET = 3;

/** Number of history slots in the ring buffer. */
const HISTORY_SIZE = 24;

/** Total DOM star nodes in the pool. Governs max simultaneous visible stars. */
const POOL_SIZE = 32;

/** CSS size of each star in px (before scale). */
const STAR_SIZE = 14;

/** Per-frame opacity multiplier. Controls how quickly stars fade. */
const FADE_RATE = 0.915;

/** Per-frame scale multiplier. Stars shrink slightly as they fade. */
const SHRINK_RATE = 0.975;

/** Rotation increment per frame in radians. */
const ROTATION_DELTA = 0.018;

/** Below this opacity the star is deactivated and returned to pool. */
const OPACITY_KILL = 0.06;

/** Initial scale range [min, max]. */
const SCALE_MIN = 0.72;
const SCALE_MAX = 1.10;

/** Weighted sprite distribution: trail1=55%, trail2=20%, trail3=15%, trail4=10%. */
const WEIGHTS = [0.55, 0.75, 0.90, 1.0] as const;

// ─── Types ───────────────────────────────────────────────────────────────────────

interface Star {
  el:       HTMLImageElement;
  x:        number;
  y:        number;
  scale:    number;
  rotation: number; // radians
  opacity:  number;
  active:   boolean;
}

interface HistoryPoint {
  x: number;
  y: number;
}

// ─── Module state ────────────────────────────────────────────────────────────────

const pool:    Star[]         = [];
const history: HistoryPoint[] = [];
const srcs:    string[]       = [];

let histHead  = 0;
let histCount = 0;
let poolHead  = 0;

let lastSpawnX = -9999;
let lastSpawnY = -9999;

// ─── Weighted sprite picker ───────────────────────────────────────────────────────

function pickSrc(): string {
  const r = Math.random();
  for (let i = 0; i < WEIGHTS.length; i++) {
    const w = WEIGHTS[i];
    if (w !== undefined && r < w) {
      return srcs[i] ?? srcs[0] ?? "";
    }
  }
  return srcs[0] ?? "";
}

// ─── History ring buffer ──────────────────────────────────────────────────────────

function historyPush(x: number, y: number): void {
  const slot = history[histHead];
  if (slot !== undefined) {
    slot.x = x;
    slot.y = y;
  } else {
    history[histHead] = { x, y };
  }
  histHead = (histHead + 1) % HISTORY_SIZE;
  if (histCount < HISTORY_SIZE) histCount++;
}

function historyRead(offset: number): HistoryPoint | null {
  if (offset >= histCount) return null;
  const idx = (histHead - 1 - offset + HISTORY_SIZE * 2) % HISTORY_SIZE;
  return history[idx] ?? null;
}

// ─── Spawn ────────────────────────────────────────────────────────────────────────

function spawn(pos: HistoryPoint): void {
  const star = pool[poolHead];
  if (star === undefined) return;
  poolHead = (poolHead + 1) % POOL_SIZE;

  // If recycling an active star, snap it invisible first.
  if (star.active) {
    star.el.style.opacity = "0";
  }

  star.active   = true;
  star.x        = pos.x;
  star.y        = pos.y;
  star.opacity  = 1.0;
  star.rotation = Math.random() * Math.PI * 2;
  star.scale    = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN);

  // Pick sprite — only switch src when needed to avoid repaints.
  const src = pickSrc();
  if (star.el.src !== src) star.el.src = src;

  const half = (STAR_SIZE * star.scale) / 2;
  // Stamp the position — transform only from here on, no top/left changes.
  star.el.style.transform =
    `translate3d(${star.x - half}px,${star.y - half}px,0) ` +
    `rotate(${star.rotation}rad) ` +
    `scale(${star.scale})`;
  star.el.style.opacity   = "1";
  star.el.style.width     = `${STAR_SIZE * star.scale}px`;
  star.el.style.height    = `${STAR_SIZE * star.scale}px`;
}

// ─── Per-frame tick ───────────────────────────────────────────────────────────────

export function tickTrail(): void {
  for (let i = 0; i < POOL_SIZE; i++) {
    const s = pool[i];
    if (s === undefined || !s.active) continue;

    s.opacity  *= FADE_RATE;
    s.scale    *= SHRINK_RATE;
    s.rotation += ROTATION_DELTA;

    if (s.opacity < OPACITY_KILL) {
      s.active           = false;
      s.el.style.opacity = "0";
      continue;
    }

    const half = (STAR_SIZE * s.scale) / 2;
    s.el.style.transform =
      `translate3d(${s.x - half}px,${s.y - half}px,0) ` +
      `rotate(${s.rotation}rad) ` +
      `scale(${s.scale})`;
    s.el.style.opacity = s.opacity.toFixed(3);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────────

export function initTrail(): void {
  // Build sprite URLs.
  srcs.push(
    chrome.runtime.getURL("src/assets/trail1.svg"),
    chrome.runtime.getURL("src/assets/trail2.svg"),
    chrome.runtime.getURL("src/assets/trail3.svg"),
    chrome.runtime.getURL("src/assets/trail4.svg"),
  );

  // Create the DOM pool. All stars live on <html>, behind cursor layers.
  const container = document.documentElement;

  for (let i = 0; i < POOL_SIZE; i++) {
    const el = document.createElement("img");
    el.draggable = false;
    el.style.cssText =
      `position:fixed;top:0;left:0;` +
      `width:${STAR_SIZE}px;height:${STAR_SIZE}px;` +
      `pointer-events:none;user-select:none;` +
      `opacity:0;` +
      `will-change:transform,opacity;` +
      `z-index:999994;` +
      `object-fit:contain;` +
      `filter:` +
        `drop-shadow(0 0 3px rgba(255,255,255,0.95)) ` +
        `drop-shadow(0 0 8px rgba(168,85,247,0.85)) ` +
        `drop-shadow(0 0 16px rgba(139,92,246,0.6)) ` +
        `drop-shadow(0 0 4px rgba(255,255,255,0.4));`;

    container.appendChild(el);

    pool.push({
      el,
      x: 0, y: 0,
      scale: 1, rotation: 0, opacity: 0,
      active: false,
    });
  }
}

export function updateTrail(cursorX: number, cursorY: number): void {
  historyPush(cursorX, cursorY);

  const dx = cursorX - lastSpawnX;
  const dy = cursorY - lastSpawnY;
  if (Math.hypot(dx, dy) >= SPAWN_DISTANCE) {
    const pos = historyRead(HISTORY_OFFSET);
    if (pos !== null) {
      spawn(pos);
      lastSpawnX = cursorX;
      lastSpawnY = cursorY;
    }
  }
}
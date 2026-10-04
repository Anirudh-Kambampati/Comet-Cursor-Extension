/**
 * sprites.ts — one-time glow baking.
 *
 * CSS `drop-shadow()` filters on moving elements get re-rasterised every time
 * their transform changes. Instead we rasterise each sprite once, with its glow,
 * into an offscreen canvas and only ever transform the result.
 *
 * Shadows are chained exactly like a CSS filter list: each pass shadows the
 * output of the previous one.
 */

export interface GlowShadow {
  /** Blur radius in CSS px — same meaning as in `drop-shadow(0 0 <blur>px …)`. */
  blur:  number;
  color: string;
}

export interface BakedSprite {
  canvas: HTMLCanvasElement;
  /** Edge length in CSS px, including the glow padding. */
  size:   number;
}

function makeCanvas(px: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width  = px;
  c.height = px;
  return c;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/**
 * Rasterises `url` contain-fitted into a `size`×`size` CSS-px box, adds the
 * glow passes, and returns a square canvas at `scale` device px per CSS px.
 */
export async function bakeSprite(
  url:     string,
  size:    number,
  shadows: readonly GlowShadow[],
  scale:   number,
): Promise<BakedSprite> {
  const img = await loadImage(url);

  // Blur fades out at ~1.5× its radius; 1.25× of the total is visually lossless.
  const pad     = Math.ceil(shadows.reduce((sum, s) => sum + s.blur, 0) * 1.25);
  const cssSize = size + pad * 2;
  const px      = Math.ceil(cssSize * scale);

  let out = makeCanvas(px);
  const ctx = out.getContext("2d");
  if (ctx === null) throw new Error("2d context unavailable");

  const iw    = img.naturalWidth  || size;
  const ih    = img.naturalHeight || size;
  const ratio = Math.min(size / iw, size / ih);
  const w     = iw * ratio;
  const h     = ih * ratio;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.drawImage(img, pad + (size - w) / 2, pad + (size - h) / 2, w, h);

  for (const s of shadows) {
    const next = makeCanvas(px);
    const nctx = next.getContext("2d");
    if (nctx === null) throw new Error("2d context unavailable");
    // shadowBlur ignores the transform, so it is specified in device px.
    nctx.shadowColor = s.color;
    nctx.shadowBlur  = s.blur * scale;
    nctx.drawImage(out, 0, 0);
    out = next;
  }

  return { canvas: out, size: cssSize };
}

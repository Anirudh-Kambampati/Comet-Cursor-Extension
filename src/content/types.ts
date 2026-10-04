// Handles for the DOM nodes that make up the cursor.
export interface CursorElements {
  core: HTMLCanvasElement;
  ring: HTMLDivElement;
  glow: HTMLDivElement;
}

// Live pointer state, read every animation frame.
export interface PointerState {
  /** Latest real pointer position. */
  x: number;
  y: number;
  /** Browser-predicted position (falls back to x/y) — used for the core to hide latency. */
  px: number;
  py: number;
  /** event.timeStamp of the last pointermove (performance.now() timebase). */
  lastMove: number;
  hovering: boolean;
  clicking: boolean;
  visible: boolean;
}

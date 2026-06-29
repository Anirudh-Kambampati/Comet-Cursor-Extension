// Handles for the three DOM nodes that make up the cursor.
export interface CursorElements {
  core: HTMLImageElement;
  ring: HTMLDivElement;
  glow: HTMLDivElement;
}

// Live pointer state, read every animation frame.
export interface PointerState {
  x: number;
  y: number;
  hovering: boolean;
  clicking: boolean;
  visible: boolean;
}

// For directional tilt
export interface Velocity {
  vx: number;
  vy: number;
}
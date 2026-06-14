/**
 * Global map reference for screenshot capture
 * This allows the snapshot export utility to access the map instance
 */

import type { Map as MaplibreMap } from 'maplibre-gl';

let mapInstance: MaplibreMap | null = null;
let deckCanvas: HTMLCanvasElement | null = null;

export function setMapInstance(map: MaplibreMap | null): void {
  mapInstance = map;
}

export function getMapInstance(): MaplibreMap | null {
  return mapInstance;
}

export function setDeckCanvas(canvas: HTMLCanvasElement | null): void {
  deckCanvas = canvas;
}

export function getDeckCanvas(): HTMLCanvasElement | null {
  return deckCanvas;
}

/**
 * Get the maplibre canvas for screenshot
 */
export function getMapCanvas(): HTMLCanvasElement | null {
  if (mapInstance) {
    return mapInstance.getCanvas();
  }
  return null;
}

// --- HD capture --------------------------------------------------------------
// The export pipeline reads the on-screen canvases, so resolution is normally
// capped by screen size × devicePixelRatio. For HD we temporarily supersample
// BOTH layers in place: maplibre via setPixelRatio, deck.gl via useDevicePixels
// (a React prop, so MapView registers its setter here). CSS size is unchanged,
// so there's no layout shift — only the drawing buffers grow.

let deckPixelRatioSetter: ((ratio: number | undefined) => void) | null = null;

/** MapView registers its deck `useDevicePixels` setter so HD capture can drive it. */
export function registerDeckPixelRatioSetter(
  setter: ((ratio: number | undefined) => void) | null
): void {
  deckPixelRatioSetter = setter;
}

/**
 * Raise both layers' pixel ratio so the map renders large enough that its
 * longer edge is at least `targetLongEdge` px, then resolve once both have
 * redrawn. Returns a restore function that resets the ratios. Clamped to the
 * GPU's max renderbuffer size; a no-op (restore does nothing) when the screen
 * already renders at/above the target.
 */
export async function prepareHiResMapCapture(targetLongEdge: number): Promise<() => void> {
  const map = mapInstance;
  if (!map) return () => {};

  const canvas = map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const cssLong = Math.max(rect.width, rect.height) || 1;
  const cssShort = Math.min(rect.width, rect.height) || 1;
  const baseDpr = window.devicePixelRatio || 1;

  // GPU renderbuffer ceiling (commonly 4096 on mobile, 8192–16384 desktop).
  let gpuMax = 4096;
  try {
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    if (gl) {
      const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
      if (max) gpuMax = max;
    }
  } catch {
    // keep conservative default
  }

  // Exports crop to an aspect, so the binding dimension is the SHORTER screen
  // edge — base the ratio on it so a square/cropped export actually reaches the
  // target. Clamp so the longer backing edge stays within the GPU limit.
  const cap = Math.min(gpuMax, 8192);
  const maxRatio = Math.max(1, cap / cssLong);
  const ratio = Math.min(maxRatio, Math.max(baseDpr, targetLongEdge / cssShort));

  // The screen already renders at/above the target — no supersample needed.
  if (ratio <= baseDpr + 0.01) return () => {};

  map.setPixelRatio(ratio);
  deckPixelRatioSetter?.(ratio);

  // Wait for both layers to resize their buffers and redraw.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    map.once('idle', finish);
    setTimeout(finish, 1500); // safety net if 'idle' never fires
  });
  // Two frames + a short settle so the deck.gl overlay (driven by a React
  // state change) has resized its drawing buffer and redrawn before capture.
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await new Promise<void>((r) => setTimeout(r, 120));

  return () => {
    map.setPixelRatio(baseDpr);
    deckPixelRatioSetter?.(undefined);
  };
}

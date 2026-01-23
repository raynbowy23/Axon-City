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

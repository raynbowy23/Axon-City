/**
 * Snapshot Export Utility
 * Capture map view as PNG/JPEG image with overlays
 */

import type { SnapshotOptions, ComparisonArea, LayerConfig } from '../types';
import { layerManifest } from '../data/layerManifest';

// Default export options
export const defaultSnapshotOptions: SnapshotOptions = {
  width: 1920,
  height: 1080,
  includeLegend: true,
  includeMetrics: false,
  includeAttribution: true,
  format: 'png',
  quality: 0.92,
};

interface OverlayConfig {
  presetName?: string;
  areas: ComparisonArea[];
  activeLayers: string[];
  timestamp: string;
}

/**
 * Get the map canvas element
 */
function getMapCanvas(): HTMLCanvasElement | null {
  // deck.gl renders to a canvas with class 'mapboxgl-canvas' or similar
  const mapCanvas = document.querySelector('.mapboxgl-canvas') as HTMLCanvasElement;
  if (mapCanvas) return mapCanvas;

  // Fallback: look for any canvas in the map container
  const container = document.querySelector('#deckgl-wrapper canvas') as HTMLCanvasElement;
  return container || null;
}

/**
 * Capture the current map view
 */
async function captureMapCanvas(): Promise<HTMLCanvasElement | null> {
  const mapCanvas = getMapCanvas();
  if (!mapCanvas) return null;

  // Create a copy of the canvas
  const canvas = document.createElement('canvas');
  canvas.width = mapCanvas.width;
  canvas.height = mapCanvas.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(mapCanvas, 0, 0);
  return canvas;
}

/**
 * Draw legend overlay on canvas
 */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  activeLayers: string[],
  presetName?: string
): number {
  const padding = 16;
  const itemHeight = 24;
  const colorBoxSize = 14;

  // Get active layer configs
  const layers = activeLayers
    .map((id) => layerManifest.layers.find((l) => l.id === id))
    .filter((l): l is LayerConfig => l !== undefined)
    .slice(0, 8); // Max 8 layers in legend

  const legendHeight = padding * 2 + (presetName ? 32 : 0) + layers.length * itemHeight + 8;

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, legendHeight, 8);
  ctx.fill();
  ctx.stroke();

  let currentY = y + padding;

  // Draw preset name if present
  if (presetName) {
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(presetName, x + padding, currentY + 12);
    currentY += 28;

    // Separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(x + padding, currentY);
    ctx.lineTo(x + width - padding, currentY);
    ctx.stroke();
    currentY += 8;
  }

  // Draw layer items
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  for (const layer of layers) {
    const [r, g, b] = layer.style.fillColor;

    // Color box
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x + padding, currentY + 4, colorBoxSize, colorBoxSize);

    // Layer name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.fillText(layer.name, x + padding + colorBoxSize + 8, currentY + 14);

    currentY += itemHeight;
  }

  return legendHeight;
}

/**
 * Draw area labels overlay
 */
function drawAreaLabels(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  areas: ComparisonArea[]
): number {
  if (areas.length === 0) return 0;

  const padding = 12;
  const itemHeight = 20;
  const height = padding * 2 + areas.length * itemHeight;

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  let currentY = y + padding;

  // Draw area items
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  for (const area of areas) {
    const [r, g, b] = area.color;

    // Color indicator
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    ctx.arc(x + padding + 6, currentY + 8, 6, 0, Math.PI * 2);
    ctx.fill();

    // Area name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.fillText(area.name, x + padding + 20, currentY + 12);

    currentY += itemHeight;
  }

  return height;
}

/**
 * Draw attribution footer
 */
function drawAttribution(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  timestamp: string
): void {
  const padding = 12;
  const height = 32;
  const y = canvasHeight - height;

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, y, canvasWidth, height);

  // Left side: AxonCity branding
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('AxonCity', padding, y + 20);

  // Center: timestamp
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(timestamp, canvasWidth / 2, y + 20);

  // Right side: OSM attribution
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Data: OpenStreetMap contributors', canvasWidth - padding, y + 20);
}

/**
 * Helper to draw rounded rectangles
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Capture map snapshot with overlays
 */
export async function captureSnapshot(
  options: SnapshotOptions,
  overlay: OverlayConfig
): Promise<Blob | null> {
  // Capture the map canvas
  const mapCanvas = await captureMapCanvas();
  if (!mapCanvas) {
    console.error('Could not capture map canvas');
    return null;
  }

  // Create output canvas at desired resolution
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Calculate scaling to fit map into output canvas
  const scaleX = options.width / mapCanvas.width;
  const scaleY = options.height / mapCanvas.height;
  const scale = Math.max(scaleX, scaleY);

  // Center the map
  const offsetX = (options.width - mapCanvas.width * scale) / 2;
  const offsetY = (options.height - mapCanvas.height * scale) / 2;

  // Draw black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, options.width, options.height);

  // Draw scaled map
  ctx.drawImage(
    mapCanvas,
    offsetX,
    offsetY,
    mapCanvas.width * scale,
    mapCanvas.height * scale
  );

  // Draw overlays
  const margin = 16;
  const legendWidth = 200;

  if (options.includeLegend && overlay.activeLayers.length > 0) {
    let legendY = margin;

    // Draw area labels if multiple areas
    if (overlay.areas.length > 1) {
      const areasHeight = drawAreaLabels(
        ctx,
        margin,
        legendY,
        legendWidth,
        overlay.areas
      );
      legendY += areasHeight + 8;
    }

    // Draw layer legend
    drawLegend(
      ctx,
      margin,
      legendY,
      legendWidth,
      overlay.activeLayers,
      overlay.presetName
    );
  }

  if (options.includeAttribution) {
    drawAttribution(ctx, options.width, options.height, overlay.timestamp);
  }

  // Convert to blob
  return new Promise((resolve) => {
    const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      options.format === 'jpeg' ? options.quality : undefined
    );
  });
}

/**
 * Download snapshot as file
 */
export function downloadSnapshot(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy snapshot to clipboard
 */
export async function copySnapshotToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob }),
    ]);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Generate snapshot and download
 */
export async function exportSnapshot(
  options: Partial<SnapshotOptions>,
  overlay: OverlayConfig,
  filename?: string
): Promise<boolean> {
  const fullOptions = { ...defaultSnapshotOptions, ...options };

  const blob = await captureSnapshot(fullOptions, overlay);
  if (!blob) return false;

  const defaultFilename = `axoncity-${overlay.areas.map((a) => a.name.toLowerCase().replace(/\s+/g, '-')).join('-vs-')}-${new Date().toISOString().split('T')[0]}.${fullOptions.format}`;

  downloadSnapshot(blob, filename || defaultFilename);
  return true;
}

/**
 * Generate preview image (smaller size for dialogs)
 */
export async function generatePreview(overlay: OverlayConfig): Promise<string | null> {
  const options: SnapshotOptions = {
    width: 640,
    height: 360,
    includeLegend: true,
    includeMetrics: false,
    includeAttribution: true,
    format: 'png',
    quality: 0.8,
  };

  const blob = await captureSnapshot(options, overlay);
  if (!blob) return null;

  return URL.createObjectURL(blob);
}

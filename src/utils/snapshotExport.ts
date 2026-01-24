/**
 * Snapshot Export Utility
 * Capture map view as PNG/JPEG image with overlays
 */

import type { SnapshotOptions, ComparisonArea, LayerConfig } from '../types';
import { layerManifest } from '../data/layerManifest';
import { getMapInstance } from './mapRef';

// Default export options - Square (1:1)
export const defaultSnapshotOptions: SnapshotOptions = {
  width: 540,
  height: 540,
  includeLegend: true,
  includeMetrics: false,
  includeAttribution: true,
  format: 'png',
  quality: 1.0,
};

// Portrait (4:5)
export const instagramPortraitOptions: SnapshotOptions = {
  width: 540,
  height: 675,
  includeLegend: true,
  includeMetrics: false,
  includeAttribution: true,
  format: 'png',
  quality: 1.0,
};

// Story (9:16)
export const instagramStoryOptions: SnapshotOptions = {
  width: 540,
  height: 960,
  includeLegend: true,
  includeMetrics: false,
  includeAttribution: true,
  format: 'png',
  quality: 1.0,
};

interface OverlayConfig {
  presetName?: string;
  areas: ComparisonArea[];
  activeLayers: string[];
  timestamp: string;
}

/**
 * Wait for map to be idle (all tiles loaded)
 */
function waitForMapIdle(map: any, timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (map.loaded() && map.areTilesLoaded()) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, timeout);

    map.once('idle', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Capture maplibre canvas by rendering to image during animation frame
 */
async function captureMaplibreCanvas(map: any): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    // Use requestAnimationFrame to capture during the render cycle
    const captureFrame = () => {
      try {
        const mapCanvas = map.getCanvas();
        if (!mapCanvas) {
          resolve(null);
          return;
        }

        // Create a new canvas and copy the content
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = mapCanvas.width;
        outputCanvas.height = mapCanvas.height;
        const ctx = outputCanvas.getContext('2d');

        if (!ctx) {
          resolve(null);
          return;
        }

        // Try to draw the map canvas
        try {
          ctx.drawImage(mapCanvas, 0, 0);

          // Check if the canvas has content (not all transparent)
          const imageData = ctx.getImageData(0, 0, Math.min(100, outputCanvas.width), Math.min(100, outputCanvas.height));
          const hasContent = imageData.data.some((val, idx) => idx % 4 !== 3 ? val > 0 : false);

          if (hasContent) {
            resolve(outputCanvas);
          } else {
            console.warn('Map canvas appears empty, trying alternative capture');
            resolve(null);
          }
        } catch (e) {
          console.warn('Could not draw map canvas (WebGL context issue):', e);
          resolve(null);
        }
      } catch (e) {
        console.warn('Error in capture frame:', e);
        resolve(null);
      }
    };

    // Trigger repaint and capture on next frame
    map.triggerRepaint();
    requestAnimationFrame(() => {
      requestAnimationFrame(captureFrame);
    });
  });
}

/**
 * Capture the map using the registered map instance
 */
async function captureMapCanvases(): Promise<HTMLCanvasElement | null> {
  const mapInstance = getMapInstance();

  // Wait for map to be idle if we have the instance
  if (mapInstance) {
    try {
      await waitForMapIdle(mapInstance);
    } catch (e) {
      console.warn('Error waiting for map:', e);
    }
  }

  // Find the map container
  const mapContainer = document.querySelector('#deckgl-wrapper') ||
                       document.querySelector('.maplibregl-map') ||
                       document.querySelector('[class*="deckgl"]');

  if (!mapContainer) {
    console.error('Could not find map container');
    return null;
  }

  // Get container dimensions
  const containerRect = mapContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(containerRect.width * dpr);
  const height = Math.round(containerRect.height * dpr);

  // Create output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return null;

  // Fill with dark background first
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // Try to capture the maplibre canvas directly first
  let mapCaptured = false;
  if (mapInstance) {
    // First try direct canvas capture
    let mapCanvas = await captureMaplibreCanvas(mapInstance);

    // If that fails, try WebGL readPixels (works even without preserveDrawingBuffer)
    if (!mapCanvas || mapCanvas.width === 0) {
      console.log('Trying WebGL readPixels capture...');
      mapCanvas = await captureWebGLCanvas(mapInstance);
    }

    if (mapCanvas && mapCanvas.width > 0 && mapCanvas.height > 0) {
      ctx.drawImage(mapCanvas, 0, 0, width, height);
      mapCaptured = true;
      console.log('Successfully captured maplibre canvas');
    }
  }

  // Find all canvases in the map container
  const canvases = mapContainer.querySelectorAll('canvas');

  // Sort canvases to ensure correct layer order (maplibre first, then deck.gl)
  const sortedCanvases = Array.from(canvases).sort((a, b) => {
    const aIsMap = a.classList.contains('maplibregl-canvas') || a.classList.contains('mapboxgl-canvas');
    const bIsMap = b.classList.contains('maplibregl-canvas') || b.classList.contains('mapboxgl-canvas');
    if (aIsMap && !bIsMap) return -1;
    if (!aIsMap && bIsMap) return 1;
    return 0;
  });

  // Draw each canvas (skip maplibre canvas if already captured)
  for (const canvas of sortedCanvases) {
    const isMaplibreCanvas = canvas.classList.contains('maplibregl-canvas') || canvas.classList.contains('mapboxgl-canvas');

    // Skip maplibre canvas if we already captured it
    if (isMaplibreCanvas && mapCaptured) {
      continue;
    }

    if (canvas.width > 0 && canvas.height > 0) {
      try {
        // Draw canvas scaled to output size
        ctx.drawImage(canvas, 0, 0, width, height);
        console.log('Drew canvas:', canvas.className || 'unnamed', canvas.width, 'x', canvas.height);
      } catch (e) {
        console.warn('Could not draw canvas:', e, canvas.className);
      }
    }
  }

  return outputCanvas;
}

/**
 * Capture WebGL canvas using readPixels (works even without preserveDrawingBuffer)
 * This captures during the render frame
 */
async function captureWebGLCanvas(map: any): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const capture = () => {
      try {
        const mapCanvas = map.getCanvas() as HTMLCanvasElement;
        if (!mapCanvas) {
          resolve(null);
          return;
        }

        const gl = mapCanvas.getContext('webgl') || mapCanvas.getContext('webgl2');
        if (!gl) {
          resolve(null);
          return;
        }

        const width = mapCanvas.width;
        const height = mapCanvas.height;

        // Read pixels from WebGL context
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Check if we got any non-zero pixels
        let hasContent = false;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0) {
            hasContent = true;
            break;
          }
        }

        if (!hasContent) {
          console.warn('WebGL readPixels returned empty buffer');
          resolve(null);
          return;
        }

        // Create output canvas
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = width;
        outputCanvas.height = height;
        const ctx = outputCanvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        // Create ImageData and flip vertically (WebGL has Y flipped)
        const imageData = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcIdx = ((height - y - 1) * width + x) * 4;
            const dstIdx = (y * width + x) * 4;
            imageData.data[dstIdx] = pixels[srcIdx];
            imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
            imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
            imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
          }
        }

        ctx.putImageData(imageData, 0, 0);
        console.log('Successfully captured map via WebGL readPixels');
        resolve(outputCanvas);
      } catch (e) {
        console.warn('WebGL readPixels capture failed:', e);
        resolve(null);
      }
    };

    // Hook into the render event
    const onRender = () => {
      capture();
      map.off('render', onRender);
    };

    map.on('render', onRender);
    map.triggerRepaint();

    // Timeout fallback
    setTimeout(() => {
      map.off('render', onRender);
      resolve(null);
    }, 1000);
  });
}

/**
 * Alternative: Find all canvases and composite them
 */
async function captureMapFallback(): Promise<HTMLCanvasElement | null> {
  // Find all map-related canvases
  const mapContainer = document.querySelector('#deckgl-wrapper') as HTMLElement ||
                       document.querySelector('.maplibregl-map') as HTMLElement ||
                       document.querySelector('.mapboxgl-map') as HTMLElement;

  if (!mapContainer) {
    console.error('Could not find map container');
    return null;
  }

  const rect = mapContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Create canvas matching container size
  const canvas = document.createElement('canvas');
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill with dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Get all canvases and draw them in order
  const canvases = mapContainer.querySelectorAll('canvas');

  for (const srcCanvas of canvases) {
    try {
      if (srcCanvas.width > 0 && srcCanvas.height > 0) {
        // Scale to match output canvas
        ctx.drawImage(srcCanvas, 0, 0, canvas.width, canvas.height);
      }
    } catch (e) {
      console.warn('Canvas capture failed:', e);
    }
  }

  return canvas;
}

/**
 * Draw legend overlay on canvas
 * Scale factor adjusts sizes based on output resolution
 */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  activeLayers: string[],
  presetName?: string,
  scaleFactor: number = 1
): number {
  const padding = Math.round(8 * scaleFactor);
  const itemHeight = Math.round(16 * scaleFactor);
  const colorBoxSize = Math.round(10 * scaleFactor);
  const borderRadius = Math.round(6 * scaleFactor);

  // Get active layer configs
  const layers = activeLayers
    .map((id) => layerManifest.layers.find((l) => l.id === id))
    .filter((l): l is LayerConfig => l !== undefined)
    .slice(0, 6); // Max 6 layers in legend for compact view

  const legendHeight = padding * 2 + (presetName ? Math.round(20 * scaleFactor) : 0) + layers.length * itemHeight + Math.round(4 * scaleFactor);

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, legendHeight, borderRadius);
  ctx.fill();
  ctx.stroke();

  let currentY = y + padding;

  // Draw preset name if present
  if (presetName) {
    ctx.font = `bold ${Math.round(10 * scaleFactor)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(presetName, x + padding, currentY + Math.round(8 * scaleFactor));
    currentY += Math.round(16 * scaleFactor);

    // Separator line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + padding, currentY);
    ctx.lineTo(x + width - padding, currentY);
    ctx.stroke();
    currentY += Math.round(4 * scaleFactor);
  }

  // Draw layer items
  ctx.font = `${Math.round(9 * scaleFactor)}px system-ui, -apple-system, sans-serif`;
  for (const layer of layers) {
    const [r, g, b] = layer.style.fillColor;

    // Color box
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    roundRect(ctx, x + padding, currentY + Math.round(2 * scaleFactor), colorBoxSize, colorBoxSize, 2);
    ctx.fill();

    // Layer name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.fillText(layer.name, x + padding + colorBoxSize + Math.round(6 * scaleFactor), currentY + Math.round(10 * scaleFactor));

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
  areas: ComparisonArea[],
  scaleFactor: number = 1
): number {
  if (areas.length === 0) return 0;

  const padding = Math.round(8 * scaleFactor);
  const itemHeight = Math.round(14 * scaleFactor);
  const height = padding * 2 + areas.length * itemHeight;
  const borderRadius = Math.round(6 * scaleFactor);
  const dotRadius = Math.round(4 * scaleFactor);

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, borderRadius);
  ctx.fill();
  ctx.stroke();

  let currentY = y + padding;

  // Draw area items
  ctx.font = `${Math.round(9 * scaleFactor)}px system-ui, -apple-system, sans-serif`;
  for (const area of areas) {
    const [r, g, b] = area.color;

    // Color indicator
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    ctx.arc(x + padding + dotRadius, currentY + Math.round(6 * scaleFactor), dotRadius, 0, Math.PI * 2);
    ctx.fill();

    // Area name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    ctx.fillText(area.name, x + padding + dotRadius * 2 + Math.round(6 * scaleFactor), currentY + Math.round(9 * scaleFactor));

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
  timestamp: string,
  scaleFactor: number = 1
): void {
  const padding = Math.round(10 * scaleFactor);
  const height = Math.round(24 * scaleFactor);
  const y = canvasHeight - height;

  // Draw background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, y, canvasWidth, height);

  const textY = y + Math.round(16 * scaleFactor);

  // Left side: AxonCity branding
  ctx.font = `bold ${Math.round(9 * scaleFactor)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText('AxonCity', padding, textY);

  // Center: timestamp
  ctx.font = `${Math.round(8 * scaleFactor)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(timestamp, canvasWidth / 2, textY);

  // Right side: OSM attribution
  ctx.font = `${Math.round(8 * scaleFactor)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('© OpenStreetMap', canvasWidth - padding, textY);
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
  // Try to capture the map canvases
  let mapCanvas = await captureMapCanvases();

  // Fallback if first method fails
  if (!mapCanvas || mapCanvas.width === 0) {
    mapCanvas = await captureMapFallback();
  }

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

  // Disable image smoothing for crisp pixels (no blur from interpolation)
  ctx.imageSmoothingEnabled = false;

  // Draw black background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, options.width, options.height);

  // Calculate crop to fit output aspect ratio (crop from center, no scaling up)
  const outputAspect = options.width / options.height;
  const sourceAspect = mapCanvas.width / mapCanvas.height;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = mapCanvas.width;
  let sourceHeight = mapCanvas.height;

  if (sourceAspect > outputAspect) {
    // Source is wider - crop sides
    sourceWidth = mapCanvas.height * outputAspect;
    sourceX = (mapCanvas.width - sourceWidth) / 2;
  } else {
    // Source is taller - crop top/bottom
    sourceHeight = mapCanvas.width / outputAspect;
    sourceY = (mapCanvas.height - sourceHeight) / 2;
  }

  // Draw the cropped map at output size (1:1 or downscale, never upscale)
  ctx.drawImage(
    mapCanvas,
    sourceX, sourceY, sourceWidth, sourceHeight,  // Source crop
    0, 0, options.width, options.height            // Destination
  );

  // Calculate scale factor based on output size (base 540px)
  const scaleFactor = Math.min(options.width, options.height) / 540;
  const margin = Math.round(8 * scaleFactor);
  const legendWidth = Math.round(100 * scaleFactor);

  if (options.includeLegend && overlay.activeLayers.length > 0) {
    let legendY = margin;

    // Draw area labels if multiple areas
    if (overlay.areas.length > 1) {
      const areasHeight = drawAreaLabels(
        ctx,
        margin,
        legendY,
        legendWidth,
        overlay.areas,
        scaleFactor
      );
      legendY += areasHeight + Math.round(10 * scaleFactor);
    }

    // Draw layer legend
    drawLegend(
      ctx,
      margin,
      legendY,
      legendWidth,
      overlay.activeLayers,
      overlay.presetName,
      scaleFactor
    );
  }

  if (options.includeAttribution) {
    drawAttribution(ctx, options.width, options.height, overlay.timestamp, scaleFactor);
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
 * Generate preview image (square format for consistency)
 */
export async function generatePreview(overlay: OverlayConfig): Promise<string | null> {
  const options: SnapshotOptions = {
    width: 540,
    height: 540,
    includeLegend: true,
    includeMetrics: false,
    includeAttribution: true,
    format: 'png',
    quality: 0.9,
  };

  const blob = await captureSnapshot(options, overlay);
  if (!blob) return null;

  return URL.createObjectURL(blob);
}

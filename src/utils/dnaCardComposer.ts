/**
 * City DNA share card (novelty track N2).
 *
 * Renders a square, shareable PNG: the DNA glyph drawn natively on a 2D canvas
 * (same radial geometry as DnaGlyph) plus the area name, traits, top similarity
 * match, and baked-in attribution. Reuses the bundled poster font + the
 * poster blob/download helpers so it stays consistent with N1.
 */

import { DNA_DIMENSIONS } from './cityDna';
import { POSTER_FONT_FAMILY } from './posterFonts';

export interface DnaCardVector {
  values: number[]; // 0–1 per DNA_DIMENSIONS
  color: [number, number, number];
  label?: string;
}

export interface DnaCardParams {
  title: string;
  vectors: DnaCardVector[];
  traitLine?: string;
  similarLine?: string;
  size?: number;
}

const N = DNA_DIMENSIONS.length;
const FONT = `"${POSTER_FONT_FAMILY}", "Helvetica Neue", system-ui, sans-serif`;
const BG = '#0e0e16';
const ATTRIBUTION = '© OpenStreetMap contributors';

function angleFor(i: number): number {
  return -Math.PI / 2 + (i / N) * Math.PI * 2;
}

/** Draw the radial glyph centered at (cx, cy) with radius R. */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  vectors: DnaCardVector[],
  s: number
): void {
  const ringPolygon = (radius: number) => {
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = angleFor(i);
      const x = cx + radius * Math.cos(a);
      const y = cy + radius * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // Grid rings
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = Math.max(1, s);
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    ringPolygon(R * ring);
    ctx.stroke();
  }

  // Spokes + labels
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.font = `500 ${Math.round(22 * s)}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < N; i++) {
    const a = angleFor(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.stroke();

    const lx = cx + (R + 26 * s) * Math.cos(a);
    const ly = cy + (R + 26 * s) * Math.sin(a);
    const cos = Math.cos(a);
    ctx.textAlign = Math.abs(cos) < 0.3 ? 'center' : cos > 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(DNA_DIMENSIONS[i].short, lx, ly);
  }

  // Vector polygons
  for (const v of vectors) {
    const [r, g, b] = v.color;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const rad = R * Math.max(0, Math.min(1, v.values[i] ?? 0));
      const a = angleFor(i);
      const x = cx + rad * Math.cos(a);
      const y = cy + rad * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},${vectors.length > 1 ? 0.16 : 0.22})`;
    ctx.fill();
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = Math.max(1, 2.5 * s);
    ctx.lineJoin = 'round';
    ctx.stroke();

    for (let i = 0; i < N; i++) {
      const rad = R * Math.max(0, Math.min(1, v.values[i] ?? 0));
      const a = angleFor(i);
      ctx.beginPath();
      ctx.arc(cx + rad * Math.cos(a), cy + rad * Math.sin(a), 3 * s, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fill();
    }
  }
}

/** Compose the DNA share card and return the canvas. */
export function composeDnaCard(params: DnaCardParams): HTMLCanvasElement {
  const { title, vectors, traitLine, similarLine } = params;
  const size = params.size ?? 1080;
  const s = size / 1080;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  const margin = Math.round(72 * s);

  // Header
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.round(24 * s)}px ${FONT}`;
  ctx.fillText('CITY DNA', margin, margin + Math.round(24 * s));

  ctx.fillStyle = 'white';
  ctx.font = `700 ${Math.round(56 * s)}px ${FONT}`;
  ctx.fillText(title, margin, margin + Math.round(78 * s));

  // Glyph (centered)
  const cx = size / 2;
  const cy = size / 2 + Math.round(10 * s);
  const R = Math.round(300 * s);
  drawGlyph(ctx, cx, cy, R, vectors, s);

  // Footer text block (traits / similarity / legend)
  let fy = size - margin - Math.round(96 * s);
  ctx.textAlign = 'left';

  if (vectors.length > 1) {
    // Legend for multi-area cards
    ctx.font = `600 ${Math.round(26 * s)}px ${FONT}`;
    let lx = margin;
    for (const v of vectors) {
      const [r, g, b] = v.color;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(lx + 8 * s, fy - 8 * s, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const label = v.label ?? '';
      ctx.fillText(label, lx + 24 * s, fy);
      lx += 24 * s + ctx.measureText(label).width + 36 * s;
    }
  } else {
    if (traitLine) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `500 ${Math.round(30 * s)}px ${FONT}`;
      ctx.fillText(traitLine, margin, fy);
      fy += Math.round(44 * s);
    }
    if (similarLine) {
      ctx.fillStyle = 'rgba(120,180,255,0.9)';
      ctx.font = `500 ${Math.round(26 * s)}px ${FONT}`;
      ctx.fillText(similarLine, margin, fy);
    }
  }

  // Attribution footer
  const fSize = Math.round(22 * s);
  const baseY = size - Math.round(34 * s);
  ctx.font = `600 ${fSize}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'left';
  ctx.fillText('AxonCity', margin, baseY);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `500 ${fSize}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(ATTRIBUTION, size - margin, baseY);

  return canvas;
}

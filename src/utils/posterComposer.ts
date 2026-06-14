/**
 * Poster Composer (novelty track N1).
 *
 * Takes a captured exploded-view canvas (already restyled by a PosterTheme)
 * and typesets it into a frameable poster on a 2D canvas: themed background,
 * the view fitted into a generous frame, a large title, a subtitle line, a
 * strip of 3 metrics, and a baked-in attribution footer.
 *
 * The composer never re-renders deck.gl; it composites the on-screen capture.
 * Source line art / translucent fills upscale cleanly, so we draw the capture
 * with high-quality smoothing into a print-friendly target.
 */

import type { PosterTheme } from '../data/posterThemes';

/** GPU/Canvas 2D safe maximum on most mobile devices. */
const MAX_DIMENSION = 4096;

export interface PosterAspect {
  id: string;
  name: string;
  /** Short hint shown under the name in the picker. */
  hint: string;
  width: number;
  height: number;
}

/**
 * Launch aspects. Sizes are the composed poster resolution (already within
 * the 4096 cap). Portrait follows the A-series 1:√2 ratio for print.
 */
export const posterAspects: PosterAspect[] = [
  { id: 'portrait', name: 'Portrait', hint: 'A-series · print', width: 1414, height: 2000 },
  { id: 'square', name: 'Square', hint: '1:1 · social', width: 1600, height: 1600 },
  { id: 'phone', name: 'Phone', hint: '9:16 · wallpaper', width: 1080, height: 1920 },
];

export function getPosterAspect(id: string): PosterAspect {
  return posterAspects.find((a) => a.id === id) ?? posterAspects[0];
}

export interface PosterMetric {
  /** Pre-formatted display value, e.g. "1,240" or "8.5". */
  value: string;
  /** Short label, e.g. "POIs" or "per km²". */
  label: string;
}

export interface ComposePosterParams {
  /** Captured exploded-view canvas (themed). May be larger than the target. */
  sourceCanvas: HTMLCanvasElement;
  theme: PosterTheme;
  aspect: PosterAspect;
  /** Headline — usually the location name. */
  title: string;
  /** Secondary line — coordinates + date. */
  subtitle: string;
  /** Up to 3 metrics shown in the strip. */
  metrics: PosterMetric[];
}

/**
 * Font stack for posters. NOTE (N1 follow-up): bundle an OFL display font
 * (Archivo / Space Grotesk) so posters look byte-identical across machines.
 * Until then a strong geometric-leaning system stack keeps them respectable.
 */
const TITLE_FONT =
  '"Avenir Next", "Helvetica Neue", "Segoe UI", system-ui, -apple-system, sans-serif';
const BODY_FONT = '"Helvetica Neue", "Segoe UI", system-ui, -apple-system, sans-serif';

const ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Compose the poster and return the 2D canvas. Synchronous — assumes fonts
 * are ready (the dialog loads them before calling). Callers convert to a Blob
 * (download) or data URL (preview).
 */
export function composePoster(params: ComposePosterParams): HTMLCanvasElement {
  const { sourceCanvas, theme, aspect, title, subtitle, metrics } = params;

  const width = Math.min(aspect.width, MAX_DIMENSION);
  const height = Math.min(aspect.height, MAX_DIMENSION);
  const type = theme.typography;
  // Layout scale relative to a 1600px reference so type sizing tracks aspect.
  const s = Math.min(width, height) / 1600;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'alphabetic';

  // Background
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const margin = Math.round(96 * s);
  const contentX = margin;
  const contentW = width - margin * 2;

  // --- Footer (attribution) reserved at the very bottom -------------------
  const footerH = Math.round(56 * s);
  drawFooter(ctx, width, height, footerH, type, s);

  // --- Metric strip sits above the footer ---------------------------------
  const stripMetrics = metrics.slice(0, 3);
  const stripH = stripMetrics.length > 0 ? Math.round(150 * s) : 0;
  const stripTop = height - footerH - stripH;
  if (stripMetrics.length > 0) {
    drawMetricStrip(ctx, contentX, stripTop, contentW, stripMetrics, type, s);
  }

  // --- Title block sits below the top margin ------------------------------
  const titleTop = margin;
  const titleSize = Math.round(108 * s);
  const subtitleSize = Math.round(34 * s);
  ctx.textAlign = 'left';

  ctx.font = `700 ${titleSize}px ${TITLE_FONT}`;
  ctx.fillStyle = type.title;
  const titleLines = wrapText(ctx, title || 'Untitled', contentW, 2);
  let ty = titleTop + titleSize;
  const titleLineGap = Math.round(titleSize * 1.04);
  for (const line of titleLines) {
    ctx.fillText(line, contentX, ty);
    ty += titleLineGap;
  }

  // Accent rule under the title
  const ruleY = ty - titleLineGap + Math.round(28 * s);
  ctx.strokeStyle = type.accent;
  ctx.lineWidth = Math.max(1, Math.round(3 * s));
  ctx.beginPath();
  ctx.moveTo(contentX, ruleY);
  ctx.lineTo(contentX + Math.round(120 * s), ruleY);
  ctx.stroke();

  // Subtitle
  let subtitleBottom = ruleY;
  if (subtitle) {
    ctx.font = `500 ${subtitleSize}px ${BODY_FONT}`;
    ctx.fillStyle = type.subtitle;
    const subY = ruleY + Math.round(28 * s) + subtitleSize;
    ctx.fillText(subtitle, contentX, subY);
    subtitleBottom = subY;
  }

  // --- View region: between the title block and the metric strip ----------
  const viewTop = subtitleBottom + Math.round(56 * s);
  const viewBottom = stripTop - Math.round(40 * s);
  const viewRegion = {
    x: contentX,
    y: viewTop,
    w: contentW,
    h: Math.max(0, viewBottom - viewTop),
  };
  drawViewContained(ctx, sourceCanvas, viewRegion);

  return canvas;
}

/** Draw the captured view into a region, preserving aspect (contain, centered). */
function drawViewContained(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  region: { x: number; y: number; w: number; h: number }
): void {
  if (source.width === 0 || source.height === 0 || region.w <= 0 || region.h <= 0) {
    return;
  }
  const srcAspect = source.width / source.height;
  const regionAspect = region.w / region.h;

  let drawW = region.w;
  let drawH = region.h;
  if (srcAspect > regionAspect) {
    // Source wider than region — fit to width
    drawH = region.w / srcAspect;
  } else {
    drawW = region.h * srcAspect;
  }
  const dx = region.x + (region.w - drawW) / 2;
  const dy = region.y + (region.h - drawH) / 2;
  ctx.drawImage(source, 0, 0, source.width, source.height, dx, dy, drawW, drawH);
}

/** Draw the 3-up metric strip. */
function drawMetricStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  metrics: PosterMetric[],
  type: PosterTheme['typography'],
  s: number
): void {
  const n = metrics.length;
  const colW = width / n;
  const valueSize = Math.round(64 * s);
  const labelSize = Math.round(26 * s);

  // Top hairline above the strip
  ctx.strokeStyle = type.accent;
  ctx.lineWidth = Math.max(1, Math.round(2 * s));
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.stroke();

  ctx.textAlign = 'left';
  for (let i = 0; i < n; i++) {
    const cx = x + colW * i;
    const m = metrics[i];

    ctx.font = `700 ${valueSize}px ${TITLE_FONT}`;
    ctx.fillStyle = type.metricValue;
    ctx.fillText(m.value, cx, y + Math.round(40 * s) + valueSize);

    ctx.font = `500 ${labelSize}px ${BODY_FONT}`;
    ctx.fillStyle = type.metricLabel;
    ctx.fillText(m.label.toUpperCase(), cx, y + Math.round(40 * s) + valueSize + Math.round(34 * s));
  }
}

/** Draw the attribution footer (AxonCity · © OpenStreetMap contributors). */
function drawFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  footerH: number,
  type: PosterTheme['typography'],
  s: number
): void {
  const margin = Math.round(96 * s);
  const fontSize = Math.round(24 * s);
  const baselineY = height - Math.round(footerH / 2) + Math.round(fontSize / 3);

  ctx.font = `600 ${fontSize}px ${BODY_FONT}`;
  ctx.fillStyle = type.subtitle;
  ctx.textAlign = 'left';
  ctx.fillText('AxonCity', margin, baselineY);

  ctx.font = `500 ${fontSize}px ${BODY_FONT}`;
  ctx.fillStyle = type.metricLabel;
  ctx.textAlign = 'right';
  ctx.fillText(ATTRIBUTION, width - margin, baselineY);
}

/**
 * Wrap text to fit a max width, capping at `maxLines`. When words remain
 * after the last allowed line, that line is truncated with an ellipsis.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;

    if (current && ctx.measureText(candidate).width > maxWidth) {
      // Word doesn't fit — commit the current line.
      lines.push(current);
      current = word;
      if (lines.length === maxLines) {
        // No room left: fold every remaining word into the last line so the
        // ellipsis step below can truncate it.
        current = words.slice(i).join(' ');
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (lines.length < maxLines) {
    lines.push(current);
  } else {
    // Overflowed: replace the last committed line with the leftover text.
    lines[maxLines - 1] = current;
  }

  // Ellipsize whichever line is too wide (only the last can be).
  const last = lines.length - 1;
  if (ctx.measureText(lines[last]).width > maxWidth) {
    let truncated = lines[last];
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    lines[last] = `${truncated.trimEnd()}…`;
  }

  return lines;
}

/** Convert a composed canvas to a PNG blob. */
export function posterToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Build a filesystem-safe poster filename. */
export function posterFilename(title: string, themeId: string): string {
  const slug = (title || 'poster')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'poster';
  return `axoncity-poster-${slug}-${themeId}.png`;
}

/** Trigger a download of the poster blob. */
export function downloadPoster(blob: Blob, filename: string): void {
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

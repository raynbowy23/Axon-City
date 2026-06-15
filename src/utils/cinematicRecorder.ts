/**
 * Cinematic recorder (novelty track N5 — Cinematic Flythrough).
 *
 * Records a live <canvas> (the exploded-view deck.gl canvas) to a WebM clip
 * using the native MediaRecorder + canvas.captureStream — no ffmpeg.wasm, no
 * gif.js, no extra dependency. The caller drives the animation (layers rising,
 * slow orbit) while this records for the given duration.
 */

/** Is in-browser canvas recording supported here? */
export function canRecordCanvas(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** Best available WebM codec (vp9 → vp8 → generic), or null if none. */
function pickMimeType(): string | null {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

/**
 * Record `canvas` for `durationMs` and resolve a WebM Blob (or null if
 * recording isn't supported / produced nothing).
 */
export function recordCanvasToWebM(
  canvas: HTMLCanvasElement,
  durationMs: number,
  fps = 30
): Promise<Blob | null> {
  if (!canRecordCanvas()) return Promise.resolve(null);

  const mimeType = pickMimeType();
  const stream = canvas.captureStream(fps);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : undefined);
  } catch {
    return Promise.resolve(null);
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(chunks.length ? new Blob(chunks, { type: mimeType ?? 'video/webm' }) : null);
    };
    recorder.onerror = () => resolve(null);
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
}

const OVERLAY_FONT = '"Space Grotesk", "Helvetica Neue", system-ui, sans-serif';

/**
 * Draw the lower-third overlay (title + metric strip + attribution) onto a 2D
 * canvas, over an already-drawn frame. Called per recorded frame so the text is
 * baked into the clip. Sizes scale off canvas width (reference 1280px).
 */
export function drawCinematicOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: { title: string; metrics: Array<{ value: string; label: string }> }
): void {
  const s = width / 1280;

  // Bottom gradient for legibility.
  const grad = ctx.createLinearGradient(0, height - 230 * s, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, height - 230 * s, width, 230 * s);

  const pad = Math.round(48 * s);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Metric strip (above the title).
  if (opts.metrics.length > 0) {
    let mx = pad;
    const my = height - Math.round(112 * s);
    for (const m of opts.metrics.slice(0, 3)) {
      ctx.font = `700 ${Math.round(26 * s)}px ${OVERLAY_FONT}`;
      ctx.fillStyle = 'rgb(130,205,255)';
      ctx.fillText(m.value, mx, my);
      const vw = ctx.measureText(m.value).width;
      ctx.font = `500 ${Math.round(20 * s)}px ${OVERLAY_FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(` ${m.label}`, mx + vw + 4 * s, my);
      mx += vw + 4 * s + ctx.measureText(` ${m.label}`).width + 32 * s;
    }
  }

  // Title.
  if (opts.title) {
    ctx.font = `700 ${Math.round(48 * s)}px ${OVERLAY_FONT}`;
    ctx.fillStyle = 'white';
    ctx.fillText(opts.title, pad, height - Math.round(60 * s));
  }

  // Attribution.
  ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(18 * s)}px ${OVERLAY_FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('AxonCity · © OpenStreetMap contributors', width - pad, height - Math.round(26 * s));
}

/** Big year + "as mapped" + attribution overlay for the Time Machine recording. */
export function drawTimeMachineOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: { year: number }
): void {
  const s = width / 1280;
  const pad = Math.round(44 * s);

  // Big year (top-left, with shadow for legibility over any basemap).
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const yearStr = String(opts.year);
  ctx.font = `700 ${Math.round(66 * s)}px ${OVERLAY_FONT}`;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(yearStr, pad + 2 * s, pad + 2 * s);
  ctx.fillStyle = 'white';
  ctx.fillText(yearStr, pad, pad);

  ctx.font = `500 ${Math.round(20 * s)}px ${OVERLAY_FONT}`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText('as mapped in OpenStreetMap', pad + 1.5 * s, pad + 78 * s + 1.5 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('as mapped in OpenStreetMap', pad, pad + 78 * s);

  // Attribution (bottom-right).
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `500 ${Math.round(18 * s)}px ${OVERLAY_FONT}`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText('AxonCity · © OpenStreetMap contributors', width - pad + 1, height - Math.round(26 * s) + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('AxonCity · © OpenStreetMap contributors', width - pad, height - Math.round(26 * s));
}

/** Trigger a download of a recorded clip. */
export function downloadClip(blob: Blob, filename: string): void {
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

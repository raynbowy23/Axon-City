/**
 * Canvas recorder — records the Time Machine year-growth playback to a WebM
 * clip using the native MediaRecorder + canvas.captureStream — no ffmpeg.wasm,
 * no gif.js, no extra dependency. The caller drives the animation (scrubbing
 * the year while the deck layers grow) and composites each frame; this records
 * the composite for the given duration.
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

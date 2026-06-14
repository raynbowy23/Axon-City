/**
 * Poster fonts (novelty track N1).
 *
 * Posters typeset on a 2D canvas need the display font actually loaded into
 * `document.fonts` before `composePoster` draws, otherwise the canvas falls
 * back to a system face. We bundle Space Grotesk (OFL) via @fontsource so
 * posters look identical everywhere — no runtime CDN dependency — and load it
 * lazily the first time the poster dialog opens.
 */

// Vite resolves these imports to hashed asset URLs at build time.
import sg400 from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2';
import sg500 from '@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2';
import sg700 from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2';

/** Family name the composer references. Keep in sync with posterComposer. */
export const POSTER_FONT_FAMILY = 'Space Grotesk';

let loadPromise: Promise<boolean> | null = null;

/**
 * Load the bundled poster fonts into `document.fonts`. Idempotent — repeated
 * calls return the same promise. Resolves to `true` once the faces are ready,
 * or `false` if loading failed (composer then falls back to system fonts).
 */
export function loadPosterFonts(): Promise<boolean> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return false;
    try {
      const faces = [
        new FontFace(POSTER_FONT_FAMILY, `url(${sg400})`, { weight: '400' }),
        new FontFace(POSTER_FONT_FAMILY, `url(${sg500})`, { weight: '500' }),
        new FontFace(POSTER_FONT_FAMILY, `url(${sg700})`, { weight: '700' }),
      ];
      const loaded = await Promise.all(faces.map((f) => f.load()));
      for (const face of loaded) document.fonts.add(face);
      return true;
    } catch (err) {
      console.warn('Poster fonts failed to load; using system fallback.', err);
      return false;
    }
  })();

  return loadPromise;
}

/**
 * Poster Dialog (novelty track N1).
 *
 * Theme + aspect picker with a live preview that turns the exploded view into
 * a frameable poster. Selecting a theme drives the live deck.gl view (via the
 * store), then we capture that on-screen canvas and compose the poster — so
 * the preview always reflects exactly what will be exported.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { posterThemes, getPosterTheme } from '../data/posterThemes';
import {
  posterAspects,
  getPosterAspect,
  composePoster,
  posterToBlob,
  posterFilename,
  downloadPoster,
  type PosterMetric,
} from '../utils/posterComposer';
import { trackEvent } from '../utils/analytics';

interface PosterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Grabs the current exploded-view canvas (themed). Returns null if not ready. */
  captureSourceCanvas: () => HTMLCanvasElement | null;
  /** Default headline (location name). */
  defaultTitle: string;
  /** Secondary line — coordinates + date. */
  subtitle: string;
  /** Up to 3 metrics for the strip. */
  metrics: PosterMetric[];
}

// Let the live deck.gl view re-render with the new theme before we capture it.
const CAPTURE_DELAY_MS = 200;

export function PosterDialog({
  isOpen,
  onClose,
  captureSourceCanvas,
  defaultTitle,
  subtitle,
  metrics,
}: PosterDialogProps) {
  const posterThemeId = useStore((s) => s.posterThemeId);
  const setPosterThemeId = useStore((s) => s.setPosterThemeId);

  const [aspectId, setAspectId] = useState('portrait');
  const [title, setTitle] = useState(defaultTitle);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Remember the theme that was active before the dialog opened, so closing
  // without exporting can restore the user's analysis view if they prefer.
  const previousThemeRef = useRef<string | null>(null);

  // Sync the editable title when the source location name changes.
  useEffect(() => {
    if (isOpen) setTitle(defaultTitle);
  }, [isOpen, defaultTitle]);

  // On open: default to a theme so the preview is never unthemed.
  useEffect(() => {
    if (!isOpen) return;
    previousThemeRef.current = useStore.getState().posterThemeId;
    if (!useStore.getState().posterThemeId) {
      setPosterThemeId(posterThemes[0].id);
    }
  }, [isOpen, setPosterThemeId]);

  // Recompose the preview whenever the theme, aspect, or title changes.
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recompose = useCallback(() => {
    const theme = getPosterTheme(useStore.getState().posterThemeId);
    if (!theme) return;
    setIsRendering(true);
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => {
      const source = captureSourceCanvas();
      if (!source) {
        setCaptureFailed(true);
        setIsRendering(false);
        return;
      }
      setCaptureFailed(false);
      const canvas = composePoster({
        sourceCanvas: source,
        theme,
        aspect: getPosterAspect(aspectId),
        title,
        subtitle,
        metrics,
      });
      setPreviewUrl(canvas.toDataURL('image/png'));
      setIsRendering(false);
    }, CAPTURE_DELAY_MS);
  }, [aspectId, title, subtitle, metrics, captureSourceCanvas]);

  useEffect(() => {
    if (!isOpen) return;
    recompose();
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
    // posterThemeId is read inside recompose via the store; include it so a
    // theme change re-triggers the capture.
  }, [isOpen, posterThemeId, recompose]);

  const handleDownload = useCallback(async () => {
    const theme = getPosterTheme(useStore.getState().posterThemeId);
    if (!theme) return;
    setIsExporting(true);
    try {
      const source = captureSourceCanvas();
      if (!source) {
        setCaptureFailed(true);
        return;
      }
      const canvas = composePoster({
        sourceCanvas: source,
        theme,
        aspect: getPosterAspect(aspectId),
        title,
        subtitle,
        metrics,
      });
      const blob = await posterToBlob(canvas);
      if (blob) {
        downloadPoster(blob, posterFilename(title, theme.id));
        trackEvent('export', { format: 'poster', theme: theme.id, aspect: aspectId });
      }
    } catch (err) {
      console.error('Poster export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [aspectId, title, subtitle, metrics, captureSourceCanvas]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '12px',
          padding: '24px',
          width: '760px',
          maxWidth: '94vw',
          maxHeight: '92vh',
          overflowY: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'white' }}>
            🖼️ Create Poster
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body: preview + controls */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {/* Preview */}
          <div
            style={{
              flex: '1 1 280px',
              minWidth: '260px',
              minHeight: '360px',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              position: 'relative',
            }}
          >
            {previewUrl && !captureFailed ? (
              <img
                src={previewUrl}
                alt="Poster preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  borderRadius: '4px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  opacity: isRendering ? 0.6 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              />
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', textAlign: 'center' }}>
                {captureFailed
                  ? 'Could not capture the 3D view. Make sure it has finished loading, then try again.'
                  : 'Rendering preview…'}
              </div>
            )}
            {isRendering && previewUrl && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            )}
          </div>

          {/* Controls */}
          <div style={{ flex: '1 1 280px', minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Neighborhood name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Theme */}
            <div>
              <label style={labelStyle}>Theme</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {posterThemes.map((theme) => {
                  const active = posterThemeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => setPosterThemeId(theme.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        backgroundColor: active ? 'rgba(74,144,217,0.18)' : 'rgba(255,255,255,0.05)',
                        border: active ? '1px solid rgba(74,144,217,0.6)' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '4px',
                          flexShrink: 0,
                          backgroundColor: theme.background,
                          border: `1px solid rgb(${theme.frame.join(',')})`,
                        }}
                      />
                      <span>
                        <div style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>{theme.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', lineHeight: 1.3 }}>
                          {theme.description}
                        </div>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Aspect */}
            <div>
              <label style={labelStyle}>Aspect</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {posterAspects.map((aspect) => {
                  const active = aspectId === aspect.id;
                  return (
                    <button
                      key={aspect.id}
                      onClick={() => setAspectId(aspect.id)}
                      style={{
                        padding: '10px 6px',
                        backgroundColor: active ? 'rgba(74,144,217,0.18)' : 'rgba(255,255,255,0.05)',
                        border: active ? '1px solid rgba(74,144,217,0.6)' : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {aspect.name}
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px', fontWeight: 400, marginTop: '2px' }}>
                        {aspect.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={isExporting || captureFailed}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: isExporting || captureFailed ? 'rgba(74,144,217,0.3)' : 'rgba(74,144,217,0.85)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: isExporting || captureFailed ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {isExporting ? (
            <>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Exporting…
            </>
          ) : (
            'Download Poster (PNG)'
          )}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'rgba(255,255,255,0.7)',
  marginBottom: '8px',
};

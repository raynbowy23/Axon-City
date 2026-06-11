import { useEffect } from 'react';
import { useStore } from '../store/useStore';

const AUTO_DISMISS_MS = 8000;

// Transient warning toast shown when an OSM server responds with a rate
// limit (429); the fetcher keeps retrying on backup servers, so this is
// informational only
export function RateLimitWarning() {
  const { rateLimitWarning, setRateLimitWarning } = useStore();

  useEffect(() => {
    if (!rateLimitWarning) return;
    const timer = setTimeout(() => setRateLimitWarning(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [rateLimitWarning, setRateLimitWarning]);

  if (!rateLimitWarning) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '64px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: 'calc(100% - 32px)',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        border: '1px solid rgba(255, 180, 0, 0.5)',
        borderRadius: '8px',
        padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.9)',
      }}
    >
      {/* Warning icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="#FFB400"
        style={{ flexShrink: 0 }}
      >
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
      </svg>
      <span>
        OpenStreetMap server is busy — retrying on a backup server. Loading may
        be slower than usual.
      </span>
      <button
        onClick={() => setRateLimitWarning(false)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { ShareButton } from './ShareButton';
import type { MapStyleType } from '../types';

interface MapControlsMenuProps {
  onMetricsClick: () => void;
  shareDisabled?: boolean;
  metricsActive?: boolean;
}

const mapStyleOptions: { id: MapStyleType; name: string }[] = [
  { id: 'dark', name: 'Dark' },
  { id: 'light', name: 'Light' },
  { id: 'satellite', name: 'Satellite' },
];

export function MapControlsMenu({
  onMetricsClick,
  shareDisabled = false,
  metricsActive = false,
}: MapControlsMenuProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { mapStyle, setMapStyle, mapLanguage, setMapLanguage } = useStore();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside as unknown as EventListener);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as unknown as EventListener);
    };
  }, [isExpanded]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          backgroundColor: isExpanded ? 'rgba(74, 144, 217, 0.3)' : 'rgba(0, 0, 0, 0.8)',
          border: isExpanded ? '1px solid #4A90D9' : '1px solid rgba(255, 255, 255, 0.2)',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
        title="Map Controls"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>

      {/* Expanded Menu */}
      {isExpanded && (
        <div
          style={{
            position: 'absolute',
            bottom: '48px',
            left: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            borderRadius: '12px',
            padding: '12px',
            minWidth: '180px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Map Style Section */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Map Style
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {mapStyleOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setMapStyle(option.id)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    backgroundColor: mapStyle === option.id ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: mapStyle === option.id ? '600' : '400',
                  }}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>

          {/* Language Section */}
          <div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Labels
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setMapLanguage('local')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  backgroundColor: mapLanguage === 'local' ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: mapLanguage === 'local' ? '600' : '400',
                }}
              >
                Local
              </button>
              <button
                onClick={() => setMapLanguage('en')}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  backgroundColor: mapLanguage === 'en' ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: mapLanguage === 'en' ? '600' : '400',
                }}
              >
                English
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <ShareButton disabled={shareDisabled} variant="menu" />
            <button
              onClick={() => {
                onMetricsClick();
                setIsExpanded(false);
              }}
              style={{
                padding: '8px 12px',
                backgroundColor: metricsActive ? 'rgba(74, 144, 217, 0.3)' : 'rgba(255,255,255,0.1)',
                color: metricsActive ? '#4A90D9' : 'white',
                border: metricsActive ? '1px solid #4A90D9' : 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
              Metrics
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

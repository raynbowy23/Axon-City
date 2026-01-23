import { useStore } from '../store/useStore';
import type { MapStyleType } from '../types';

interface MapStyleOption {
  id: MapStyleType;
  name: string;
  description: string;
  preview: string;
}

const mapStyleOptions: MapStyleOption[] = [
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark theme map',
    preview: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Light street map',
    preview: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    description: 'Aerial imagery',
    preview: 'linear-gradient(135deg, #2d5016 0%, #1a3a0f 50%, #0d2b3e 100%)',
  },
];

export function MapSettingsPanel() {
  const { mapStyle, setMapStyle } = useStore();

  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          fontSize: '13px',
          fontWeight: '600',
          color: 'rgba(255, 255, 255, 0.7)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Map Style
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}
      >
        {mapStyleOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setMapStyle(option.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 8px',
              backgroundColor: mapStyle === option.id
                ? 'rgba(74, 144, 217, 0.2)'
                : 'rgba(255, 255, 255, 0.05)',
              border: mapStyle === option.id
                ? '2px solid #4A90D9'
                : '2px solid transparent',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {/* Preview thumbnail */}
            <div
              style={{
                width: '100%',
                aspectRatio: '16/10',
                borderRadius: '6px',
                background: option.preview,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
              }}
            />

            {/* Label */}
            <div
              style={{
                fontSize: '13px',
                fontWeight: mapStyle === option.id ? '600' : '500',
                color: mapStyle === option.id ? '#4A90D9' : 'white',
              }}
            >
              {option.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

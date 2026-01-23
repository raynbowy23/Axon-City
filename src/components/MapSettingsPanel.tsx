import { useStore } from '../store/useStore';
import type { MapStyleType, MapLanguage } from '../types';

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

interface LanguageOption {
  id: MapLanguage;
  name: string;
  description: string;
}

const languageOptions: LanguageOption[] = [
  {
    id: 'local',
    name: 'Local',
    description: 'Local language names',
  },
  {
    id: 'en',
    name: 'English',
    description: 'English names',
  },
];

export function MapSettingsPanel() {
  const { mapStyle, setMapStyle, mapLanguage, setMapLanguage } = useStore();

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Map Style Section */}
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
          marginBottom: '20px',
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

      {/* Language Section */}
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
        Map Labels
      </div>

      <div
        style={{
          display: 'flex',
          gap: '8px',
        }}
      >
        {languageOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setMapLanguage(option.id)}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: mapLanguage === option.id
                ? 'rgba(74, 144, 217, 0.2)'
                : 'rgba(255, 255, 255, 0.05)',
              border: mapLanguage === option.id
                ? '2px solid #4A90D9'
                : '2px solid transparent',
              borderRadius: '10px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: mapLanguage === option.id ? '#4A90D9' : 'white',
              fontSize: '14px',
              fontWeight: mapLanguage === option.id ? '600' : '500',
            }}
          >
            {option.name}
          </button>
        ))}
      </div>

      {/* Credit Section */}
      <div
        style={{
          marginTop: '24px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        <span>Created by Rei Tamaru</span>
        <a
          href="https://github.com/raynbowy23/Axon-City"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          GitHub
        </a>
      </div>
    </div>
  );
}

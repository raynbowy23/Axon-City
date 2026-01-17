import { useStore } from '../store/useStore';
import { getLayerById } from '../data/layerManifest';

export function SelectionPanel() {
  const { selectedFeatures, removeSelectedFeature, clearSelectedFeatures } = useStore();

  if (selectedFeatures.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        borderRadius: '12px',
        padding: '12px',
        maxWidth: '90vw',
        maxHeight: '200px',
        overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <span style={{ color: 'white', fontWeight: 600, fontSize: '13px' }}>
          Selected Features ({selectedFeatures.length})
        </span>
        <button
          onClick={clearSelectedFeatures}
          style={{
            background: 'rgba(217, 74, 74, 0.8)',
            border: 'none',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          Clear All
        </button>
      </div>

      {/* Selected features list */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {selectedFeatures.map((sf) => {
          const layerConfig = getLayerById(sf.layerId);
          const name =
            sf.feature.properties?.name ||
            sf.feature.properties?.['addr:street'] ||
            sf.feature.properties?.highway ||
            sf.feature.properties?.building ||
            sf.feature.properties?.amenity ||
            `${layerConfig?.name || sf.layerId}`;

          // Get additional info
          const details: string[] = [];
          if (sf.feature.properties?.['addr:housenumber']) {
            details.push(`#${sf.feature.properties['addr:housenumber']}`);
          }
          if (sf.feature.properties?.levels) {
            details.push(`${sf.feature.properties.levels} floors`);
          }
          if (sf.feature.properties?.lanes) {
            details.push(`${sf.feature.properties.lanes} lanes`);
          }

          return (
            <div
              key={`${sf.layerId}-${sf.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                padding: '8px 12px',
                borderRadius: '8px',
                borderLeft: `4px solid rgba(${sf.color.slice(0, 3).join(',')}, 1)`,
              }}
            >
              {/* Color indicator */}
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: `rgba(${sf.color.slice(0, 3).join(',')}, 1)`,
                  flexShrink: 0,
                }}
              />

              {/* Info */}
              <div style={{ minWidth: '100px' }}>
                <div
                  style={{
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 500,
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </div>
                <div
                  style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '10px',
                  }}
                >
                  {layerConfig?.name || sf.layerId}
                  {details.length > 0 && ` - ${details.join(', ')}`}
                </div>
              </div>

              {/* Remove button */}
              <button
                onClick={() => removeSelectedFeature(sf.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.5)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <div
        style={{
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '10px',
          textAlign: 'center',
        }}
      >
        Click features to select/deselect. Each selection gets a unique color.
      </div>
    </div>
  );
}

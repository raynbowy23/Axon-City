import { useStore } from '../store/useStore';
import { layerManifest, getLayersByGroup } from '../data/layerManifest';
import type { LayerConfig } from '../types';

export function ControlPanel() {
  const {
    activeLayers,
    toggleLayer,
    explodedView,
    setExplodedView,
    isolatedLayerId,
    setIsolatedLayerId,
    viewState,
    setViewState,
  } = useStore();

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        maxWidth: '280px',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        fontSize: '13px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Layer Controls</h3>

      {/* Exploded View Controls */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '8px', fontWeight: '600' }}>
          3D Exploded View
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          <input
            type="checkbox"
            checked={explodedView.enabled}
            onChange={(e) => setExplodedView({ enabled: e.target.checked })}
            style={{ cursor: 'pointer' }}
          />
          Enable Exploded View
        </label>

        {explodedView.enabled && (
          <>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                Layer Spacing: {explodedView.layerSpacing}m
              </label>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={explodedView.layerSpacing}
                onChange={(e) =>
                  setExplodedView({ layerSpacing: Number(e.target.value) })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '8px' }}>
              Tip: Use higher spacing + horizontal view for best layer separation
            </div>
          </>
        )}
      </div>

      {/* View Controls */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '8px', fontWeight: '600' }}>Camera</div>

        {/* View Presets */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', opacity: 0.7 }}>
            View Presets
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
            <button
              onClick={() => setViewState({ ...viewState, pitch: 0, bearing: 0 })}
              style={{
                padding: '6px 8px',
                backgroundColor: viewState.pitch === 0 ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              Top Down
            </button>
            <button
              onClick={() => setViewState({ ...viewState, pitch: 45, bearing: 0 })}
              style={{
                padding: '6px 8px',
                backgroundColor: viewState.pitch === 45 && viewState.bearing === 0 ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              Axonometric
            </button>
            <button
              onClick={() => setViewState({ ...viewState, pitch: 75, bearing: 0 })}
              style={{
                padding: '6px 8px',
                backgroundColor: viewState.pitch >= 70 && viewState.pitch <= 80 && viewState.bearing === 0 ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              Horizontal
            </button>
            <button
              onClick={() => setViewState({ ...viewState, pitch: 85, bearing: 45 })}
              style={{
                padding: '6px 8px',
                backgroundColor: viewState.pitch >= 80 ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              Street View
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
            Pitch: {viewState.pitch.toFixed(0)}°
          </label>
          <input
            type="range"
            min="0"
            max="89"
            value={viewState.pitch}
            onChange={(e) =>
              setViewState({ ...viewState, pitch: Number(e.target.value) })
            }
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
            Bearing: {viewState.bearing.toFixed(0)}°
          </label>
          <input
            type="range"
            min="0"
            max="360"
            value={viewState.bearing}
            onChange={(e) =>
              setViewState({ ...viewState, bearing: Number(e.target.value) })
            }
            style={{ width: '100%' }}
          />
        </div>

        <button
          onClick={() =>
            setViewState({ ...viewState, pitch: 45, bearing: 0 })
          }
          style={{
            width: '100%',
            padding: '8px',
            backgroundColor: '#4A90D9',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Reset Camera
        </button>
      </div>

      {/* Layer Toggle by Group */}
      <div>
        <div style={{ marginBottom: '8px', fontWeight: '600' }}>
          Layers
        </div>

        {isolatedLayerId && (
          <button
            onClick={() => setIsolatedLayerId(null)}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '12px',
              backgroundColor: '#D94A4A',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Clear Isolation ({getLayerName(isolatedLayerId)})
          </button>
        )}

        {layerManifest.groups.map((group) => (
          <LayerGroup
            key={group.id}
            groupName={group.name}
            groupColor={group.color}
            layers={getLayersByGroup(group.id)}
            activeLayers={activeLayers}
            onToggle={toggleLayer}
            onIsolate={setIsolatedLayerId}
            isolatedLayerId={isolatedLayerId}
          />
        ))}
      </div>
    </div>
  );
}

function LayerGroup({
  groupName,
  groupColor,
  layers,
  activeLayers,
  onToggle,
  onIsolate,
  isolatedLayerId,
}: {
  groupName: string;
  groupColor: [number, number, number];
  layers: LayerConfig[];
  activeLayers: string[];
  onToggle: (id: string) => void;
  onIsolate: (id: string | null) => void;
  isolatedLayerId: string | null;
}) {
  const activeCount = layers.filter((l) => activeLayers.includes(l.id)).length;

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '6px',
          paddingBottom: '4px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '2px',
            backgroundColor: `rgb(${groupColor.join(',')})`,
          }}
        />
        <span style={{ fontWeight: '600', fontSize: '12px' }}>{groupName}</span>
        <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto' }}>
          {activeCount}/{layers.length}
        </span>
      </div>

      {layers.map((layer) => {
        const isActive = activeLayers.includes(layer.id);
        const isIsolated = isolatedLayerId === layer.id;

        return (
          <div
            key={layer.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 0 4px 20px',
              opacity: isActive ? 1 : 0.5,
            }}
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => onToggle(layer.id)}
              style={{ cursor: 'pointer' }}
            />
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: `rgba(${layer.style.fillColor.slice(0, 3).join(',')}, 1)`,
              }}
            />
            <span
              style={{
                flex: 1,
                fontSize: '11px',
                cursor: 'pointer',
              }}
              onClick={() => onToggle(layer.id)}
            >
              {layer.name}
            </span>
            {isActive && (
              <button
                onClick={() => onIsolate(isIsolated ? null : layer.id)}
                style={{
                  padding: '2px 6px',
                  fontSize: '9px',
                  backgroundColor: isIsolated ? '#D94A4A' : 'rgba(255,255,255,0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
                title={isIsolated ? 'Clear isolation' : 'Isolate layer'}
              >
                {isIsolated ? 'SOLO' : 'solo'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getLayerName(layerId: string): string {
  const layer = layerManifest.layers.find((l) => l.id === layerId);
  return layer?.name || layerId;
}

import { useStore } from '../store/useStore';
import { layerManifest } from '../data/layerManifest';
import { DraggableLayerList } from './DraggableLayerList';
import type { CustomLayerConfig, FeatureCollection } from '../types';

export function ControlPanel() {
  const {
    explodedView,
    setExplodedView,
    isolatedLayerId,
    setIsolatedLayerId,
    viewState,
    setViewState,
    layerOrder,
    resetLayerOrder,
    customLayers,
    setDataInputOpen,
    removeCustomLayer,
    toggleLayer,
    activeLayers,
    layerData,
  } = useStore();

  // Calculate bounding box from features and zoom to it
  const zoomToLayer = (layerId: string) => {
    const data = layerData.get(layerId);
    if (!data?.features?.features?.length) return;

    const bounds = calculateBounds(data.features);
    if (!bounds) return;

    // Calculate center and appropriate zoom level
    const centerLon = (bounds.minLon + bounds.maxLon) / 2;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;

    // Estimate zoom level based on extent
    const lonExtent = bounds.maxLon - bounds.minLon;
    const latExtent = bounds.maxLat - bounds.minLat;
    const maxExtent = Math.max(lonExtent, latExtent);

    // Rough zoom calculation (larger extent = lower zoom)
    let zoom = 14;
    if (maxExtent > 1) zoom = 8;
    else if (maxExtent > 0.5) zoom = 9;
    else if (maxExtent > 0.2) zoom = 10;
    else if (maxExtent > 0.1) zoom = 11;
    else if (maxExtent > 0.05) zoom = 12;
    else if (maxExtent > 0.02) zoom = 13;
    else if (maxExtent > 0.01) zoom = 14;
    else zoom = 15;

    setViewState({
      ...viewState,
      longitude: centerLon,
      latitude: centerLat,
      zoom,
    });
  };

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
                Group Spacing: {explodedView.layerSpacing}m ({Math.round(explodedView.layerSpacing * 3.28084)}ft)
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
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px' }}>
                Layer Spacing: {Math.round(explodedView.layerSpacing * explodedView.intraGroupRatio)}m ({Math.round(explodedView.layerSpacing * explodedView.intraGroupRatio * 3.28084)}ft)
              </label>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={explodedView.intraGroupRatio}
                onChange={(e) =>
                  setExplodedView({ intraGroupRatio: Number(e.target.value) })
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

      {/* Custom Layers Section */}
      {customLayers.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '8px', fontWeight: '600' }}>
            Custom Layers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {customLayers.map((layer) => (
              <CustomLayerItem
                key={layer.id}
                layer={layer}
                isActive={activeLayers.includes(layer.id)}
                isIsolated={isolatedLayerId === layer.id}
                onToggle={() => toggleLayer(layer.id)}
                onIsolate={() => setIsolatedLayerId(isolatedLayerId === layer.id ? null : layer.id)}
                onZoomTo={() => zoomToLayer(layer.id)}
                onRemove={() => removeCustomLayer(layer.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Import Data Button */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setDataInputOpen(true)}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'rgba(75, 192, 192, 0.3)',
            border: '1px solid rgba(75, 192, 192, 0.5)',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '16px' }}>+</span>
          Import Custom Data
        </button>
        <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'center' }}>
          GeoJSON or CSV with coordinates
        </div>
      </div>

      {/* Layer Toggle by Group */}
      <div>
        <div style={{ marginBottom: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Layers</span>
          {layerOrder.isCustomOrder && (
            <button
              onClick={resetLayerOrder}
              style={{
                padding: '4px 8px',
                fontSize: '10px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
              title="Reset to default layer order"
            >
              Reset Order
            </button>
          )}
        </div>

        <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '8px' }}>
          Drag &#x2630; to reorder groups or layers
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
            Clear Isolation ({getLayerName(isolatedLayerId, customLayers)})
          </button>
        )}

        <DraggableLayerList
          onIsolate={setIsolatedLayerId}
          isolatedLayerId={isolatedLayerId}
        />
      </div>
    </div>
  );
}

// Helper to calculate bounding box from a FeatureCollection
function calculateBounds(features: FeatureCollection): { minLon: number; maxLon: number; minLat: number; maxLat: number } | null {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  let hasCoords = false;

  const processCoords = (coords: number[]) => {
    if (coords.length >= 2) {
      const [lon, lat] = coords;
      if (isFinite(lon) && isFinite(lat)) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        hasCoords = true;
      }
    }
  };

  const processGeometry = (geometry: any) => {
    if (!geometry) return;
    switch (geometry.type) {
      case 'Point':
        processCoords(geometry.coordinates);
        break;
      case 'LineString':
      case 'MultiPoint':
        geometry.coordinates.forEach(processCoords);
        break;
      case 'Polygon':
      case 'MultiLineString':
        geometry.coordinates.forEach((ring: number[][]) => ring.forEach(processCoords));
        break;
      case 'MultiPolygon':
        geometry.coordinates.forEach((poly: number[][][]) =>
          poly.forEach((ring: number[][]) => ring.forEach(processCoords))
        );
        break;
    }
  };

  for (const feature of features.features) {
    processGeometry(feature.geometry);
  }

  return hasCoords ? { minLon, maxLon, minLat, maxLat } : null;
}

function getLayerName(layerId: string, customLayers: CustomLayerConfig[]): string {
  // Check manifest layers first
  const manifestLayer = layerManifest.layers.find((l) => l.id === layerId);
  if (manifestLayer) return manifestLayer.name;

  // Check custom layers
  const customLayer = customLayers.find((l) => l.id === layerId);
  if (customLayer) return customLayer.name;

  return layerId;
}

function CustomLayerItem({
  layer,
  isActive,
  isIsolated,
  onToggle,
  onIsolate,
  onZoomTo,
  onRemove,
}: {
  layer: CustomLayerConfig;
  isActive: boolean;
  isIsolated: boolean;
  onToggle: () => void;
  onIsolate: () => void;
  onZoomTo: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        backgroundColor: isIsolated ? 'rgba(74, 144, 217, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        borderRadius: '4px',
        borderLeft: `3px solid rgba(${layer.style.fillColor.slice(0, 3).join(',')}, 0.8)`,
      }}
    >
      <input
        type="checkbox"
        checked={isActive}
        onChange={onToggle}
        style={{ cursor: 'pointer' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={layer.name}
        >
          {layer.name}
        </div>
        <div style={{ fontSize: '10px', opacity: 0.5 }}>
          {layer.sourceType.toUpperCase()} · {layer.geometryType}
        </div>
      </div>
      <button
        onClick={onZoomTo}
        style={{
          background: 'none',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          color: 'rgba(255, 255, 255, 0.7)',
          cursor: 'pointer',
          padding: '2px 5px',
          fontSize: '10px',
          lineHeight: 1,
          borderRadius: '3px',
        }}
        title="Zoom to layer extent"
      >
        ⌖
      </button>
      <button
        onClick={onIsolate}
        style={{
          background: isIsolated ? '#4A90D9' : 'none',
          border: isIsolated ? 'none' : '1px solid rgba(255, 255, 255, 0.3)',
          color: isIsolated ? 'white' : 'rgba(255, 255, 255, 0.7)',
          cursor: 'pointer',
          padding: '2px 5px',
          fontSize: '10px',
          lineHeight: 1,
          borderRadius: '3px',
        }}
        title={isIsolated ? 'Show all layers' : 'Solo this layer'}
      >
        {isIsolated ? 'Solo' : 'S'}
      </button>
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 100, 100, 0.7)',
          cursor: 'pointer',
          padding: '2px 5px',
          fontSize: '14px',
          lineHeight: 1,
          borderRadius: '3px',
        }}
        title="Remove layer"
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255, 100, 100, 1)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 100, 100, 0.7)')}
      >
        ×
      </button>
    </div>
  );
}

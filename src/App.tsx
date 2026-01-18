import { useCallback, useRef, useEffect } from 'react';
import type { Polygon } from 'geojson';
import { MapView } from './components/MapView';
import { ControlPanel } from './components/ControlPanel';
import { StatsPanel } from './components/StatsPanel';
import { SearchBar } from './components/SearchBar';
import { SelectionPanel } from './components/SelectionPanel';
import { ExtractedView } from './components/ExtractedView';
import { DataInputPanel } from './components/DataInputPanel';
import { usePolygonDrawing } from './hooks/usePolygonDrawing';
import { useStore } from './store/useStore';
import { layerManifest } from './data/layerManifest';
import { fetchMultipleLayers, getBboxFromPolygon } from './utils/osmFetcher';
import {
  clipFeaturesToPolygon,
  calculateLayerStats,
  calculatePolygonArea,
} from './utils/geometryUtils';
import type { CustomLayerConfig } from './types';
import './App.css';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFetchedPolygonRef = useRef<string | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const {
    isDrawing,
    isLoading,
    setIsLoading,
    setLoadingMessage,
    setLayerData,
    clearManifestLayerData,
    activeLayers,
    selectionPolygon,
    setSelectionPolygon,
    layerData,
    draggingVertexIndex,
    customLayers,
  } = useStore();

  const {
    startDrawing,
    addPoint,
    undoLastPoint,
    completeDrawing,
    cancelDrawing,
    pointCount,
  } = usePolygonDrawing();

  // Handle fetching data when polygon is completed
  const handlePolygonComplete = useCallback(
    async (polygon: Polygon) => {
      setIsLoading(true);
      setLoadingMessage('Preparing to fetch data...');
      clearManifestLayerData(); // Only clear manifest layers, preserve custom layers

      try {
        // Get bbox from polygon
        const bbox = getBboxFromPolygon(polygon, 0.001);

        // Filter to only active layers
        const layersToFetch = layerManifest.layers.filter((layer) =>
          activeLayers.includes(layer.id)
        );

        // Fetch data from OSM
        const results = await fetchMultipleLayers(
          layersToFetch,
          bbox,
          (layerId, progress, total) => {
            setLoadingMessage(`Fetching ${layerId}... (${progress}/${total})`);
          }
        );

        // Calculate polygon area for stats
        const polygonAreaKm2 = calculatePolygonArea(polygon);

        // Process and clip each layer
        setLoadingMessage('Processing and clipping features...');

        for (const [layerId, features] of results.entries()) {
          const layer = layerManifest.layers.find((l) => l.id === layerId);
          if (!layer) continue;

          // Clip features to selection polygon
          const clippedFeatures = clipFeaturesToPolygon(
            features,
            polygon,
            layer.geometryType
          );

          // Calculate stats
          const stats = calculateLayerStats(clippedFeatures, layer, polygonAreaKm2);

          setLayerData(layerId, {
            layerId,
            features,
            clippedFeatures,
            stats,
          });
        }

        setLoadingMessage('Complete!');

        // Track that we've fetched data for this polygon
        lastFetchedPolygonRef.current = JSON.stringify(polygon.coordinates);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoadingMessage('Error fetching data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [activeLayers, clearManifestLayerData, setIsLoading, setLayerData, setLoadingMessage]
  );

  // Re-fetch data when polygon is edited (dragged)
  useEffect(() => {
    // Only re-fetch if:
    // 1. We have a selection polygon
    // 2. We're not currently drawing
    // 3. We've finished dragging (draggingVertexIndex is null)
    // 4. The polygon has changed from what we last fetched
    // 5. We have already loaded data (layerData is not empty)
    if (
      selectionPolygon &&
      !isDrawing &&
      draggingVertexIndex === null &&
      layerData.size > 0
    ) {
      const currentPolygonStr = JSON.stringify(selectionPolygon.geometry.coordinates);

      if (lastFetchedPolygonRef.current && lastFetchedPolygonRef.current !== currentPolygonStr) {
        // Polygon was edited, re-fetch data
        handlePolygonComplete(selectionPolygon.geometry as Polygon);
      }
    }
  }, [selectionPolygon, isDrawing, draggingVertexIndex, layerData.size, handlePolygonComplete]);

  // Track last processed polygon for custom layers
  const lastProcessedPolygonRef = useRef<string | null>(null);

  // Process custom layers when selection polygon changes or custom layers are added
  useEffect(() => {
    if (selectionPolygon && customLayers.length > 0 && !isDrawing && draggingVertexIndex === null) {
      const currentPolygonStr = JSON.stringify(selectionPolygon.geometry.coordinates);
      const polygonChanged = lastProcessedPolygonRef.current !== currentPolygonStr;

      // Process each custom layer that has data in layerData
      const polygonAreaKm2 = calculatePolygonArea(selectionPolygon.geometry as Polygon);

      for (const layer of customLayers) {
        const existingData = layerData.get(layer.id);
        if (!existingData) continue;

        // Skip if already processed and polygon hasn't changed
        if (!polygonChanged && existingData.clippedFeatures && existingData.stats) continue;

        // Clip features to polygon
        const clippedFeatures = clipFeaturesToPolygon(
          existingData.features,
          selectionPolygon.geometry as Polygon,
          layer.geometryType
        );

        // Calculate stats
        const stats = calculateLayerStats(
          clippedFeatures,
          layer as CustomLayerConfig & { osmQuery: string },
          polygonAreaKm2
        );

        setLayerData(layer.id, {
          layerId: layer.id,
          features: existingData.features,
          clippedFeatures,
          stats,
        });
      }

      lastProcessedPolygonRef.current = currentPolygonStr;
    }
  }, [selectionPolygon, customLayers, layerData, isDrawing, draggingVertexIndex, setLayerData]);

  // Track mouse down position to distinguish clicks from drags
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawing) return;
      if (e.button !== 0) return; // Only track left-click
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    },
    [isDrawing]
  );

  // Handle map clicks for drawing (left-click only, distinguish from drag)
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawing) return;

      // Only add points on left-click (button 0)
      if (e.button !== 0) return;

      // Check if this was a drag (mouse moved more than 5 pixels)
      if (mouseDownPosRef.current) {
        const dx = e.clientX - mouseDownPosRef.current.x;
        const dy = e.clientY - mouseDownPosRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If mouse moved more than 5 pixels, it was a drag, not a click
        if (distance > 5) {
          mouseDownPosRef.current = null;
          return;
        }
      }
      mouseDownPosRef.current = null;

      // Don't capture clicks on UI elements
      if ((e.target as HTMLElement).closest('button, input, .control-panel, .stats-panel')) {
        return;
      }

      addPoint(e.clientX, e.clientY, containerRef.current);
    },
    [isDrawing, addPoint]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawing) {
        cancelDrawing();
      }
      if (e.key === 'Enter' && isDrawing && pointCount >= 3) {
        const polygon = completeDrawing();
        if (polygon) {
          handlePolygonComplete(polygon);
        }
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && isDrawing) {
        undoLastPoint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing, pointCount, cancelDrawing, completeDrawing, undoLastPoint, handlePolygonComplete]);

  const handleStartDrawing = () => {
    clearManifestLayerData(); // Preserve custom layers
    setSelectionPolygon(null);
    startDrawing();
  };

  const handleCompleteDrawing = () => {
    const polygon = completeDrawing();
    if (polygon) {
      handlePolygonComplete(polygon);
    }
  };

  const handleClearSelection = () => {
    setSelectionPolygon(null);
    clearManifestLayerData(); // Preserve custom layers
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        cursor: isDrawing ? 'crosshair' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleContainerClick}
    >
      <MapView />

      {/* Drawing Controls */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {!isDrawing ? (
          <>
            <button
              onClick={handleStartDrawing}
              disabled={isLoading}
              style={{
                padding: '12px 24px',
                backgroundColor: isLoading ? '#666' : '#4A90D9',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? 'Processing...' : 'Draw Selection Area'}
            </button>

            {selectionPolygon && (
              <>
                <button
                  onClick={handleClearSelection}
                  disabled={isLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isLoading ? '#666' : '#D94A4A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  Clear Selection
                </button>
                {!isLoading && (
                  <div
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      color: 'rgba(255, 255, 255, 0.7)',
                      lineHeight: '1.4',
                    }}
                  >
                    <div style={{ marginBottom: '4px', fontWeight: '500', color: 'rgba(255, 200, 50, 0.9)' }}>
                      Edit Selection:
                    </div>
                    <div>Drag corners to move</div>
                    <div>Click <span style={{ color: '#64C8FF' }}>blue dots</span> to add point</div>
                    <div>Double-click corner to remove</div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              padding: '16px',
              borderRadius: '8px',
              color: 'white',
              minWidth: '220px',
            }}
          >
            <div style={{ marginBottom: '12px', fontWeight: '600' }}>
              Drawing Mode
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
              Click on the map to add points
              <br />
              Points added: <strong>{pointCount}</strong>
              <br />
              <br />
              <kbd style={kbdStyle}>Enter</kbd> Complete
              <br />
              <kbd style={kbdStyle}>Escape</kbd> Cancel
              <br />
              <kbd style={kbdStyle}>Ctrl+Z</kbd> Undo
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={undoLastPoint}
                disabled={pointCount === 0}
                style={{
                  padding: '8px 12px',
                  backgroundColor: pointCount === 0 ? '#444' : '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pointCount === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                Undo
              </button>
              <button
                onClick={handleCompleteDrawing}
                disabled={pointCount < 3}
                style={{
                  padding: '8px 12px',
                  backgroundColor: pointCount < 3 ? '#444' : '#4A90D9',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: pointCount < 3 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                }}
              >
                Complete ({pointCount}/3+)
              </button>
              <button
                onClick={cancelDrawing}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#D94A4A',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Title and Search */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: '20px',
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '1px',
          }}
        >
          AxonCity - Exploded Axonometric Map
        </div>
        <SearchBar />
      </div>

      <ControlPanel />
      <StatsPanel />
      <SelectionPanel />
      <ExtractedView />
      <DataInputPanel />

      {/* Loading animation keyframes */}
      <style>
        {`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(200%); }
            100% { transform: translateX(-100%); }
          }
        `}
      </style>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.1)',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '11px',
  fontFamily: 'monospace',
};

export default App;

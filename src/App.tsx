import { useCallback, useRef, useEffect, useState } from 'react';
import type { Polygon } from 'geojson';
import { MapView } from './components/MapView';
import { ControlPanel } from './components/ControlPanel';
import { StatsPanel } from './components/StatsPanel';
import { SearchBar } from './components/SearchBar';
import { SelectionPanel } from './components/SelectionPanel';
import { ExtractedView } from './components/ExtractedView';
import { DataInputPanel } from './components/DataInputPanel';
import { BottomSheet, type BottomSheetState } from './components/BottomSheet';
import { MobileNav, type MobileTab } from './components/MobileNav';
import { MapStyleSwitcher } from './components/MapStyleSwitcher';
import { MapSettingsPanel } from './components/MapSettingsPanel';
import { usePolygonDrawing } from './hooks/usePolygonDrawing';
import { useIsMobile } from './hooks/useMediaQuery';
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
    setSelectionLocationName,
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
    handlePointerStart,
    isDrag,
    clearPointerStart,
  } = usePolygonDrawing();

  // Mobile UI state
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('map');
  const [bottomSheetState, setBottomSheetState] = useState<BottomSheetState>('collapsed');
  const { isExtractedViewOpen, setExtractedViewOpen } = useStore();

  // Handle mobile tab changes
  const handleMobileTabChange = useCallback((tab: MobileTab) => {
    setMobileTab(tab);

    if (tab === 'map') {
      setBottomSheetState('peek');
    } else if (tab === 'layers' || tab === 'stats') {
      setBottomSheetState('peek');
    } else if (tab === '3d') {
      setExtractedViewOpen(true);
    }
  }, [setExtractedViewOpen]);

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

  // Track pointer down position to distinguish clicks/taps from drags
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return; // Only track left-click for mouse

      const isTouch = e.pointerType === 'touch';
      handlePointerStart(e.clientX, e.clientY, isTouch);
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    },
    [isDrawing, handlePointerStart]
  );

  // Handle pointer up for drawing (works for both mouse and touch)
  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDrawing) {
        clearPointerStart();
        return;
      }

      // Only add points on left-click (button 0) for mouse
      if (e.button !== 0 && e.pointerType === 'mouse') {
        clearPointerStart();
        return;
      }

      // Check if this was a drag
      if (isDrag(e.clientX, e.clientY)) {
        clearPointerStart();
        mouseDownPosRef.current = null;
        return;
      }
      clearPointerStart();
      mouseDownPosRef.current = null;

      // Don't capture clicks on UI elements
      if ((e.target as HTMLElement).closest('button, input, .control-panel, .stats-panel, .mobile-nav, .bottom-sheet')) {
        return;
      }

      addPoint(e.clientX, e.clientY, containerRef.current);
    },
    [isDrawing, addPoint, isDrag, clearPointerStart]
  );

  // Handle touch start specifically for touch devices
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isDrawing) return;

      // Prevent default to avoid scroll during drawing
      if (isDrawing) {
        e.preventDefault();
      }
    },
    [isDrawing]
  );

  // Legacy mouse handler for backwards compatibility
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawing) return;
      if (e.button !== 0) return;
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    },
    [isDrawing]
  );

  // Legacy click handler for backwards compatibility
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
      if ((e.target as HTMLElement).closest('button, input, .control-panel, .stats-panel, .mobile-nav, .bottom-sheet')) {
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
    setSelectionLocationName(null);
    clearManifestLayerData(); // Preserve custom layers
  };

  return (
    <div
      ref={containerRef}
      className={isDrawing ? 'drawing-area' : ''}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        cursor: isDrawing ? 'crosshair' : 'auto',
        touchAction: isDrawing ? 'none' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleContainerClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
    >
      <MapView />

      {/* Desktop Layout */}
      {!isMobile && (
        <>
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
            {/* Title */}
            <a href="https://github.com/raynbowy23/Axon-City.git" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>
            <img
              src="/AxonCityWideLogoWhite.png"
              alt="AxonCity"
              style={{
                height: '40px',
                width: 'auto',
              }}
            />
            </a>

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

          {/* Search */}
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
            }}
          >
            <SearchBar />
          </div>

          <ControlPanel />
          <StatsPanel />

          {/* Map Style Switcher - Desktop (next to Stats panel) */}
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '300px',
              zIndex: 1000,
            }}
          >
            <MapStyleSwitcher />
          </div>

          {/* Footer credit */}
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '300px',
              zIndex: 900,
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.6)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>Created by Rei Tamaru</span>
            <a
              href="https://github.com/raynbowy23/Axon-City"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'rgba(255, 255, 255, 0.8)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'white')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)')}
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
        </>
      )}

      {/* Mobile Layout */}
      {isMobile && (
        <>
          {/* Mobile Logo - square version for space efficiency */}
          <a
            href="https://github.com/raynbowy23/Axon-City.git"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              zIndex: 1000,
            }}
          >
            <img
              src="/AxonCityLogo.png"
              alt="AxonCity"
              style={{
                height: '36px',
                width: '36px',
                borderRadius: '6px',
              }}
            />
          </a>

          {/* Mobile Search - top centered */}
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              width: 'calc(100% - 100px)',
              maxWidth: '280px',
            }}
          >
            <SearchBar isMobile />
          </div>

          {/* Mobile Bottom Container - stacks draw controls above navigation */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            {/* Mobile Drawing Controls */}
            {!isDrawing ? (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '12px 16px',
                  pointerEvents: 'auto',
                }}
              >
                <button
                  onClick={handleStartDrawing}
                  disabled={isLoading}
                  style={{
                    padding: '14px 24px',
                    backgroundColor: isLoading ? '#666' : '#4A90D9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '15px',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    opacity: isLoading ? 0.7 : 1,
                    minHeight: '48px',
                  }}
                >
                  {isLoading ? 'Processing...' : 'Draw Area'}
                </button>

                {selectionPolygon && (
                  <button
                    onClick={handleClearSelection}
                    disabled={isLoading}
                    style={{
                      padding: '14px 20px',
                      backgroundColor: isLoading ? '#666' : '#D94A4A',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                      opacity: isLoading ? 0.7 : 1,
                      minHeight: '48px',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  borderRadius: '12px',
                  marginBottom: '8px',
                  pointerEvents: 'auto',
                }}
              >
                <button
                  onClick={undoLastPoint}
                  disabled={pointCount === 0}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: pointCount === 0 ? '#444' : '#666',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: pointCount === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    opacity: pointCount === 0 ? 0.5 : 1,
                    minHeight: '44px',
                  }}
                >
                  Undo
                </button>
                <button
                  onClick={handleCompleteDrawing}
                  disabled={pointCount < 3}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: pointCount < 3 ? '#444' : '#4A90D9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: pointCount < 3 ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    opacity: pointCount < 3 ? 0.5 : 1,
                    minHeight: '44px',
                  }}
                >
                  Done ({pointCount}/3+)
                </button>
                <button
                  onClick={cancelDrawing}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#D94A4A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    minHeight: '44px',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Mobile Navigation */}
            <div style={{ width: '100%', pointerEvents: 'auto' }}>
              <MobileNav
                activeTab={mobileTab}
                onTabChange={handleMobileTabChange}
                hasSelection={!!selectionPolygon}
                isExtractedViewOpen={isExtractedViewOpen}
              />
            </div>
          </div>

          {/* Bottom Sheet for Map Settings */}
          {mobileTab === 'map' && (
            <BottomSheet
              state={bottomSheetState}
              onStateChange={setBottomSheetState}
              title="Map Settings"
              peekHeight={200}
            >
              <MapSettingsPanel />
            </BottomSheet>
          )}

          {/* Bottom Sheet for Layers */}
          {mobileTab === 'layers' && (
            <BottomSheet
              state={bottomSheetState}
              onStateChange={setBottomSheetState}
              title="Layer Controls"
              peekHeight={250}
            >
              <ControlPanel isMobile />
            </BottomSheet>
          )}

          {/* Bottom Sheet for Stats */}
          {mobileTab === 'stats' && selectionPolygon && (
            <BottomSheet
              state={bottomSheetState}
              onStateChange={setBottomSheetState}
              title="Statistics"
              peekHeight={300}
            >
              <StatsPanel isMobile />
            </BottomSheet>
          )}
        </>
      )}

      {/* Shared Components (render on both mobile and desktop) */}
      <SelectionPanel />
      <ExtractedView isMobile={isMobile} />
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

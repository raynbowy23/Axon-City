import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import type { Layer, PickingInfo } from '@deck.gl/core';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString, Point } from 'geojson';

import { useStore } from '../store/useStore';
import { getLayersByCustomOrder, getLayerById, layerManifest } from '../data/layerManifest';
import type { LayerConfig, LayerGroup, LayerData, LayerOrderConfig, ViewState } from '../types';

// Size constraints
const MIN_WIDTH = 400;
const MAX_WIDTH = 1200;
const MIN_HEIGHT = 300;
const MAX_HEIGHT = 900;
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 500;

// LocalStorage key
const STORAGE_KEY = 'axoncity-extracted-view-size';

interface PanelSize {
  width: number;
  height: number;
}

function loadSavedSize(): PanelSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width || DEFAULT_WIDTH)),
        height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed.height || DEFAULT_HEIGHT)),
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

function saveSize(size: PanelSize): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage errors
  }
}

// Create sphere mesh fresh each time (don't cache to avoid WebGL context issues)
function createSphereMesh(): SphereGeometry {
  return new SphereGeometry({ radius: 1, nlat: 16, nlong: 16 });
}

// Isolated DeckGL component that fully mounts/unmounts
interface DeckGLViewProps {
  viewState: ViewState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onViewStateChange: (params: any) => void;
  selectionPolygon: { geometry: Polygon | MultiPolygon };
  layerData: Map<string, LayerData>;
  activeLayers: string[];
  layerOrder: LayerOrderConfig;
  layerSpacing: number;
}

const DeckGLView = memo(function DeckGLView({
  viewState,
  onViewStateChange,
  selectionPolygon,
  layerData,
  activeLayers,
  layerOrder,
  layerSpacing,
}: DeckGLViewProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<Feature | null>(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  // Reference to DeckGL for coordinate projection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deckRef = useRef<any>(null);

  // Pinned feature info - stores geographic coordinates and initial screen position
  interface PinnedInfo {
    id: string;
    feature: Feature;
    layerId: string;
    coordinates: [number, number]; // [longitude, latitude]
    initialScreenPos: { x: number; y: number }; // fallback position
  }
  const [pinnedInfos, setPinnedInfos] = useState<PinnedInfo[]>([]);

  // Track current screen positions of pinned features (updated when viewState changes)
  const [pinnedScreenPositions, setPinnedScreenPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Update pinned screen positions when viewState changes
  useEffect(() => {
    if (pinnedInfos.length === 0) return;

    // Use requestAnimationFrame to ensure DeckGL has updated its viewport
    const updatePositions = () => {
      if (!deckRef.current?.deck) return;
      const viewport = deckRef.current.deck.getViewports()[0];
      if (!viewport) return;

      const newPositions: Record<string, { x: number; y: number }> = {};
      for (const pinned of pinnedInfos) {
        try {
          const [x, y] = viewport.project(pinned.coordinates);
          newPositions[pinned.id] = { x, y };
        } catch {
          // Fall back to initial position if projection fails
          newPositions[pinned.id] = pinned.initialScreenPos;
        }
      }
      setPinnedScreenPositions(newPositions);
    };

    // Run immediately and also after a frame for DeckGL to update
    updatePositions();
    const frameId = requestAnimationFrame(updatePositions);

    return () => cancelAnimationFrame(frameId);
  }, [viewState, pinnedInfos]);

  // Helper to get centroid of a feature
  const getFeatureCentroid = useCallback((feature: Feature): [number, number] => {
    const geometry = feature.geometry;
    if (!geometry) return [0, 0];

    if (geometry.type === 'Point') {
      return geometry.coordinates as [number, number];
    } else if (geometry.type === 'LineString') {
      const coords = geometry.coordinates;
      const mid = Math.floor(coords.length / 2);
      return coords[mid] as [number, number];
    } else if (geometry.type === 'Polygon') {
      const coords = geometry.coordinates[0];
      let sumX = 0, sumY = 0;
      for (const c of coords) {
        sumX += c[0];
        sumY += c[1];
      }
      return [sumX / coords.length, sumY / coords.length];
    } else if (geometry.type === 'MultiPolygon') {
      const coords = geometry.coordinates[0][0];
      let sumX = 0, sumY = 0;
      for (const c of coords) {
        sumX += c[0];
        sumY += c[1];
      }
      return [sumX / coords.length, sumY / coords.length];
    } else if (geometry.type === 'MultiLineString') {
      const coords = geometry.coordinates[0];
      const mid = Math.floor(coords.length / 2);
      return coords[mid] as [number, number];
    }
    return [0, 0];
  }, []);

  const removePinnedInfo = useCallback((id: string) => {
    setPinnedInfos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Handle WebGL initialization
  const handleWebGLInitialized = useCallback(() => {
    setIsReady(true);
    setError(null);
  }, []);

  // Handle errors
  const handleError = useCallback((err: Error) => {
    console.error('DeckGL Error:', err);
    setError(err.message);
  }, []);

  // Handle hover
  const onHover = useCallback((info: PickingInfo) => {
    if (info.layer) {
      // Extract layer ID from the deck layer id (e.g., "extracted-buildings" -> "buildings")
      const layerId = info.layer.id.replace('extracted-', '');
      setHoveredLayerId(layerId);
      setHoveredFeature(info.object?.feature || info.object || null);
      setCursorPosition({ x: info.x, y: info.y });
    } else {
      setHoveredLayerId(null);
      setHoveredFeature(null);
      setCursorPosition(null);
    }
  }, []);

  // Handle click to pin feature info
  const onClick = useCallback((info: PickingInfo) => {
    if (info.object && info.layer && info.x !== undefined && info.y !== undefined) {
      const layerId = info.layer.id.replace('extracted-', '');

      // Get the feature and coordinates (handle different data formats)
      let feature: Feature | null = null;
      let coordinates: [number, number] | null = null;

      // Check if it's a full GeoJSON feature (polygons from GeoJsonLayer)
      if (info.object.feature) {
        feature = info.object.feature as Feature;
        coordinates = getFeatureCentroid(feature);
      } else if (info.object.type === 'Feature' && info.object.geometry) {
        feature = info.object as Feature;
        coordinates = getFeatureCentroid(feature);
      } else if (info.object.path) {
        // Line layer - has path array with [lon, lat, z] coordinates
        const path = info.object.path as number[][];
        const midIndex = Math.floor(path.length / 2);
        coordinates = [path[midIndex][0], path[midIndex][1]];
        // Create a synthetic feature for display
        feature = {
          type: 'Feature',
          properties: info.object.properties || {},
          geometry: {
            type: 'LineString',
            coordinates: path.map((p: number[]) => [p[0], p[1]]),
          },
        } as Feature;
      } else if (info.object.position) {
        // Point layer - has position array [lon, lat, z]
        const pos = info.object.position as number[];
        coordinates = [pos[0], pos[1]];
        // Create a synthetic feature for display
        feature = {
          type: 'Feature',
          properties: info.object.properties || {},
          geometry: {
            type: 'Point',
            coordinates: [pos[0], pos[1]],
          },
        } as Feature;
      } else if (info.object.polygon) {
        // Floating polygon layer (buildings, parks) - has polygon array
        const polygon = info.object.polygon as number[][];
        let sumX = 0, sumY = 0;
        for (const c of polygon) {
          sumX += c[0];
          sumY += c[1];
        }
        coordinates = [sumX / polygon.length, sumY / polygon.length];
        // Create a synthetic feature for display
        feature = {
          type: 'Feature',
          properties: info.object.properties || {},
          geometry: {
            type: 'Polygon',
            coordinates: [polygon.map((p: number[]) => [p[0], p[1]])],
          },
        } as Feature;
      } else if (info.object.properties) {
        // Fallback - has properties but unknown structure
        feature = {
          type: 'Feature',
          properties: info.object.properties,
          geometry: { type: 'Point', coordinates: [0, 0] },
        } as Feature;
        // Use click position for coordinates
        coordinates = info.coordinate as [number, number] || [0, 0];
      }

      if (feature && coordinates) {
        const featureId = feature.id || feature.properties?.id || `${layerId}-${Date.now()}`;
        const pinnedId = `pinned-${featureId}-${Date.now()}`;

        const alreadyPinned = pinnedInfos.some(
          (p) => p.layerId === layerId &&
          JSON.stringify(p.feature.properties) === JSON.stringify(feature!.properties)
        );

        if (!alreadyPinned) {
          setPinnedInfos((prev) => [
            ...prev,
            {
              id: pinnedId,
              feature,
              layerId,
              coordinates: coordinates!,
              initialScreenPos: { x: info.x, y: info.y },
            },
          ]);
        }
      }
    }
  }, [pinnedInfos, getFeatureCentroid]);

  // Build layers for the extracted view
  const extractedLayers = useMemo((): Layer[] => {
    const layers: Layer[] = [];
    const sortedLayers = getLayersByCustomOrder(layerOrder);
    const activeLayerConfigs = sortedLayers.filter((layer) => activeLayers.includes(layer.id));

    // Build dynamic group base heights
    const groupBaseHeights: Record<LayerGroup, number> = {} as Record<LayerGroup, number>;
    layerOrder.groupOrder.forEach((groupId, index) => {
      groupBaseHeights[groupId] = index + 1;
    });

    const groupSpacing = layerSpacing;
    const intraGroupSpacing = layerSpacing * 0.5;
    const groupLayerCounts: Record<string, number> = {};

    // Add subtle base platform
    layers.push(
      new PolygonLayer({
        id: 'extracted-base-platform',
        data: [selectionPolygon.geometry],
        getPolygon: (d: Polygon | MultiPolygon) => getPolygonCoordinates(d),
        getFillColor: [40, 40, 50, 200],
        getLineColor: [100, 150, 255, 255],
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
        filled: true,
        stroked: true,
        pickable: false,
      })
    );

    // Add group platforms
    const activeGroups = new Set(activeLayerConfigs.map((c) => c.group));
    for (const group of layerManifest.groups) {
      if (!activeGroups.has(group.id)) continue;
      const groupIndex = groupBaseHeights[group.id as LayerGroup] || 0;
      const zOffset = groupIndex * groupSpacing;

      layers.push(
        new PolygonLayer({
          id: `extracted-platform-${group.id}`,
          data: [selectionPolygon.geometry],
          getPolygon: (d: Polygon | MultiPolygon) => getPolygonCoordinates(d),
          getFillColor: [...group.color, 40] as [number, number, number, number],
          getLineColor: [...group.color, 150] as [number, number, number, number],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          filled: true,
          stroked: true,
          getElevation: zOffset - 5,
          extruded: false,
          pickable: false,
        })
      );
    }

    // Render each layer
    for (const config of activeLayerConfigs) {
      const data = layerData.get(config.id);
      if (!data?.clippedFeatures?.features.length) continue;

      const groupIndex = groupBaseHeights[config.group] || 0;
      if (!groupLayerCounts[config.group]) groupLayerCounts[config.group] = 0;
      const layerIndexInGroup = groupLayerCounts[config.group]++;

      const zOffset = groupIndex * groupSpacing + layerIndexInGroup * intraGroupSpacing;
      const features = data.clippedFeatures;

      switch (config.geometryType) {
        case 'polygon':
          layers.push(createExtractedPolygonLayer(config, features, zOffset));
          break;
        case 'line':
          layers.push(createExtractedLineLayer(config, features, zOffset));
          break;
        case 'point':
          layers.push(createExtractedPointLayer(config, features, zOffset));
          break;
      }
    }

    // Render pinned feature highlights (like autoHighlight but persistent)
    pinnedInfos.forEach((pinned, pinnedIndex) => {
      const pinnedElevationOffset = 200 + pinnedIndex * 10;
      const highlightFillColor: [number, number, number, number] = [255, 255, 100, 120];
      const highlightLineColor: [number, number, number, number] = [255, 255, 100, 255];
      const geometryType = pinned.feature.geometry?.type;

      if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
        // Semi-transparent fill overlay (like autoHighlight)
        layers.push(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new GeoJsonLayer<any>({
            id: `pinned-polygon-fill-${pinned.id}`,
            data: { type: 'FeatureCollection', features: [pinned.feature] },
            filled: true,
            stroked: true,
            getFillColor: highlightFillColor,
            getLineColor: highlightLineColor,
            getLineWidth: 3,
            lineWidthUnits: 'pixels',
            getElevation: pinnedElevationOffset,
            extruded: false,
            pickable: false,
          })
        );
      } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
        layers.push(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new GeoJsonLayer<any>({
            id: `pinned-line-${pinned.id}`,
            data: { type: 'FeatureCollection', features: [pinned.feature] },
            stroked: true,
            getLineColor: highlightLineColor,
            getLineWidth: 8,
            lineWidthUnits: 'pixels',
            pickable: false,
          })
        );
      } else if (geometryType === 'Point') {
        const coords = (pinned.feature.geometry as Point).coordinates;
        layers.push(
          new SimpleMeshLayer({
            id: `pinned-point-${pinned.id}`,
            data: [{ position: [...coords, pinnedElevationOffset + 20] }],
            mesh: createSphereMesh(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPosition: (d: any) => d.position,
            getColor: highlightLineColor,
            getScale: [20, 20, 20],
            pickable: false,
          })
        );
      }
    });

    return layers;
  }, [selectionPolygon, layerData, activeLayers, layerOrder, layerSpacing, pinnedInfos]);

  if (error) {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e',
        color: 'rgba(255,100,100,0.9)',
        fontSize: '12px',
        padding: '20px',
        textAlign: 'center',
      }}>
        WebGL Error: {error}
      </div>
    );
  }

  return (
    <>
      {!isReady && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
          color: 'rgba(255,255,255,0.6)',
          fontSize: '12px',
          zIndex: 1,
        }}>
          Initializing 3D view...
        </div>
      )}
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        onWebGLInitialized={handleWebGLInitialized}
        onError={handleError}
        onHover={onHover}
        onClick={onClick}
        controller={{ dragRotate: true, touchRotate: true, keyboard: true }}
        layers={extractedLayers}
        style={{ position: 'absolute', top: '0', left: '0', width: '100%', height: '100%' }}
      />

      {/* Hover Tooltip */}
      {hoveredFeature && cursorPosition && (
        <div
          style={{
            position: 'absolute',
            left: cursorPosition.x + 10,
            top: cursorPosition.y + 10,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            pointerEvents: 'none',
            maxWidth: '250px',
            zIndex: 10,
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {getLayerById(hoveredLayerId || '')?.name || 'Feature'}
          </div>
          {hoveredFeature.properties && (
            <div>
              {Object.entries(hoveredFeature.properties)
                .filter(([key]) => !['id', 'type'].includes(key))
                .slice(0, 5)
                .map(([key, value]) => (
                  <div key={key} style={{ opacity: 0.8 }}>
                    <span style={{ color: '#aaa' }}>{key}:</span> {String(value)}
                  </div>
                ))}
            </div>
          )}
          <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px' }}>
            Click to pin
          </div>
        </div>
      )}

      {/* Pinned Info Cards with connector lines */}
      {pinnedInfos.map((pinned) => {
        // Use tracked screen position, fall back to initial position
        const screenPos = pinnedScreenPositions[pinned.id] || pinned.initialScreenPos;

        // Calculate card position (offset from object)
        const cardOffset = { x: 20, y: -10 };
        const cardX = screenPos.x + cardOffset.x;
        const cardY = screenPos.y + cardOffset.y;

        return (
          <div key={pinned.id}>
            {/* Connector line from object to card */}
            <svg
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <line
                x1={screenPos.x}
                y1={screenPos.y}
                x2={cardX}
                y2={cardY + 20}
                stroke="rgba(255, 200, 50, 0.8)"
                strokeWidth="2"
                strokeDasharray="4,2"
              />
              {/* Small circle at object location */}
              <circle
                cx={screenPos.x}
                cy={screenPos.y}
                r="5"
                fill="rgba(255, 200, 50, 1)"
                stroke="white"
                strokeWidth="2"
              />
            </svg>

            {/* Info Card */}
            <div
              style={{
                position: 'absolute',
                left: cardX,
                top: cardY,
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                color: 'white',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                maxWidth: '240px',
                zIndex: 11,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                border: '2px solid rgba(255, 200, 50, 0.8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontWeight: 'bold', color: 'rgba(255, 200, 50, 1)' }}>
                  {getLayerById(pinned.layerId)?.name || 'Feature'}
                </div>
                <button
                  onClick={() => removePinnedInfo(pinned.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    padding: '0 4px',
                    fontSize: '14px',
                    lineHeight: '1',
                    marginLeft: '8px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255, 100, 100, 1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)')}
                >
                  ×
                </button>
              </div>
              {pinned.feature.properties && (
                <div>
                  {Object.entries(pinned.feature.properties)
                    .filter(([key]) => !['id', 'type'].includes(key))
                    .slice(0, 8)
                    .map(([key, value]) => (
                      <div key={key} style={{ marginBottom: '2px' }}>
                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>{key}:</span>{' '}
                        <span>{String(value)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
});

export function ExtractedView() {
  const {
    layerData,
    activeLayers,
    selectionPolygon,
    isExtractedViewOpen,
    setExtractedViewOpen,
    layerOrder,
  } = useStore();

  // Panel size and position
  const [size, setSize] = useState<PanelSize>(loadSavedSize);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'right' | 'bottom' | 'corner' | null>(null);

  // Track how many times the view has been opened (used as key to force fresh DeckGL)
  const [openCount, setOpenCount] = useState(0);
  const wasOpenRef = useRef(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  // Increment openCount when transitioning from closed to open
  useEffect(() => {
    if (isExtractedViewOpen && !wasOpenRef.current) {
      setOpenCount((c) => c + 1);
    }
    wasOpenRef.current = isExtractedViewOpen;
  }, [isExtractedViewOpen]);

  // Calculate bounds and zoom limits from selection
  const viewBounds = useMemo(() => {
    if (!selectionPolygon) return null;
    return getBoundsFromPolygon(selectionPolygon.geometry);
  }, [selectionPolygon]);

  const { center, minZoom, maxZoom } = useMemo(() => {
    if (!selectionPolygon || !viewBounds) {
      return { center: [0, 0] as [number, number], minZoom: 14, maxZoom: 20 };
    }
    const centerPoint = getCentroid(selectionPolygon.geometry);
    // Calculate appropriate zoom based on selection size
    const { minLon, maxLon, minLat, maxLat } = viewBounds;
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    const maxSpan = Math.max(lonSpan, latSpan);

    // Approximate zoom level calculation
    // At zoom 0, the world is ~360 degrees wide
    // Each zoom level halves the span
    const calculatedZoom = Math.floor(Math.log2(360 / maxSpan)) - 1;
    const idealZoom = Math.max(12, Math.min(18, calculatedZoom));

    return {
      center: centerPoint,
      minZoom: Math.max(idealZoom - 2, 12),
      maxZoom: Math.min(idealZoom + 3, 20),
    };
  }, [selectionPolygon, viewBounds]);

  // Local view state for extracted view (always exploded)
  const [localViewState, setLocalViewState] = useState<ViewState>({
    longitude: center[0],
    latitude: center[1],
    zoom: 16,
    pitch: 60,
    bearing: -30,
    maxPitch: 89,
    minPitch: 0,
  });

  // Exploded view config (always on)
  const [layerSpacing, setLayerSpacing] = useState(80);

  // Reset view state when extracted view is opened
  useEffect(() => {
    if (isExtractedViewOpen && selectionPolygon && viewBounds) {
      const [lon, lat] = center;
      const idealZoom = Math.floor((minZoom + maxZoom) / 2);
      // Fully reset view state when opening
      setLocalViewState({
        longitude: lon,
        latitude: lat,
        zoom: idealZoom,
        pitch: 60,
        bearing: -30,
        maxPitch: 89,
        minPitch: 0,
      });
    }
  }, [isExtractedViewOpen]); // Only trigger on open/close

  // Update view center when selection polygon changes (while view is open)
  useEffect(() => {
    if (selectionPolygon && isExtractedViewOpen && viewBounds) {
      const [lon, lat] = center;
      setLocalViewState((prev) => ({
        ...prev,
        longitude: lon,
        latitude: lat,
      }));
    }
  }, [selectionPolygon, viewBounds, center]);

  // Handle mouse move during resize/drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing && resizeDirection) {
      const deltaX = e.clientX - startRef.current.x;
      const deltaY = e.clientY - startRef.current.y;

      let newWidth = startRef.current.width;
      let newHeight = startRef.current.height;

      if (resizeDirection === 'right' || resizeDirection === 'corner') {
        newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.width + deltaX));
      }
      if (resizeDirection === 'bottom' || resizeDirection === 'corner') {
        newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startRef.current.height + deltaY));
      }

      setSize({ width: newWidth, height: newHeight });
    } else if (isDragging) {
      const deltaX = e.clientX - startRef.current.x;
      const deltaY = e.clientY - startRef.current.y;

      setPosition({
        x: Math.max(0, startRef.current.posX + deltaX),
        y: Math.max(0, startRef.current.posY + deltaY),
      });
    }
  }, [isResizing, isDragging, resizeDirection]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      setResizeDirection(null);
      saveSize(size);
    }
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isResizing, isDragging, size]);

  // Add/remove global mouse listeners
  useEffect(() => {
    if (isResizing || isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      if (isResizing) {
        document.body.style.cursor = resizeDirection === 'corner' ? 'nwse-resize' : resizeDirection === 'right' ? 'ew-resize' : 'ns-resize';
      } else {
        document.body.style.cursor = 'move';
      }
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, isDragging, handleMouseMove, handleMouseUp, resizeDirection]);

  // Start resize
  const startResize = useCallback((e: React.MouseEvent, direction: 'right' | 'bottom' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    startRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height, posX: position.x, posY: position.y };
  }, [size, position]);

  // Start drag
  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, .deck-canvas')) return;
    e.preventDefault();
    setIsDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height, posX: position.x, posY: position.y };
  }, [size, position]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleViewStateChange = useCallback((params: any) => {
    const vs = params.viewState;
    if (vs && viewBounds) {
      // Clamp longitude and latitude within selection bounds (with small padding)
      const padding = 0.001; // Small padding to allow slight movement
      const clampedLon = Math.max(viewBounds.minLon - padding, Math.min(viewBounds.maxLon + padding, vs.longitude));
      const clampedLat = Math.max(viewBounds.minLat - padding, Math.min(viewBounds.maxLat + padding, vs.latitude));
      // Clamp zoom within allowed range
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, vs.zoom));

      setLocalViewState({
        longitude: clampedLon,
        latitude: clampedLat,
        zoom: clampedZoom,
        pitch: vs.pitch || 0,
        bearing: vs.bearing || 0,
        maxPitch: 89,
        minPitch: 0,
      });
    }
  }, [viewBounds, minZoom, maxZoom]);

  // Don't render anything if closed or no selection
  if (!isExtractedViewOpen || !selectionPolygon) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        width: size.width,
        height: size.height,
        backgroundColor: 'rgba(20, 20, 30, 0.98)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(100, 150, 255, 0.3)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'move',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onMouseDown={startDrag}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'white', fontWeight: '600', fontSize: '14px' }}>
            Extracted View
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
            {size.width}×{size.height}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Layer spacing control */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '11px' }}>
            Spacing:
            <input
              type="range"
              min="30"
              max="200"
              value={layerSpacing}
              onChange={(e) => setLayerSpacing(Number(e.target.value))}
              style={{ width: '80px', cursor: 'pointer' }}
            />
            <span style={{ width: '35px' }}>{layerSpacing}m</span>
          </label>

          <button
            onClick={() => setExtractedViewOpen(false)}
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(255, 100, 100, 0.8)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Camera controls */}
      <div
        style={{
          padding: '8px 16px',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '11px' }}>
          Pitch:
          <input
            type="range"
            min="0"
            max="89"
            value={localViewState.pitch}
            onChange={(e) => setLocalViewState((prev) => ({ ...prev, pitch: Number(e.target.value) }))}
            style={{ width: '60px', cursor: 'pointer' }}
          />
          <span style={{ width: '25px' }}>{localViewState.pitch.toFixed(0)}°</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '11px' }}>
          Bearing:
          <input
            type="range"
            min="0"
            max="360"
            value={localViewState.bearing}
            onChange={(e) => setLocalViewState((prev) => ({ ...prev, bearing: Number(e.target.value) }))}
            style={{ width: '60px', cursor: 'pointer' }}
          />
          <span style={{ width: '30px' }}>{localViewState.bearing.toFixed(0)}°</span>
        </label>

        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { label: 'Top', pitch: 0, bearing: 0 },
            { label: 'Axon', pitch: 60, bearing: -30 },
            { label: 'Side', pitch: 80, bearing: 0 },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => setLocalViewState((prev) => ({ ...prev, pitch: preset.pitch, bearing: preset.bearing }))}
              style={{
                padding: '3px 8px',
                backgroundColor:
                  localViewState.pitch === preset.pitch && localViewState.bearing === preset.bearing
                    ? '#4A90D9'
                    : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3D View */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#1a1a2e' }}>
        <DeckGLView
          key={`deck-${openCount}`}
          viewState={localViewState}
          onViewStateChange={handleViewStateChange}
          selectionPolygon={selectionPolygon}
          layerData={layerData}
          activeLayers={activeLayers}
          layerOrder={layerOrder}
          layerSpacing={layerSpacing}
        />
      </div>

      {/* Resize handles */}
      <div
        style={{
          position: 'absolute',
          right: -4,
          top: 50,
          width: 8,
          height: 'calc(100% - 60px)',
          cursor: 'ew-resize',
        }}
        onMouseDown={(e) => startResize(e, 'right')}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -4,
          left: 10,
          width: 'calc(100% - 20px)',
          height: 8,
          cursor: 'ns-resize',
        }}
        onMouseDown={(e) => startResize(e, 'bottom')}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -6,
          right: -6,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseDown={(e) => startResize(e, 'corner')}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderBottom: '2px solid rgba(255,255,255,0.4)',
            borderRight: '2px solid rgba(255,255,255,0.4)',
          }}
        />
      </div>
    </div>
  );
}

// Helper to get centroid of polygon
function getCentroid(polygon: Polygon | MultiPolygon): [number, number] {
  // Handle MultiPolygon by using the first polygon
  const coords = polygon.type === 'MultiPolygon'
    ? polygon.coordinates[0][0]
    : polygon.coordinates[0];
  let sumX = 0, sumY = 0;
  for (const coord of coords) {
    sumX += coord[0];
    sumY += coord[1];
  }
  return [sumX / coords.length, sumY / coords.length];
}

// Helper to get bounds from polygon
function getBoundsFromPolygon(polygon: Polygon | MultiPolygon): { minLon: number; maxLon: number; minLat: number; maxLat: number } {
  const coords = polygon.type === 'MultiPolygon'
    ? polygon.coordinates[0][0]
    : polygon.coordinates[0];

  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const coord of coords) {
    minLon = Math.min(minLon, coord[0]);
    maxLon = Math.max(maxLon, coord[0]);
    minLat = Math.min(minLat, coord[1]);
    maxLat = Math.max(maxLat, coord[1]);
  }

  return { minLon, maxLon, minLat, maxLat };
}

// Helper to get coordinates for PolygonLayer
function getPolygonCoordinates(polygon: Polygon | MultiPolygon): number[][][] {
  if (polygon.type === 'MultiPolygon') {
    return polygon.coordinates[0]; // Use first polygon
  }
  return polygon.coordinates;
}

// Park height constants (same as MapView)
const PARK_FLOAT_HEIGHT = 40;
const PARK_THICKNESS = 5;

// Layer creation helpers
function createExtractedPolygonLayer(config: LayerConfig, features: FeatureCollection, zOffset: number): Layer {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];

  if (config.id === 'buildings') {
    // Special handling for buildings
    const buildingData = features.features
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f, index) => {
        const coords = (f.geometry as Polygon).coordinates[0];
        const height = getBuildingHeight(f.properties || {});
        return {
          polygon: coords.map((c) => [c[0], c[1], zOffset + 50]),
          height: height * 0.5,
          properties: f.properties,
          feature: f,
          id: f.id || index,
        };
      });

    return new PolygonLayer({
      id: `extracted-${config.id}`,
      data: buildingData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPolygon: (d: any) => d.polygon,
      getFillColor: fillColor,
      getLineColor: style.strokeColor,
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getElevation: (d: any) => d.height,
      extruded: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 100, 100],
    });
  }

  if (config.id === 'parks') {
    // Special handling for parks - floating with thickness (same as MapView)
    const parkData = features.features
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f, index) => {
        const coords = (f.geometry as Polygon).coordinates[0];
        const baseElevation = Math.max(PARK_FLOAT_HEIGHT, zOffset) + (index % 10) * 0.3;
        return {
          polygon: coords.map((c) => [c[0], c[1], baseElevation]),
          properties: f.properties,
          feature: f,
          id: f.id || index,
        };
      });

    return new PolygonLayer({
      id: `extracted-${config.id}`,
      data: parkData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPolygon: (d: any) => d.polygon,
      getFillColor: fillColor,
      getLineColor: style.strokeColor,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      getElevation: PARK_THICKNESS,
      extruded: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 100, 100],
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new GeoJsonLayer<any>({
    id: `extracted-${config.id}`,
    data: features,
    filled: true,
    stroked: true,
    getFillColor: fillColor,
    getLineColor: style.strokeColor,
    getLineWidth: style.strokeWidth,
    lineWidthUnits: 'pixels',
    getElevation: zOffset + 10,
    extruded: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 100],
  });
}

function createExtractedLineLayer(config: LayerConfig, features: FeatureCollection, zOffset: number): Layer {
  const { style } = config;
  const color = [...style.strokeColor] as [number, number, number, number];

  const pathData = features.features
    .filter((f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
    .flatMap((f) => {
      if (f.geometry.type === 'LineString') {
        return [{
          path: (f.geometry as LineString).coordinates.map((c) => [...c, zOffset]),
          properties: f.properties,
          feature: f,
        }];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (f.geometry as any).coordinates.map((coords: number[][]) => ({
        path: coords.map((c: number[]) => [...c, zOffset]),
        properties: f.properties,
        feature: f,
      }));
    });

  return new PathLayer({
    id: `extracted-${config.id}`,
    data: pathData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPath: (d: any) => d.path,
    getColor: color,
    getWidth: style.strokeWidth * 1.5,
    widthUnits: 'pixels',
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 255],
  });
}

function createExtractedPointLayer(config: LayerConfig, features: FeatureCollection, zOffset: number): Layer {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];

  const pointData = features.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => ({
      position: [...(f.geometry as Point).coordinates, zOffset + 20],
      properties: f.properties,
      feature: f,
    }));

  return new SimpleMeshLayer({
    id: `extracted-${config.id}`,
    data: pointData,
    mesh: createSphereMesh(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPosition: (d: any) => d.position,
    getColor: fillColor,
    getScale: [12, 12, 12],
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 255],
  });
}

function getBuildingHeight(props: Record<string, unknown>): number {
  if (props.height) {
    const h = parseFloat(props.height as string);
    if (!isNaN(h)) return h;
  }
  if (props['building:levels'] || props.levels) {
    const levels = parseInt((props['building:levels'] || props.levels) as string);
    if (!isNaN(levels)) return levels * 3.5;
  }
  const buildingType = props.building as string;
  if (buildingType === 'yes' || !buildingType) return 8;
  if (['apartments', 'residential', 'house'].includes(buildingType)) return 12;
  if (['commercial', 'office', 'retail'].includes(buildingType)) return 20;
  if (['industrial', 'warehouse'].includes(buildingType)) return 15;
  return 8;
}

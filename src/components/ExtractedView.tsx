import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView } from '@deck.gl/core';
import { GeoJsonLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import type { Layer, PickingInfo } from '@deck.gl/core';
import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString, Point } from 'geojson';

import { useStore } from '../store/useStore';
import { getLayersByCustomOrder, layerManifest } from '../data/layerManifest';
import type { LayerData, LayerOrderConfig, CustomLayerConfig, AnyLayerConfig } from '../types';

// OrbitView viewState type
interface OrbitViewState {
  target: [number, number, number];
  rotationX: number;
  rotationOrbit: number;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}

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

// Convert geographic coordinates to local meter coordinates
// Uses simple equirectangular projection (accurate for small areas)
function geoToLocal(lon: number, lat: number, centerLon: number, centerLat: number): [number, number] {
  const METERS_PER_DEGREE_LAT = 111320; // Approximate meters per degree latitude
  const METERS_PER_DEGREE_LON = 111320 * Math.cos((centerLat * Math.PI) / 180);

  const x = (lon - centerLon) * METERS_PER_DEGREE_LON;
  const y = (lat - centerLat) * METERS_PER_DEGREE_LAT;

  return [x, y];
}


// Isolated DeckGL component that fully mounts/unmounts
interface DeckGLViewProps {
  viewState: OrbitViewState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onViewStateChange: (params: any) => void;
  selectionPolygon: { geometry: Polygon | MultiPolygon };
  layerData: Map<string, LayerData>;
  activeLayers: string[];
  layerOrder: LayerOrderConfig;
  layerSpacing: number;
  intraGroupRatio: number; // ratio of layer spacing for intra-group spacing
  center: [number, number]; // geographic center for coordinate conversion
  enabledGroups: Set<string>; // which groups are visible in extracted view
  showPlatforms: boolean; // whether to show transparent group platforms
  customLayers: CustomLayerConfig[]; // user-uploaded custom layers
  customGroupEnabled: boolean; // whether custom layers group is visible
}

const DeckGLView = memo(function DeckGLView({
  viewState,
  onViewStateChange,
  selectionPolygon,
  layerData,
  activeLayers,
  layerOrder,
  layerSpacing,
  intraGroupRatio,
  center,
  enabledGroups,
  showPlatforms,
  customLayers,
  customGroupEnabled,
}: DeckGLViewProps) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredFeature, setHoveredFeature] = useState<Feature | null>(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  // Clicked/highlighted object with its 3D geometry data
  interface HighlightedObject {
    layerId: string;
    polygon?: number[][];  // For polygon layers (already in local coords with z)
    path?: number[][];     // For line layers
    position?: number[];   // For point layers
  }
  const [highlightedObject, setHighlightedObject] = useState<HighlightedObject | null>(null);

  // Custom drag handling: drag=pan, Ctrl+drag=rotate
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);
  const isCtrlRef = useRef(false);

  // Mouse event handlers for custom pan/rotate
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button and not on UI elements
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    isCtrlRef.current = e.ctrlKey || e.metaKey;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !lastMouseRef.current) return;

    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };

    // Update Ctrl state in case it changed during drag
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl) {
      // Ctrl+drag = rotate (inverted for natural feel)
      onViewStateChange({
        viewState: {
          ...viewState,
          rotationOrbit: viewState.rotationOrbit + dx * 0.5,
          rotationX: Math.max(0, Math.min(90, viewState.rotationX - dy * 0.5)),
        },
      });
    } else {
      // Drag = pan (move target)
      // Convert screen movement to world movement based on current rotation
      const angle = (viewState.rotationOrbit * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Scale pan speed based on zoom
      const panScale = Math.pow(2, -viewState.zoom) * 2;
      const worldDx = (dx * cosA - dy * sinA) * panScale;
      const worldDy = (dx * sinA + dy * cosA) * panScale;

      onViewStateChange({
        viewState: {
          ...viewState,
          target: [
            viewState.target[0] - worldDx,
            viewState.target[1] + worldDy,
            viewState.target[2],
          ],
        },
      });
    }
  }, [viewState, onViewStateChange]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    lastMouseRef.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
    onViewStateChange({
      viewState: {
        ...viewState,
        zoom: Math.max(-2, Math.min(5, viewState.zoom + zoomDelta)),
      },
    });
  }, [viewState, onViewStateChange]);

  // Touch event handling for mobile
  const touchStartRef = useRef<{
    x: number;
    y: number;
    touches: number;
    distance?: number;
    angle?: number;
    midpoint?: { x: number; y: number };
  } | null>(null);

  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchAngle = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const getTouchMidpoint = (touches: React.TouchList): { x: number; y: number } => {
    if (touches.length < 2) return { x: touches[0].clientX, y: touches[0].clientY };
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  // Ref for the touch container to attach non-passive listeners
  const touchContainerRef = useRef<HTMLDivElement>(null);

  // Store viewState and callback in refs for touch handlers
  const viewStateRef = useRef(viewState);
  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => {
    viewStateRef.current = viewState;
    onViewStateChangeRef.current = onViewStateChange;
  }, [viewState, onViewStateChange]);

  // Touch event handlers (use native TouchEvent for non-passive listeners)
  const handleTouchStart = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      touches: e.touches.length,
      distance: e.touches.length >= 2 ? getTouchDistance(e.touches as unknown as React.TouchList) : undefined,
      angle: e.touches.length >= 2 ? getTouchAngle(e.touches as unknown as React.TouchList) : undefined,
      midpoint: e.touches.length >= 2 ? getTouchMidpoint(e.touches as unknown as React.TouchList) : undefined,
    };
    isDraggingRef.current = true;
    lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (!isDraggingRef.current || !lastMouseRef.current || !touchStartRef.current) return;

    const touch = e.touches[0];
    const currentViewState = viewStateRef.current;

    // Handle two-finger gestures: pinch-to-zoom and pan
    if (e.touches.length >= 2 && touchStartRef.current.distance !== undefined) {
      const currentDistance = getTouchDistance(e.touches as unknown as React.TouchList);
      const currentMidpoint = getTouchMidpoint(e.touches as unknown as React.TouchList);

      // Pinch-to-zoom
      const distanceDelta = currentDistance - touchStartRef.current.distance;
      const zoomDelta = distanceDelta * 0.008;

      // Two-finger pan (move midpoint)
      let newTarget = currentViewState.target;
      if (touchStartRef.current.midpoint) {
        const mdx = currentMidpoint.x - touchStartRef.current.midpoint.x;
        const mdy = currentMidpoint.y - touchStartRef.current.midpoint.y;

        const angle = (currentViewState.rotationOrbit * Math.PI) / 180;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const panScale = Math.pow(2, -currentViewState.zoom) * 2;
        const worldDx = (mdx * cosA - mdy * sinA) * panScale;
        const worldDy = (mdx * sinA + mdy * cosA) * panScale;

        newTarget = [
          currentViewState.target[0] - worldDx,
          currentViewState.target[1] + worldDy,
          currentViewState.target[2],
        ] as [number, number, number];
      }

      onViewStateChangeRef.current({
        viewState: {
          ...currentViewState,
          zoom: Math.max(-2, Math.min(5, currentViewState.zoom + zoomDelta)),
          target: newTarget,
        },
      });

      touchStartRef.current.distance = currentDistance;
      touchStartRef.current.midpoint = currentMidpoint;
      return;
    }

    // Single finger: rotate (orbit) horizontally and tilt vertically
    // This provides intuitive one-finger rotation control
    const dx = touch.clientX - lastMouseRef.current.x;
    const dy = touch.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: touch.clientX, y: touch.clientY };

    onViewStateChangeRef.current({
      viewState: {
        ...currentViewState,
        rotationOrbit: currentViewState.rotationOrbit + dx * 0.5,
        rotationX: Math.max(0, Math.min(90, currentViewState.rotationX - dy * 0.3)),
      },
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
    lastMouseRef.current = null;
    touchStartRef.current = null;
  }, []);

  // Attach touch listeners with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = touchContainerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

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

  // Track current screen positions of pinned features using ref to avoid re-renders during drag
  const pinnedScreenPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  // Helper to get layer config by ID (from manifest or custom layers)
  const getLayerConfigById = useCallback((layerId: string): AnyLayerConfig | undefined => {
    const manifestLayer = layerManifest.layers.find(l => l.id === layerId);
    if (manifestLayer) return manifestLayer;
    return customLayers.find(l => l.id === layerId);
  }, [customLayers]);

  // Calculate z-offset for a given layer in the extracted view (always exploded)
  // This must match the logic in extractedLayers exactly
  const getLayerZOffset = useCallback((layerId: string): number => {
    const layerConfig = getLayerConfigById(layerId);
    if (!layerConfig) return 0;

    const isCustom = 'isCustom' in layerConfig && layerConfig.isCustom;
    const groupSpacing = layerSpacing;
    const intraGroupSpacing = layerSpacing * intraGroupRatio;

    // Get active manifest layer configs WITH DATA (same as extractedLayers)
    const sortedLayers = getLayersByCustomOrder(layerOrder);
    const activeManifestLayers = sortedLayers.filter((layer) => {
      if (!activeLayers.includes(layer.id)) return false;
      const data = layerData.get(layer.id);
      return data?.clippedFeatures?.features?.length;
    });

    // Get active custom layers WITH DATA
    const activeCustomLayers = customLayers.filter((layer) => {
      if (!activeLayers.includes(layer.id)) return false;
      const data = layerData.get(layer.id);
      const hasFeatures = data?.clippedFeatures?.features?.length || data?.features?.features?.length;
      return hasFeatures;
    });

    // Count manifest layers WITH DATA per group
    const activeLayersPerGroup: Record<string, number> = {};
    for (const config of activeManifestLayers) {
      activeLayersPerGroup[config.group] = (activeLayersPerGroup[config.group] || 0) + 1;
    }

    // Calculate cumulative group base heights (only for groups with data)
    let cumulativeHeight = 0;
    let groupBaseHeight = 0;
    for (const groupId of layerOrder.groupOrder) {
      if (!isCustom && groupId === layerConfig.group) {
        groupBaseHeight = cumulativeHeight;
      }
      const layerCount = activeLayersPerGroup[groupId] || 0;
      if (layerCount > 0) {
        cumulativeHeight += groupSpacing + layerCount * intraGroupSpacing;
      }
    }

    let zOffset: number;

    if (isCustom) {
      // Custom layers go at the top
      // cumulativeHeight already includes spacing after the last group, so just use it directly
      const customLayerBaseHeight = cumulativeHeight;
      const customLayerIndex = activeCustomLayers.findIndex(l => l.id === layerId);
      zOffset = customLayerBaseHeight + Math.max(0, customLayerIndex) * intraGroupSpacing;
    } else {
      // Get layer index within group (only counting layers with data)
      const activeLayersInGroup = activeManifestLayers.filter(l => l.group === layerConfig.group);
      const layerIndexInGroup = activeLayersInGroup.findIndex(l => l.id === layerId);
      zOffset = groupBaseHeight + Math.max(0, layerIndexInGroup) * intraGroupSpacing;

      // Special handling for floating layers
      const isBuildingLayer = layerId.startsWith('buildings-') || layerId === 'buildings';
      if (isBuildingLayer) {
        zOffset = zOffset + 50;
      } else if (layerId === 'parks') {
        zOffset = Math.max(40, zOffset);
      }
    }

    return zOffset;
  }, [layerOrder, layerSpacing, intraGroupRatio, activeLayers, customLayers, layerData, getLayerConfigById]);

  // Update pinned screen positions continuously using rAF (doesn't trigger re-renders)
  useEffect(() => {
    if (pinnedInfos.length === 0) return;

    let animationFrameId: number;

    const updatePositions = () => {
      if (!deckRef.current?.deck) {
        animationFrameId = requestAnimationFrame(updatePositions);
        return;
      }
      const viewport = deckRef.current.deck.getViewports()[0];
      if (!viewport) {
        animationFrameId = requestAnimationFrame(updatePositions);
        return;
      }

      // Update positions directly in ref (no state update = no re-render)
      for (const pinned of pinnedInfos) {
        try {
          const zOffset = getLayerZOffset(pinned.layerId);
          const [localX, localY] = geoToLocal(pinned.coordinates[0], pinned.coordinates[1], center[0], center[1]);
          const [x, y] = viewport.project([localX, localY, zOffset]);
          pinnedScreenPositionsRef.current[pinned.id] = { x, y };

          // Directly update DOM element position for smooth movement
          const cardEl = document.getElementById(`pinned-card-${pinned.id}`);
          const lineEl = document.getElementById(`pinned-line-${pinned.id}`);
          if (cardEl) {
            cardEl.style.transform = `translate(${x + 20}px, ${y - 10}px)`;
          }
          if (lineEl) {
            lineEl.setAttribute('x1', String(x));
            lineEl.setAttribute('y1', String(y));
            lineEl.setAttribute('x2', String(x + 20));
            lineEl.setAttribute('y2', String(y + 10));
            const circle = lineEl.nextElementSibling as SVGCircleElement;
            if (circle) {
              circle.setAttribute('cx', String(x));
              circle.setAttribute('cy', String(y));
            }
          }
        } catch {
          // Keep existing position on error
        }
      }

      animationFrameId = requestAnimationFrame(updatePositions);
    };

    animationFrameId = requestAnimationFrame(updatePositions);

    return () => cancelAnimationFrame(animationFrameId);
  }, [pinnedInfos, getLayerZOffset, center]); // Note: removed viewState dependency

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
    if (info.layer && info.object) {
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

  // Handle click to pin feature info and highlight object
  const onClick = useCallback((info: PickingInfo) => {
    if (info.object && info.layer && info.x !== undefined && info.y !== undefined) {
      const layerId = info.layer.id.replace('extracted-', '');

      // Capture 3D geometry for highlighting
      if (info.object.polygon) {
        setHighlightedObject({ layerId, polygon: info.object.polygon as number[][] });
      } else if (info.object.path) {
        setHighlightedObject({ layerId, path: info.object.path as number[][] });
      } else if (info.object.position) {
        setHighlightedObject({ layerId, position: info.object.position as number[] });
      } else {
        setHighlightedObject(null);
      }

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
    } else {
      // Clicked on empty space - clear highlight
      setHighlightedObject(null);
    }
  }, [pinnedInfos, getFeatureCentroid]);

  // Build layers for the extracted view
  const extractedLayers = useMemo((): Layer[] => {
    const layers: Layer[] = [];
    const sortedLayers = getLayersByCustomOrder(layerOrder);
    // Filter by active layers, enabled groups, AND has data
    const activeLayerConfigs = sortedLayers.filter((layer) => {
      if (!activeLayers.includes(layer.id)) return false;
      if (!enabledGroups.has(layer.group)) return false;
      const data = layerData.get(layer.id);
      // Only include if has clipped features (extracted view always uses clipped)
      return data?.clippedFeatures?.features?.length;
    });

    const groupSpacing = layerSpacing;
    const intraGroupSpacing = layerSpacing * intraGroupRatio;

    // Count layers WITH DATA per group
    const activeLayersPerGroup: Record<string, number> = {};
    for (const config of activeLayerConfigs) {
      activeLayersPerGroup[config.group] = (activeLayersPerGroup[config.group] || 0) + 1;
    }

    // Calculate cumulative group base heights (only for groups with data)
    const groupBaseHeights: Record<string, number> = {};
    let cumulativeHeight = 0;
    for (const groupId of layerOrder.groupOrder) {
      groupBaseHeights[groupId] = cumulativeHeight;
      const layerCount = activeLayersPerGroup[groupId] || 0;
      // Only add space if the group has layers with data
      if (layerCount > 0) {
        cumulativeHeight += groupSpacing + layerCount * intraGroupSpacing;
      }
    }

    const groupLayerCounts: Record<string, number> = {};

    // Convert selection polygon to local coordinates for platforms
    const localPolygonCoords = getPolygonCoordinates(selectionPolygon.geometry);
    const localPolygon = localPolygonCoords.map(ring =>
      ring.map((c: number[]) => {
        const [x, y] = geoToLocal(c[0], c[1], center[0], center[1]);
        return [x, y];
      })
    );

    // Add subtle base platform
    layers.push(
      new PolygonLayer({
        id: 'extracted-base-platform',
        data: [{ polygon: localPolygon }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPolygon: (d: any) => d.polygon,
        getFillColor: [40, 40, 50, 200],
        getLineColor: [100, 150, 255, 255],
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
        filled: true,
        stroked: true,
        pickable: false,
      })
    );

    // Add group platforms (only if showPlatforms is enabled)
    if (showPlatforms) {
      const activeGroups = new Set(activeLayerConfigs.map((c) => c.group));
      for (const group of layerManifest.groups) {
        if (!activeGroups.has(group.id)) continue;
        const zOffset = groupBaseHeights[group.id] || 0;

        // Create elevated local polygon
        const elevatedPolygon = localPolygon.map(ring =>
          ring.map((c: number[]) => [c[0], c[1], zOffset - 5])
        );

        layers.push(
          new PolygonLayer({
            id: `extracted-platform-${group.id}`,
            data: [{ polygon: elevatedPolygon }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPolygon: (d: any) => d.polygon,
            getFillColor: [...group.color, 40] as [number, number, number, number],
            getLineColor: [...group.color, 150] as [number, number, number, number],
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
            filled: true,
            stroked: true,
            extruded: false,
            pickable: false,
          })
        );
      }
    }

    // Render each manifest layer
    for (const config of activeLayerConfigs) {
      const data = layerData.get(config.id);
      if (!data?.clippedFeatures?.features.length) continue;

      const groupBaseHeight = groupBaseHeights[config.group] || 0;
      if (!groupLayerCounts[config.group]) groupLayerCounts[config.group] = 0;
      const layerIndexInGroup = groupLayerCounts[config.group]++;

      const zOffset = groupBaseHeight + layerIndexInGroup * intraGroupSpacing;
      const features = data.clippedFeatures;

      switch (config.geometryType) {
        case 'polygon':
          layers.push(createExtractedPolygonLayer(config, features, zOffset, center));
          break;
        case 'line':
          layers.push(createExtractedLineLayer(config, features, zOffset, center));
          break;
        case 'point':
          layers.push(createExtractedPointLayer(config, features, zOffset, center));
          break;
      }
    }

    // Render custom layers at the top (only those with data and if custom group is enabled)
    const activeCustomLayers = customGroupEnabled ? customLayers.filter(l => {
      if (!activeLayers.includes(l.id)) return false;
      const data = layerData.get(l.id);
      // Custom layers use clippedFeatures if available, otherwise use all features
      const hasFeatures = data?.clippedFeatures?.features?.length || data?.features?.features?.length;
      return hasFeatures;
    }) : [];
    // cumulativeHeight already includes spacing after the last group, so just use it directly
    const customLayerBaseHeight = cumulativeHeight;

    activeCustomLayers.forEach((config, index) => {
      const data = layerData.get(config.id);
      // Custom layers use clippedFeatures if available, otherwise use all features
      const features = data?.clippedFeatures?.features.length ? data.clippedFeatures : data?.features;
      if (!features?.features.length) return;

      const zOffset = customLayerBaseHeight + index * intraGroupSpacing;

      switch (config.geometryType) {
        case 'polygon':
          layers.push(createExtractedPolygonLayer(config, features, zOffset, center));
          break;
        case 'line':
          layers.push(createExtractedLineLayer(config, features, zOffset, center));
          break;
        case 'point':
          layers.push(createExtractedPointLayer(config, features, zOffset, center));
          break;
      }
    });

    // Add custom layer platform if there are active custom layers with data
    if (showPlatforms && activeCustomLayers.length > 0) {
      const elevatedPolygon = localPolygon.map(ring =>
        ring.map((c: number[]) => [c[0], c[1], customLayerBaseHeight - 5])
      );

      layers.push(
        new PolygonLayer({
          id: 'extracted-platform-custom',
          data: [{ polygon: elevatedPolygon }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getPolygon: (d: any) => d.polygon,
          getFillColor: [255, 165, 0, 40] as [number, number, number, number], // Orange for custom
          getLineColor: [255, 165, 0, 150] as [number, number, number, number],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          filled: true,
          stroked: true,
          extruded: false,
          pickable: false,
        })
      );
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

    // Add highlight layer for clicked object
    if (highlightedObject) {
      const highlightColor: [number, number, number, number] = [255, 200, 50, 200];
      const highlightLineColor: [number, number, number, number] = [255, 200, 50, 255];

      if (highlightedObject.polygon) {
        layers.push(
          new PolygonLayer({
            id: 'highlight-polygon',
            data: [{ polygon: highlightedObject.polygon }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPolygon: (d: any) => d.polygon,
            getFillColor: highlightColor,
            getLineColor: highlightLineColor,
            getLineWidth: 3,
            lineWidthUnits: 'pixels',
            filled: true,
            stroked: true,
            extruded: false,
            pickable: false,
          })
        );
      } else if (highlightedObject.path) {
        layers.push(
          new PathLayer({
            id: 'highlight-path',
            data: [{ path: highlightedObject.path }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPath: (d: any) => d.path,
            getColor: highlightLineColor,
            getWidth: 6,
            widthUnits: 'pixels',
            pickable: false,
          })
        );
      } else if (highlightedObject.position) {
        layers.push(
          new SimpleMeshLayer({
            id: 'highlight-point',
            data: [{ position: highlightedObject.position }],
            mesh: createSphereMesh(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPosition: (d: any) => d.position,
            getColor: highlightLineColor,
            getScale: [18, 18, 18],
            pickable: false,
          })
        );
      }
    }

    return layers;
  }, [selectionPolygon, layerData, activeLayers, layerOrder, layerSpacing, intraGroupRatio, pinnedInfos, enabledGroups, center, showPlatforms, highlightedObject, customLayers, customGroupEnabled]);

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
      <div
        ref={touchContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none', // Prevent browser handling of touch events
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <DeckGL
          ref={deckRef}
          views={new OrbitView({ id: 'orbit', orbitAxis: 'Z' })}
          viewState={viewState}
          onViewStateChange={onViewStateChange}
          onWebGLInitialized={handleWebGLInitialized}
          onError={handleError}
          onHover={onHover}
          onClick={onClick}
          controller={false}
          layers={extractedLayers}
          getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grab'}
          style={{ position: 'absolute', top: '0', left: '0', width: '100%', height: '100%' }}
        />
      </div>

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
            {getLayerConfigById(hoveredLayerId || '')?.name || 'Feature'}
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
        // Get initial position from ref or fallback
        const initialPos = pinnedScreenPositionsRef.current[pinned.id] || pinned.initialScreenPos;
        const cardX = initialPos.x + 20;
        const cardY = initialPos.y - 10;

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
                id={`pinned-line-${pinned.id}`}
                x1={initialPos.x}
                y1={initialPos.y}
                x2={cardX}
                y2={cardY + 20}
                stroke="rgba(255, 200, 50, 0.8)"
                strokeWidth="2"
                strokeDasharray="4,2"
              />
              {/* Small circle at object location */}
              <circle
                cx={initialPos.x}
                cy={initialPos.y}
                r="5"
                fill="rgba(255, 200, 50, 1)"
                stroke="white"
                strokeWidth="2"
              />
            </svg>

            {/* Info Card - uses transform for smooth updates */}
            <div
              id={`pinned-card-${pinned.id}`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate(${cardX}px, ${cardY}px)`,
                willChange: 'transform',
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
                  {getLayerConfigById(pinned.layerId)?.name || 'Feature'}
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

interface ExtractedViewProps {
  isMobile?: boolean;
}

export function ExtractedView({ isMobile = false }: ExtractedViewProps) {
  const {
    layerData,
    activeLayers,
    selectionPolygon,
    isExtractedViewOpen,
    setExtractedViewOpen,
    layerOrder,
    customLayers,
    selectionLocationName,
    setSelectionLocationName,
  } = useStore();

  // Mobile settings panel collapsed state
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

  // Save state and toast notification
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  });

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
  const viewContainerRef = useRef<HTMLDivElement>(null);
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

  const center = useMemo((): [number, number] => {
    if (!selectionPolygon) {
      return [0, 0];
    }
    return getCentroid(selectionPolygon.geometry);
  }, [selectionPolygon]);

  // Exploded view config (always on)
  const [layerSpacing, setLayerSpacing] = useState(80);
  const [intraGroupRatio, setIntraGroupRatio] = useState(0.3); // Ratio of layer spacing for intra-group spacing

  // Local group visibility state (independent from main view)
  const [enabledGroups, setEnabledGroups] = useState<Set<string>>(() => {
    return new Set(layerManifest.groups.map(g => g.id));
  });

  // Custom group visibility (separate from manifest groups)
  const [customGroupEnabled, setCustomGroupEnabled] = useState(true);

  // Toggle a group's visibility
  const toggleGroup = useCallback((groupId: string) => {
    setEnabledGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Toggle for showing/hiding group platform rectangles
  const [showPlatforms, setShowPlatforms] = useState(true);

  // Calculate estimated total height for orbit view target
  const totalHeight = useMemo(() => {
    // Rough estimate: 5 groups * layerSpacing
    return layerSpacing * 5;
  }, [layerSpacing]);

  // Local view state for extracted view - OrbitView for true 3D navigation
  const [localViewState, setLocalViewState] = useState<OrbitViewState>({
    target: [0, 0, totalHeight / 2], // Center on the middle of the exploded layers
    rotationX: 45, // Vertical rotation (like pitch)
    rotationOrbit: -30, // Horizontal rotation (like bearing)
    zoom: 0, // OrbitView zoom is different - 0 is neutral
    minZoom: -2,
    maxZoom: 5,
  });

  // Reset view state when extracted view is opened
  useEffect(() => {
    if (isExtractedViewOpen && selectionPolygon && viewBounds) {
      // Reset to default orbit view
      setLocalViewState({
        target: [0, 0, totalHeight / 2],
        rotationX: 45,
        rotationOrbit: -30,
        zoom: 0,
        minZoom: -2,
        maxZoom: 5,
      });
    }
  }, [isExtractedViewOpen, totalHeight]); // Only trigger on open/close

  // Update view target height when layer spacing changes (while view is open)
  useEffect(() => {
    if (isExtractedViewOpen) {
      setLocalViewState((prev) => ({
        ...prev,
        target: [0, 0, totalHeight / 2],
      }));
    }
  }, [totalHeight, isExtractedViewOpen]);

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
    if (vs) {
      // OrbitView viewState update - pass through directly for responsiveness
      setLocalViewState((prev) => ({
        ...prev,
        target: vs.target ?? prev.target,
        rotationX: vs.rotationX ?? prev.rotationX,
        rotationOrbit: vs.rotationOrbit ?? prev.rotationOrbit,
        zoom: vs.zoom ?? prev.zoom,
      }));
    }
  }, []);

  // Save image function - captures the 3D view with location name overlay
  const saveImage = useCallback(async () => {
    if (!viewContainerRef.current) return;

    setIsSaving(true);
    setSaveToast({ show: true, message: 'Saving image...', type: 'success' });

    // Small delay to show the saving state
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Find the DeckGL canvas inside the container
      const deckCanvas = viewContainerRef.current.querySelector('canvas');
      if (!deckCanvas) {
        throw new Error('Canvas not found');
      }

      // Create a new canvas to composite the image
      const outputCanvas = document.createElement('canvas');
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not create canvas context');
      }

      // Set output canvas size to match the DeckGL canvas
      outputCanvas.width = deckCanvas.width;
      outputCanvas.height = deckCanvas.height;

      // Draw the DeckGL canvas
      ctx.drawImage(deckCanvas, 0, 0);

      // Draw the location name if present
      if (selectionLocationName) {
        const scale = window.devicePixelRatio || 1;
        const padding = 16 * scale;
        const fontSize = 14 * scale;

        // Draw background
        ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
        const textMetrics = ctx.measureText(selectionLocationName);
        const bgWidth = textMetrics.width + 24 * scale;
        const bgHeight = fontSize + 12 * scale;
        const bgX = padding;
        const bgY = outputCanvas.height - padding - bgHeight;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 8 * scale);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = scale;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = 'white';
        ctx.fillText(selectionLocationName, bgX + 12 * scale, bgY + fontSize + 3 * scale);
      }

      // Create download link
      const link = document.createElement('a');
      const filename = selectionLocationName
        ? `axoncity-${selectionLocationName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`
        : `axoncity-extracted-view-${Date.now()}.png`;
      link.download = filename;
      link.href = outputCanvas.toDataURL('image/png');
      link.click();

      // Show success message
      setSaveToast({ show: true, message: `Saved as ${filename}`, type: 'success' });

      // Auto-hide toast after 3 seconds
      setTimeout(() => {
        setSaveToast(prev => ({ ...prev, show: false }));
      }, 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveToast({ show: true, message: 'Failed to save image', type: 'error' });

      // Auto-hide error toast after 3 seconds
      setTimeout(() => {
        setSaveToast(prev => ({ ...prev, show: false }));
      }, 3000);
    } finally {
      setIsSaving(false);
    }
  }, [selectionLocationName]);

  // Don't render anything if closed or no selection
  if (!isExtractedViewOpen || !selectionPolygon) return null;

  // Mobile: fullscreen
  const containerStyle: React.CSSProperties = isMobile ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(20, 20, 30, 0.98)',
    borderRadius: 0,
    boxShadow: 'none',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } : {
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
  };

  return (
    <div
      ref={panelRef}
      className={isMobile ? 'extracted-view-mobile' : ''}
      style={containerStyle}
    >
      {/* Header */}
      <div
        className="extracted-view-header"
        style={{
          padding: isMobile ? '12px 16px' : '12px 16px',
          paddingTop: isMobile ? 'calc(12px + env(safe-area-inset-top, 0px))' : '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: isMobile ? 'default' : 'move',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onMouseDown={isMobile ? undefined : startDrag}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'white', fontWeight: '600', fontSize: isMobile ? '16px' : '14px' }}>
            3D View
          </span>
          {!isMobile && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>
              {size.width}×{size.height}
            </span>
          )}
        </div>

        <div className="extracted-view-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Desktop spacing controls */}
          {!isMobile && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '11px' }}>
                Group:
                <input
                  type="range"
                  min="30"
                  max="200"
                  value={layerSpacing}
                  onChange={(e) => setLayerSpacing(Number(e.target.value))}
                  style={{ width: '60px', cursor: 'pointer' }}
                />
                <span style={{ width: '70px', fontSize: '10px' }}>{layerSpacing}m / {Math.round(layerSpacing * 3.28084)}ft</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '11px' }}>
                Layer:
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  value={intraGroupRatio}
                  onChange={(e) => setIntraGroupRatio(Number(e.target.value))}
                  style={{ width: '60px', cursor: 'pointer' }}
                />
                <span style={{ width: '70px', fontSize: '10px' }}>{Math.round(layerSpacing * intraGroupRatio)}m / {Math.round(layerSpacing * intraGroupRatio * 3.28084)}ft</span>
              </label>
            </>
          )}

          {/* Mobile settings toggle */}
          {isMobile && (
            <button
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              style={{
                padding: '10px 14px',
                backgroundColor: isSettingsExpanded ? 'rgba(74, 144, 217, 0.8)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                minHeight: '44px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
              {isSettingsExpanded ? 'Hide' : 'Settings'}
            </button>
          )}

          <button
            onClick={saveImage}
            disabled={isSaving}
            style={{
              padding: isMobile ? '10px 16px' : '4px 8px',
              backgroundColor: isSaving ? 'rgba(74, 144, 217, 0.5)' : 'rgba(74, 144, 217, 0.8)',
              color: 'white',
              border: 'none',
              borderRadius: isMobile ? '8px' : '4px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Save as PNG image"
          >
            {isSaving && (
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            )}
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          <button
            onClick={() => setExtractedViewOpen(false)}
            style={{
              padding: isMobile ? '10px 16px' : '4px 8px',
              backgroundColor: 'rgba(255, 100, 100, 0.8)',
              color: 'white',
              border: 'none',
              borderRadius: isMobile ? '8px' : '4px',
              cursor: 'pointer',
              fontSize: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Mobile collapsible settings panel */}
      {isMobile && isSettingsExpanded && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Group spacing row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', minWidth: '80px' }}>Group Spacing</span>
            <input
              type="range"
              min="30"
              max="200"
              value={layerSpacing}
              onChange={(e) => setLayerSpacing(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', height: '24px' }}
            />
            <span style={{ color: 'white', fontSize: '13px', minWidth: '40px', textAlign: 'right' }}>{layerSpacing}m</span>
          </div>

          {/* Layer spacing row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', minWidth: '80px' }}>Layer Spacing</span>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={intraGroupRatio}
              onChange={(e) => setIntraGroupRatio(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', height: '24px' }}
            />
            <span style={{ color: 'white', fontSize: '13px', minWidth: '40px', textAlign: 'right' }}>{Math.round(layerSpacing * intraGroupRatio)}m</span>
          </div>

          {/* Tilt row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', minWidth: '80px' }}>Tilt</span>
            <input
              type="range"
              min="0"
              max="90"
              value={localViewState.rotationX}
              onChange={(e) => setLocalViewState((prev) => ({ ...prev, rotationX: Number(e.target.value) }))}
              style={{ flex: 1, cursor: 'pointer', height: '24px' }}
            />
            <span style={{ color: 'white', fontSize: '13px', minWidth: '40px', textAlign: 'right' }}>{localViewState.rotationX.toFixed(0)}°</span>
          </div>

          {/* Rotate row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', minWidth: '80px' }}>Rotate</span>
            <input
              type="range"
              min="-180"
              max="180"
              value={localViewState.rotationOrbit}
              onChange={(e) => setLocalViewState((prev) => ({ ...prev, rotationOrbit: Number(e.target.value) }))}
              style={{ flex: 1, cursor: 'pointer', height: '24px' }}
            />
            <span style={{ color: 'white', fontSize: '13px', minWidth: '40px', textAlign: 'right' }}>{localViewState.rotationOrbit.toFixed(0)}°</span>
          </div>

          {/* Camera presets row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', minWidth: '80px' }}>Presets</span>
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              {[
                { label: 'Top', rotationX: 90, rotationOrbit: 0 },
                { label: 'Axon', rotationX: 45, rotationOrbit: -30 },
                { label: 'Side', rotationX: 5, rotationOrbit: 0 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setLocalViewState((prev) => ({ ...prev, rotationX: preset.rotationX, rotationOrbit: preset.rotationOrbit }))}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    backgroundColor:
                      localViewState.rotationX === preset.rotationX && localViewState.rotationOrbit === preset.rotationOrbit
                        ? '#4A90D9'
                        : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    minHeight: '44px',
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Camera controls - desktop only */}
      {!isMobile && (
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
            Tilt:
            <input
              type="range"
              min="0"
              max="90"
              value={localViewState.rotationX}
              onChange={(e) => setLocalViewState((prev) => ({ ...prev, rotationX: Number(e.target.value) }))}
              style={{ width: '60px', cursor: 'pointer' }}
            />
            <span style={{ width: '25px' }}>{localViewState.rotationX.toFixed(0)}°</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '11px' }}>
            Rotate:
            <input
              type="range"
              min="-180"
              max="180"
              value={localViewState.rotationOrbit}
              onChange={(e) => setLocalViewState((prev) => ({ ...prev, rotationOrbit: Number(e.target.value) }))}
              style={{ width: '60px', cursor: 'pointer' }}
            />
            <span style={{ width: '30px' }}>{localViewState.rotationOrbit.toFixed(0)}°</span>
          </label>

          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { label: 'Top', rotationX: 90, rotationOrbit: 0 },
              { label: 'Axon', rotationX: 45, rotationOrbit: -30 },
              { label: 'Side', rotationX: 5, rotationOrbit: 0 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => setLocalViewState((prev) => ({ ...prev, rotationX: preset.rotationX, rotationOrbit: preset.rotationOrbit }))}
                style={{
                  padding: '3px 8px',
                  backgroundColor:
                    localViewState.rotationX === preset.rotationX && localViewState.rotationOrbit === preset.rotationOrbit
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
      )}

      {/* Group layer toggles */}
      <div
        style={{
          padding: '8px 16px',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', marginRight: '4px' }}>Groups:</span>
        {layerManifest.groups.map((group) => {
          const isEnabled = enabledGroups.has(group.id);
          const groupColor = `rgb(${group.color.join(',')})`;
          return (
            <button
              key={group.id}
              onClick={() => toggleGroup(group.id)}
              style={{
                padding: '4px 10px',
                backgroundColor: isEnabled ? groupColor : 'rgba(60,60,60,0.8)',
                color: isEnabled ? 'white' : 'rgba(255,255,255,0.4)',
                border: `1px solid ${isEnabled ? groupColor : 'rgba(100,100,100,0.5)'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: isEnabled ? '600' : '400',
                transition: 'all 0.15s ease',
                opacity: isEnabled ? 1 : 0.6,
              }}
            >
              {group.name}
            </button>
          );
        })}

        {/* Custom group toggle (only show if there are custom layers) */}
        {customLayers.length > 0 && (
          <button
            onClick={() => setCustomGroupEnabled(!customGroupEnabled)}
            style={{
              padding: '4px 10px',
              backgroundColor: customGroupEnabled ? 'rgb(255, 165, 0)' : 'rgba(60,60,60,0.8)',
              color: customGroupEnabled ? 'white' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${customGroupEnabled ? 'rgb(255, 165, 0)' : 'rgba(100,100,100,0.5)'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: customGroupEnabled ? '600' : '400',
              transition: 'all 0.15s ease',
              opacity: customGroupEnabled ? 1 : 0.6,
            }}
          >
            Custom
          </button>
        )}

        {/* Separator */}
        <div style={{ width: '1px', height: '20px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />

        {/* Platform toggle */}
        <button
          onClick={() => setShowPlatforms(!showPlatforms)}
          style={{
            padding: '4px 10px',
            backgroundColor: showPlatforms ? 'rgba(100, 150, 255, 0.8)' : 'rgba(60,60,60,0.8)',
            color: showPlatforms ? 'white' : 'rgba(255,255,255,0.4)',
            border: `1px solid ${showPlatforms ? 'rgba(100, 150, 255, 1)' : 'rgba(100,100,100,0.5)'}`,
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: showPlatforms ? '600' : '400',
            transition: 'all 0.15s ease',
            opacity: showPlatforms ? 1 : 0.6,
          }}
        >
          Platforms
        </button>
      </div>

      {/* 3D View */}
      <div ref={viewContainerRef} style={{ flex: 1, position: 'relative', backgroundColor: '#1a1a2e' }}>
        <DeckGLView
          key={`deck-${openCount}`}
          viewState={localViewState}
          onViewStateChange={handleViewStateChange}
          selectionPolygon={selectionPolygon}
          layerData={layerData}
          activeLayers={activeLayers}
          layerOrder={layerOrder}
          layerSpacing={layerSpacing}
          intraGroupRatio={intraGroupRatio}
          center={center}
          enabledGroups={enabledGroups}
          showPlatforms={showPlatforms}
          customLayers={customLayers}
          customGroupEnabled={customGroupEnabled}
        />

        {/* Location name overlay for screenshots - editable */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <input
            type="text"
            value={selectionLocationName || ''}
            onChange={(e) => setSelectionLocationName(e.target.value || null)}
            placeholder="Enter location name..."
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: '14px',
              fontWeight: '500',
              letterSpacing: '0.5px',
              width: '180px',
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              opacity: 0.5,
              whiteSpace: 'nowrap',
            }}
          >
          </span>
        </div>

        {/* Save toast notification */}
        {saveToast.show && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: saveToast.type === 'success' ? 'rgba(40, 167, 69, 0.95)' : 'rgba(220, 53, 69, 0.95)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px',
              fontWeight: '500',
              zIndex: 100,
              animation: 'fadeInDown 0.3s ease',
              maxWidth: '90%',
              textAlign: 'center',
            }}
          >
            {isSaving ? (
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            ) : saveToast.type === 'success' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span style={{ wordBreak: 'break-word' }}>{saveToast.message}</span>
          </div>
        )}
      </div>

      {/* Resize handles - only on desktop */}
      {!isMobile && (
        <>
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
        </>
      )}
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

// Layer creation helpers - now accept center for local coordinate conversion
function createExtractedPolygonLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  center: [number, number]
): Layer {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];

  if (config.id.startsWith('buildings-') || config.id === 'buildings') {
    // Special handling for buildings (all building types)
    const buildingData = features.features
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f, index) => {
        const coords = (f.geometry as Polygon).coordinates[0];
        const height = getBuildingHeight(f.properties || {});
        return {
          polygon: coords.map((c) => {
            const [x, y] = geoToLocal(c[0], c[1], center[0], center[1]);
            return [x, y, zOffset + 50];
          }),
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
      autoHighlight: false,
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
          polygon: coords.map((c) => {
            const [x, y] = geoToLocal(c[0], c[1], center[0], center[1]);
            return [x, y, baseElevation];
          }),
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
      autoHighlight: false,
    });
  }

  // Default polygon handling - convert to local coordinates
  const polygonData = features.features
    .filter((f) => f.geometry.type === 'Polygon')
    .map((f, index) => {
      const coords = (f.geometry as Polygon).coordinates[0];
      return {
        polygon: coords.map((c) => {
          const [x, y] = geoToLocal(c[0], c[1], center[0], center[1]);
          return [x, y, zOffset + 10];
        }),
        properties: f.properties,
        feature: f,
        id: f.id || index,
      };
    });

  return new PolygonLayer({
    id: `extracted-${config.id}`,
    data: polygonData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPolygon: (d: any) => d.polygon,
    getFillColor: fillColor,
    getLineColor: style.strokeColor,
    getLineWidth: style.strokeWidth,
    lineWidthUnits: 'pixels',
    extruded: false,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 100],
  });
}

function createExtractedLineLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  center: [number, number]
): Layer {
  const { style } = config;
  const color = [...style.strokeColor] as [number, number, number, number];

  const pathData = features.features
    .filter((f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
    .flatMap((f) => {
      if (f.geometry.type === 'LineString') {
        return [{
          path: (f.geometry as LineString).coordinates.map((c) => {
            const [x, y] = geoToLocal(c[0], c[1], center[0], center[1]);
            return [x, y, zOffset];
          }),
          properties: f.properties,
          feature: f,
        }];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (f.geometry as any).coordinates.map((coords: number[][]) => ({
        path: coords.map((c: number[]) => {
          const [x, y] = geoToLocal(c[0], c[1], center[0], center[1]);
          return [x, y, zOffset];
        }),
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
    autoHighlight: false,
  });
}

function createExtractedPointLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  center: [number, number]
): Layer {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];

  const pointData = features.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => {
      const coords = (f.geometry as Point).coordinates;
      const [x, y] = geoToLocal(coords[0], coords[1], center[0], center[1]);
      return {
        position: [x, y, zOffset + 20],
        properties: f.properties,
        feature: f,
      };
    });

  return new SimpleMeshLayer({
    id: `extracted-${config.id}`,
    data: pointData,
    mesh: createSphereMesh(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPosition: (d: any) => d.position,
    getColor: fillColor,
    getScale: [12, 12, 12],
    pickable: true,
    autoHighlight: false,
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

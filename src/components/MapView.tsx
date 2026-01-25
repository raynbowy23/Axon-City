import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import MapGL, { type MapRef } from 'react-map-gl/maplibre';
import DeckGL, { type DeckGLRef } from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import type { PickingInfo, Layer } from '@deck.gl/core';
import type { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useStore } from '../store/useStore';
import { layerManifest, getLayersByCustomOrder } from '../data/layerManifest';
import { setMapInstance, setDeckCanvas } from '../utils/mapRef';
import {
  resizeRectangle,
  resizeCircle,
  getCircleCenter,
  getRectangleCorners,
} from '../utils/shapeGeometry';
import type { LayerData, LayerGroup, AnyLayerConfig, MapStyleType, ComparisonArea, SelectedFeature } from '../types';

// Map style URLs - all free and publicly available
const MAP_STYLES: Record<MapStyleType, string> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};

// Custom satellite style configuration using ESRI World Imagery
const SATELLITE_STYLE = {
  version: 8 as const,
  name: 'Satellite',
  sources: {
    'satellite-tiles': {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [
    {
      id: 'satellite-layer',
      type: 'raster' as const,
      source: 'satellite-tiles',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};


interface LayerRenderInfo {
  config: AnyLayerConfig;
  data: LayerData;
  zOffset: number;
  groupIndex: number;
}

export function MapView() {
  const {
    viewState,
    setViewState,
    mapStyle,
    mapLanguage,
    layerData,
    activeLayers,
    explodedView,
    hoveredLayerId,
    setHoveredLayerId,
    isolatedLayerId,
    selectionPolygon,
    isDrawing,
    drawingPoints,
    editableVertices,
    setEditableVertices,
    updateVertex,
    addVertex,
    removeVertex,
    draggingVertexIndex,
    setDraggingVertexIndex,
    setSelectionPolygon,
    selectedFeatures,
    layerOrder,
    customLayers,
    // Multi-area support
    areas,
    activeAreaId,
    setActiveAreaId,
    // Loading state
    isLoading,
    // Visual settings
    globalOpacity,
    layerStyleOverrides,
  } = useStore();

  // Create areas layer separately to avoid it being affected by drawing state
  const areasLayer = useMemo(() => {
    if (areas.length === 0) return null;


    const areaFeatures = areas.map((area: ComparisonArea) => ({
      type: 'Feature' as const,
      properties: {
        id: area.id,
        name: area.name,
        isActive: area.id === activeAreaId,
        color: area.color,
      },
      geometry: area.polygon.geometry,
    }));

    return new GeoJsonLayer({
      id: 'comparison-areas',
      data: {
        type: 'FeatureCollection',
        features: areaFeatures,
      },
      filled: true,
      stroked: true,
      getFillColor: (f: { properties: { color: number[]; isActive: boolean } }) => {
        const [r, g, b] = f.properties.color;
        return [r, g, b, f.properties.isActive ? 80 : 50];
      },
      getLineColor: (f: { properties: { color: number[] } }) => {
        const [r, g, b] = f.properties.color;
        return [r, g, b, 255];
      },
      getLineWidth: (f: { properties: { isActive: boolean } }) =>
        f.properties.isActive ? 5 : 3,
      lineWidthUnits: 'pixels',
      pickable: true,
      autoHighlight: !isLoading,
      highlightColor: [255, 255, 255, 50],
      onClick: (info: PickingInfo) => {
        // Don't allow area switching while loading
        if (isLoading) return;

        if (info.object?.properties?.id) {
          const clickedAreaId = info.object.properties.id;
          if (clickedAreaId !== activeAreaId) {
            setActiveAreaId(clickedAreaId);
          }
        }
      },
      updateTriggers: {
        data: [areas.length, areas.map((a: ComparisonArea) => a.id).join(',')],
        getFillColor: [activeAreaId],
        getLineColor: [areas.map((a: ComparisonArea) => a.id).join(',')],
        getLineWidth: [activeAreaId],
      },
    });
  }, [areas, activeAreaId, setActiveAreaId, isLoading]);

  // Get the current map style URL or configuration
  const currentMapStyle = useMemo(() => {
    if (mapStyle === 'satellite') {
      return SATELLITE_STYLE;
    }
    return MAP_STYLES[mapStyle as MapStyleType];
  }, [mapStyle]);

  const [hoveredFeature, setHoveredFeature] = useState<Feature | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);
  const [hoveredMidpointIndex, setHoveredMidpointIndex] = useState<number | null>(null);
  const lastVertexClickRef = useRef<{ index: number; time: number } | null>(null);
  const deckRef = useRef<DeckGLRef | null>(null);
  const mapRef = useRef<MapRef>(null);

  // Handler for when map loads
  const handleMapLoad = useCallback(() => {
    if (mapRef.current) {
      const map = mapRef.current.getMap();
      if (map) {
        setMapInstance(map);
        // Log canvas info for debugging
        const canvas = map.getCanvas();
        const gl = canvas?.getContext('webgl') || canvas?.getContext('webgl2');
        const attrs = gl?.getContextAttributes();
        console.log('Map instance registered for screenshot');
        console.log('Canvas preserveDrawingBuffer:', attrs?.preserveDrawingBuffer);
      }
    }
  }, []);

  // Register map instance for screenshot capture
  useEffect(() => {
    const checkAndSetMap = () => {
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        if (map) {
          setMapInstance(map);
        }
      }
      if (deckRef.current?.deck) {
        // Access canvas via type assertion - canvas is protected but we need it for snapshots
        const deckCanvas = (deckRef.current.deck as unknown as { canvas: HTMLCanvasElement | null }).canvas;
        if (deckCanvas) {
          setDeckCanvas(deckCanvas);
        }
      }
    };

    // Check immediately and after a short delay (for async loading)
    checkAndSetMap();
    const timer = setTimeout(checkAndSetMap, 1000);
    const timer2 = setTimeout(checkAndSetMap, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      setMapInstance(null);
      setDeckCanvas(null);
    };
  }, []);

  // Pinned feature info (clicked to stick) - stores geographic coordinates and initial screen position
  interface PinnedInfo {
    id: string;
    feature: Feature;
    layerId: string;
    coordinates: [number, number]; // [longitude, latitude]
    initialScreenPos: { x: number; y: number }; // fallback position
  }
  const [pinnedInfos, setPinnedInfos] = useState<PinnedInfo[]>([]);

  // Helper to get layer config by ID (from manifest or custom layers)
  const getLayerConfigById = useCallback((layerId: string): AnyLayerConfig | undefined => {
    // Check manifest layers first
    const manifestLayer = layerManifest.layers.find((l: AnyLayerConfig) => l.id === layerId);
    if (manifestLayer) return manifestLayer;

    // Check custom layers
    return customLayers.find((l: AnyLayerConfig) => l.id === layerId);
  }, [customLayers]);

  // Calculate z-offset for a given layer based on current exploded view settings
  // This must match the logic in layerRenderInfo exactly
  const getLayerZOffset = useCallback((layerId: string): number => {
    if (!explodedView.enabled) return 0;

    const layerConfig = getLayerConfigById(layerId);
    if (!layerConfig) return 0;

    const groupSpacing = explodedView.layerSpacing;
    const intraGroupSpacing = explodedView.layerSpacing * explodedView.intraGroupRatio;

    // Check if this is a custom layer
    const isCustom = 'isCustom' in layerConfig && layerConfig.isCustom;

    // Get active manifest layer configs WITH DATA (same as layerRenderInfo)
    const sortedLayers = getLayersByCustomOrder(layerOrder);
    const activeManifestLayers = sortedLayers.filter((layer: AnyLayerConfig) => {
      if (!activeLayers.includes(layer.id)) return false;
      const data = layerData.get(layer.id);
      const hasFeatures = data?.features?.features?.length || data?.clippedFeatures?.features?.length;
      return hasFeatures;
    });

    // Get active custom layers WITH DATA
    const activeCustomLayers = customLayers.filter((layer: AnyLayerConfig) => {
      if (!activeLayers.includes(layer.id)) return false;
      const data = layerData.get(layer.id);
      const hasFeatures = data?.features?.features?.length || data?.clippedFeatures?.features?.length;
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
      // Only add space if the group has layers with data
      if (layerCount > 0) {
        cumulativeHeight += groupSpacing + layerCount * intraGroupSpacing;
      }
    }

    let zOffset: number;

    if (isCustom) {
      // Custom layers go at the top, above all manifest groups
      // cumulativeHeight already includes spacing after the last group, so just use it directly
      const customLayerBaseHeight = cumulativeHeight;
      const customLayerIndex = activeCustomLayers.findIndex((l: AnyLayerConfig) => l.id === layerId);
      zOffset = explodedView.baseElevation + customLayerBaseHeight + Math.max(0, customLayerIndex) * intraGroupSpacing;
    } else {
      // Get layer index within group (only counting layers with data)
      const activeLayersInGroup = activeManifestLayers.filter((l: AnyLayerConfig) => l.group === layerConfig.group);
      const layerIndexInGroup = activeLayersInGroup.findIndex((l: AnyLayerConfig) => l.id === layerId);
      zOffset = explodedView.baseElevation + groupBaseHeight + Math.max(0, layerIndexInGroup) * intraGroupSpacing;

      // Special handling for floating layers - match actual layer elevations
      const isBuildingLayer = layerId.startsWith('buildings-') || layerId === 'buildings';
      if (isBuildingLayer || layerId === 'parking') {
        // Buildings and parking float at minimum BUILDING_FLOAT_HEIGHT (80m) or zOffset
        zOffset = Math.max(80, zOffset);
      } else if (layerId === 'parks') {
        // Parks float at minimum 40m, or higher based on layer stacking
        zOffset = Math.max(40, zOffset);
      }
    }

    return zOffset;
  }, [explodedView, layerOrder, activeLayers, customLayers, layerData, getLayerConfigById]);

  // Track current screen positions of pinned features (updated when viewState changes)
  const [pinnedScreenPositions, setPinnedScreenPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Update pinned screen positions when viewState or exploded view changes
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
          // Get z-offset for this layer based on exploded view settings
          const zOffset = getLayerZOffset(pinned.layerId);
          // Project with 3D coordinates [lon, lat, z]
          const [x, y] = viewport.project([...pinned.coordinates, zOffset]);
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
  }, [viewState, pinnedInfos, explodedView, getLayerZOffset]);

  // Update map labels when language changes
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const updateLabels = () => {
      const style = map.getStyle();
      if (!style || !style.layers) return;

      // Determine the text field based on language setting
      const textField = mapLanguage === 'en'
        ? ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']]
        : ['get', 'name'];

      // Update all symbol layers that have text-field
      for (const layer of style.layers) {
        if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
          try {
            map.setLayoutProperty(layer.id, 'text-field', textField);
          } catch {
            // Some layers may not support this, ignore errors
          }
        }
      }
    };

    // Update labels when map style is loaded
    if (map.isStyleLoaded()) {
      updateLabels();
    } else {
      map.once('styledata', updateLabels);
    }
  }, [mapLanguage, mapStyle]);

  // Remove a pinned info
  const removePinnedInfo = useCallback((id: string) => {
    setPinnedInfos((prev) => prev.filter((p) => p.id !== id));
  }, []);

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

  // Combine layer data from all areas for multi-area display
  const combinedLayerData = useMemo(() => {
    const combined = new Map<string, LayerData>();

    // If we have areas, use their layer data (to avoid duplicates with global layerData)
    if (areas.length > 0) {
      // First collect all layer IDs from all areas
      const allLayerIds = new Set<string>();
      for (const area of areas) {
        for (const layerId of area.layerData.keys()) {
          allLayerIds.add(layerId);
        }
      }

      // For each layer, merge features from all areas
      for (const layerId of allLayerIds) {
        const allFeatures: Feature[] = [];

        for (const area of areas) {
          const areaData = area.layerData.get(layerId);
          if (areaData) {
            const features = areaData.clippedFeatures?.features || areaData.features?.features || [];
            allFeatures.push(...features);
          }
        }

        if (allFeatures.length > 0) {
          // Get base data structure from first area that has this layer
          const firstAreaWithData = areas.find((a: ComparisonArea) => a.layerData.has(layerId));
          const baseData = firstAreaWithData?.layerData.get(layerId);

          combined.set(layerId, {
            layerId,
            features: { type: 'FeatureCollection', features: allFeatures },
            clippedFeatures: { type: 'FeatureCollection', features: allFeatures },
            stats: baseData?.stats, // Stats would need recalculation for accuracy
          });
        }
      }

      // Also include custom layers from global layerData (they're not area-specific)
      for (const [layerId, data] of layerData.entries()) {
        if (!combined.has(layerId)) {
          combined.set(layerId, data);
        }
      }
    } else {
      // No areas - use global layerData as-is
      for (const [layerId, data] of layerData.entries()) {
        combined.set(layerId, data);
      }
    }

    return combined;
  }, [layerData, areas]);

  // Calculate layer render order and z-offsets with group-based separation
  const layerRenderInfo = useMemo((): LayerRenderInfo[] => {
    // Use custom layer order instead of static getSortedLayers()
    const sortedLayers = getLayersByCustomOrder(layerOrder);

    // Separate manifest and custom layers - only include those with actual data
    // Use combinedLayerData to include features from all areas
    const activeManifestLayers = sortedLayers.filter((layer: AnyLayerConfig) => {
      if (!activeLayers.includes(layer.id)) return false;
      const data = combinedLayerData.get(layer.id);
      // Check if layer has any features to render
      const hasFeatures = data?.features?.features?.length || data?.clippedFeatures?.features?.length;
      return hasFeatures;
    });
    const activeCustomLayers = customLayers.filter((layer: AnyLayerConfig) => {
      if (!activeLayers.includes(layer.id)) return false;
      const data = combinedLayerData.get(layer.id);
      // Custom layers can show all features or clipped features
      const hasFeatures = data?.features?.features?.length || data?.clippedFeatures?.features?.length;
      return hasFeatures;
    });

    // Calculate z-offsets based on group hierarchy
    const groupSpacing = explodedView.layerSpacing; // Base space between groups
    const intraGroupSpacing = explodedView.layerSpacing * explodedView.intraGroupRatio; // Small space within groups

    // Count layers WITH DATA per group (not just active layers)
    const activeLayersPerGroup: Record<string, number> = {};
    for (const config of activeManifestLayers) {
      activeLayersPerGroup[config.group] = (activeLayersPerGroup[config.group] || 0) + 1;
    }

    // Calculate cumulative group base heights to ensure no overlap
    // Each group starts after the previous group's layers end
    const groupBaseHeights: Record<LayerGroup, number> = {} as Record<LayerGroup, number>;
    let cumulativeHeight = 0;
    for (const groupId of layerOrder.groupOrder as LayerGroup[]) {
      groupBaseHeights[groupId] = cumulativeHeight;
      const layerCount = activeLayersPerGroup[groupId] || 0;
      // Only add space if the group has layers with data
      if (layerCount > 0) {
        cumulativeHeight += groupSpacing + layerCount * intraGroupSpacing;
      }
    }

    // Custom layers go at the TOP - above all manifest groups
    // cumulativeHeight already includes spacing after the last group, so just use it directly
    const customLayerBaseHeight = cumulativeHeight;

    // Track layer index within each group
    const groupLayerCounts: Record<string, number> = {};

    // Process manifest layers first
    const manifestLayerInfos = activeManifestLayers.map((config) => {
      const data = combinedLayerData.get(config.id);
      const groupBaseHeight = groupBaseHeights[config.group] || 0;

      // Get the index of this layer within its group
      if (!groupLayerCounts[config.group]) {
        groupLayerCounts[config.group] = 0;
      }
      const layerIndexInGroup = groupLayerCounts[config.group]++;

      // Calculate z-offset: group base height + layer offset within group
      const zOffset = explodedView.enabled
        ? explodedView.baseElevation + groupBaseHeight + layerIndexInGroup * intraGroupSpacing
        : 0;

      // Determine group index for coloring/identification
      const groupIndex = layerOrder.groupOrder.indexOf(config.group);

      return {
        config,
        data: data || { layerId: config.id, features: { type: 'FeatureCollection', features: [] } },
        zOffset,
        groupIndex,
      };
    });

    // Process custom layers - they go at the top
    const customLayerInfos = activeCustomLayers.map((config: AnyLayerConfig, index: number) => {
      const data = combinedLayerData.get(config.id);

      // Custom layers stack above all manifest layers
      const zOffset = explodedView.enabled
        ? explodedView.baseElevation + customLayerBaseHeight + index * intraGroupSpacing
        : 0;

      return {
        config,
        data: data || { layerId: config.id, features: { type: 'FeatureCollection', features: [] } },
        zOffset,
        groupIndex: -1, // Special index for custom layers
      };
    });

    // Return manifest layers first, then custom layers on top
    return [...manifestLayerInfos, ...customLayerInfos];
  }, [activeLayers, combinedLayerData, explodedView, layerOrder, customLayers]);

  // Handle hover
  const onHover = useCallback(
    (info: PickingInfo) => {
      if (info.layer) {
        const layerId = info.layer.id
          .replace('-elevated', '')
          .replace('-floating', '')
          .replace('-ground', '')
          .replace('-connectors', '')
          .replace('-platform', '')
          .replace('-selected', '');
        setHoveredLayerId(layerId);
        setHoveredFeature(info.object as Feature || null);
        setCursorPosition(info.x !== undefined ? { x: info.x, y: info.y } : null);
      } else {
        setHoveredLayerId(null);
        setHoveredFeature(null);
        setCursorPosition(null);
      }
    },
    [setHoveredLayerId]
  );

  // Handle click to pin feature info
  const onClick = useCallback(
    (info: PickingInfo) => {
      // Don't handle if in drawing mode or dragging vertices
      if (isDrawing || draggingVertexIndex !== null) return;

      // Don't handle vertex handles, midpoint handles, or comparison area polygons
      // (comparison areas have their own onClick handler for switching areas)
      if (
        info.layer?.id === 'vertex-handles' ||
        info.layer?.id === 'midpoint-handles' ||
        info.layer?.id === 'comparison-areas'
      ) return;

      if (info.object && info.layer && info.x !== undefined && info.y !== undefined) {
        const layerId = info.layer.id
          .replace('-elevated', '')
          .replace('-floating', '')
          .replace('-ground', '')
          .replace('-connectors', '')
          .replace('-platform', '')
          .replace('-selected', '');

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
          // Floating polygon layer (buildings, parks in exploded view) - has polygon array
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
          // Use click position for coordinates (will be converted back)
          coordinates = info.coordinate as [number, number] || [0, 0];
        }

        if (feature && coordinates) {
          // Create unique ID for pinned info
          const featureId = feature.id || feature.properties?.id || `${layerId}-${Date.now()}`;
          const pinnedId = `pinned-${featureId}-${Date.now()}`;

          // Check if this feature is already pinned (by comparing properties)
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
    },
    [isDrawing, draggingVertexIndex, pinnedInfos, getFeatureCentroid]
  );

  // Sync editable vertices when selection polygon changes
  useEffect(() => {
    if (selectionPolygon && !isDrawing) {
      // Extract vertices from polygon (excluding the closing point which duplicates the first)
      const coords = selectionPolygon.geometry.coordinates[0];
      const vertices = coords.slice(0, -1) as [number, number][];
      setEditableVertices(vertices);
    } else if (!selectionPolygon) {
      setEditableVertices([]);
    }
  }, [selectionPolygon, isDrawing, setEditableVertices]);

  // Handle drag start on vertex handles
  const onDragStart = useCallback(
    (info: PickingInfo) => {
      // Don't allow editing while loading
      if (isLoading) return false;

      if (info.layer?.id === 'vertex-handles' && info.index !== undefined) {
        setDraggingVertexIndex(info.index);
        return true; // Prevent map panning
      }
      return false;
    },
    [setDraggingVertexIndex, isLoading]
  );

  // Handle drag movement - with shape-preserving logic for rectangles and circles
  const onDrag = useCallback(
    (info: PickingInfo) => {
      if (draggingVertexIndex !== null && info.coordinate) {
        const [lng, lat] = info.coordinate;
        const newPosition: [number, number] = [lng, lat];

        // Check shape type for shape-preserving behavior
        const shapeType = selectionPolygon?.shapeType;

        if (shapeType === 'rectangle' && editableVertices.length === 4) {
          // Use stored original corners for edge directions (keeps rectangle orientation stable)
          // Use current vertices for actual corner positions
          const originalCorners = selectionPolygon?.shapeParams?.rectangleCorners;
          const currentCorners = getRectangleCorners(editableVertices);

          if (originalCorners && currentCorners) {
            const { corners: newCorners } = resizeRectangle(
              draggingVertexIndex,
              newPosition,
              originalCorners,
              currentCorners
            );
            // Update all vertices at once
            setEditableVertices([...newCorners]);
          } else if (currentCorners) {
            // Fallback: use current corners for both
            const { corners: newCorners } = resizeRectangle(draggingVertexIndex, newPosition, currentCorners);
            setEditableVertices([...newCorners]);
          }
        } else if (shapeType === 'circle') {
          // Get circle center and resize
          const center = selectionPolygon?.shapeParams?.circleCenter || getCircleCenter(editableVertices);
          const { polygon: newCircle } = resizeCircle(newPosition, center);
          const newCoords = newCircle.coordinates[0].slice(0, -1) as [number, number][];
          setEditableVertices(newCoords);
        } else {
          // Default polygon behavior - free vertex editing
          updateVertex(draggingVertexIndex, newPosition);
        }
      }
    },
    [draggingVertexIndex, updateVertex, selectionPolygon, editableVertices, setEditableVertices]
  );

  // Handle drag end - update the selection polygon with shape info preserved
  const onDragEnd = useCallback(() => {
    if (draggingVertexIndex !== null && editableVertices.length >= 3) {
      const shapeType = selectionPolygon?.shapeType;

      let newPolygon: Polygon;
      let newShapeParams = selectionPolygon?.shapeParams;

      if (shapeType === 'rectangle' && editableVertices.length === 4) {
        // Rectangle: store updated corners
        newPolygon = {
          type: 'Polygon',
          coordinates: [[...editableVertices, editableVertices[0]]],
        };
        newShapeParams = {
          rectangleCorners: [
            editableVertices[0],
            editableVertices[1],
            editableVertices[2],
            editableVertices[3],
          ] as [[number, number], [number, number], [number, number], [number, number]],
        };
      } else if (shapeType === 'circle') {
        // Circle: update center (stays same) and radius
        const center = selectionPolygon?.shapeParams?.circleCenter || getCircleCenter(editableVertices);
        const edgePoint = editableVertices[0];
        const dLng = edgePoint[0] - center[0];
        const dLat = edgePoint[1] - center[1];
        const latCorrectionFactor = Math.cos((center[1] * Math.PI) / 180);
        const radius = Math.sqrt((dLng * latCorrectionFactor) ** 2 + dLat ** 2);

        newPolygon = {
          type: 'Polygon',
          coordinates: [[...editableVertices, editableVertices[0]]],
        };
        newShapeParams = {
          circleCenter: center,
          circleRadius: radius,
        };
      } else {
        // Default polygon
        newPolygon = {
          type: 'Polygon',
          coordinates: [[...editableVertices, editableVertices[0]]],
        };
      }

      // Calculate new area
      const area = editableVertices.length >= 3 ? calculatePolygonAreaFromCoords(editableVertices) : 0;

      setSelectionPolygon({
        id: selectionPolygon?.id || `selection-${Date.now()}`,
        geometry: newPolygon,
        area,
        shapeType: shapeType,
        shapeParams: newShapeParams,
      });

      setDraggingVertexIndex(null);
    }
  }, [draggingVertexIndex, editableVertices, selectionPolygon, setSelectionPolygon, setDraggingVertexIndex]);

  // Helper to update polygon after vertex add/remove
  const updatePolygonFromVertices = useCallback((vertices: [number, number][]) => {
    if (vertices.length >= 3) {
      const newPolygon: Polygon = {
        type: 'Polygon',
        coordinates: [[...vertices, vertices[0]]],
      };
      const area = calculatePolygonAreaFromCoords(vertices);
      setSelectionPolygon({
        id: selectionPolygon?.id || `selection-${Date.now()}`,
        geometry: newPolygon,
        area,
      });
    }
  }, [selectionPolygon, setSelectionPolygon]);

  // Handle adding a vertex at midpoint (only for polygons, not rectangles/circles)
  const handleAddVertex = useCallback((afterIndex: number, position: [number, number]) => {
    // Don't allow adding vertices to rectangles or circles - it would break the shape
    const shapeType = selectionPolygon?.shapeType;
    if (shapeType === 'rectangle' || shapeType === 'circle') return;

    addVertex(afterIndex, position);
    // Update polygon with new vertices (need to include the new vertex)
    const newVertices = [...editableVertices];
    newVertices.splice(afterIndex + 1, 0, position);
    updatePolygonFromVertices(newVertices);
  }, [addVertex, editableVertices, updatePolygonFromVertices, selectionPolygon]);

  // Handle removing a vertex (only for polygons, not rectangles/circles)
  const handleRemoveVertex = useCallback((index: number) => {
    // Don't allow removing vertices from rectangles or circles - it would break the shape
    const shapeType = selectionPolygon?.shapeType;
    if (shapeType === 'rectangle' || shapeType === 'circle') return;

    if (editableVertices.length <= 3) return; // Can't remove if only 3 vertices
    removeVertex(index);
    // Update polygon with remaining vertices
    const newVertices = editableVertices.filter((_: [number, number], i: number) => i !== index);
    updatePolygonFromVertices(newVertices);
  }, [removeVertex, editableVertices, updatePolygonFromVertices, selectionPolygon]);

  // Handle vertex click with double-click detection for removal
  // Use ref-based pattern to store handleRemoveVertex and avoid ref access during render
  const handleRemoveVertexRef = useRef(handleRemoveVertex);
  useEffect(() => {
    handleRemoveVertexRef.current = handleRemoveVertex;
  }, [handleRemoveVertex]);

  // Stable callback with empty deps - refs are only accessed when called (event handler), not during render
  const handleVertexClick = useCallback((index: number, canRemove: boolean) => {
    if (!canRemove) return;

    const now = Date.now();
    const lastClick = lastVertexClickRef.current;
    // Detect double-click (within 300ms on same vertex)
    if (lastClick && lastClick.index === index && now - lastClick.time < 300) {
      handleRemoveVertexRef.current(index);
      lastVertexClickRef.current = null;
    } else {
      lastVertexClickRef.current = { index, time: now };
    }
  }, []);

  // Create deck.gl layers
  const deckLayers = useMemo((): Layer[] => {
    const layers: Layer[] = [];

    // Areas are rendered via areasLayer (separate useMemo) - added at the end

    // Selection polygon preview during drawing or for active area
    if (selectionPolygon) {
      // Check if this polygon is already in the areas array
      const matchingArea = areas.find(
        (area: ComparisonArea) => area.polygon.id === selectionPolygon.id
      );

      if (!matchingArea) {
        // Not yet an area - show preview with blue color
        const nextAreaIndex = areas.length;
        const previewColor = nextAreaIndex < 4
          ? [59, 130, 246] // Blue for next area
          : [100, 150, 255]; // Default blue

        layers.push(
          new PolygonLayer({
            id: 'selection-polygon-preview',
            data: [selectionPolygon.geometry],
            getPolygon: (d: Polygon) => d.coordinates[0],
            getFillColor: [...previewColor, 50] as [number, number, number, number],
            getLineColor: [...previewColor, 255] as [number, number, number, number],
            getLineWidth: 3,
            lineWidthUnits: 'pixels',
            filled: true,
            stroked: true,
            pickable: false,
          })
        );
      } else {
        // This polygon belongs to an area - render it with the area's color
        // This ensures the active area polygon is always visible even if areasLayer has issues
        const [r, g, b] = matchingArea.color;
        const isActive = matchingArea.id === activeAreaId;

        layers.push(
          new PolygonLayer({
            id: 'active-area-polygon',
            data: [selectionPolygon.geometry],
            getPolygon: (d: Polygon) => d.coordinates[0],
            getFillColor: [r, g, b, isActive ? 80 : 50] as [number, number, number, number],
            getLineColor: [r, g, b, 255] as [number, number, number, number],
            getLineWidth: isActive ? 5 : 3,
            lineWidthUnits: 'pixels',
            filled: true,
            stroked: true,
            pickable: false,
          })
        );
      }
    }

    // Add group platform layers when exploded view is enabled
    if (explodedView.enabled && selectionPolygon) {
      // Get the minimum z-offset for each active group from layerRenderInfo
      const groupMinZOffsets: Record<string, number> = {};
      for (const info of layerRenderInfo) {
        const hasFeatures = info.data.features.features.length > 0 || info.data.clippedFeatures?.features.length;
        if (!hasFeatures) continue;

        if (groupMinZOffsets[info.config.group] === undefined || info.zOffset < groupMinZOffsets[info.config.group]) {
          groupMinZOffsets[info.config.group] = info.zOffset;
        }
      }

      for (const group of layerManifest.groups) {
        if (groupMinZOffsets[group.id] === undefined) continue;

        const zOffset = groupMinZOffsets[group.id];

        // Create a subtle platform for each group
        layers.push(
          new PolygonLayer({
            id: `platform-${group.id}`,
            data: [selectionPolygon.geometry],
            getPolygon: (d: Polygon) => d.coordinates,
            getFillColor: [...group.color, 30] as [number, number, number, number],
            getLineColor: [...group.color, 100] as [number, number, number, number],
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
            filled: true,
            stroked: true,
            getElevation: zOffset - 5, // Slightly below the layers
            extruded: false,
            pickable: false,
          })
        );
      }
    }

    // Render each data layer
    for (const { config, data, zOffset } of layerRenderInfo) {
      // Skip if isolated and not this layer
      if (isolatedLayerId && isolatedLayerId !== config.id) {
        continue;
      }

      // Check if this is a custom layer
      const isCustom = 'isCustom' in config && config.isCustom;

      // Determine which features to use
      // Custom layers: show clipped features if selection exists and has clipped data, otherwise show all features
      // Manifest layers: show clipped features if selection exists, otherwise show fetched features
      let features;
      if (isCustom) {
        // Custom layers: use clipped features when available, otherwise use all features
        features = (selectionPolygon && data.clippedFeatures && data.clippedFeatures.features.length > 0)
          ? data.clippedFeatures
          : data.features;
      } else {
        features = selectionPolygon && data.clippedFeatures
          ? data.clippedFeatures
          : data.features;
      }

      if (!features || features.features.length === 0) continue;

      const isHovered = hoveredLayerId === config.id;
      // Apply global opacity and layer-specific overrides
      const layerOverride = layerStyleOverrides.get(config.id);
      const layerOpacity = layerOverride?.opacity ?? 100;
      const baseOpacity = isHovered ? 1.0 : 0.85;
      const opacity = baseOpacity * (globalOpacity / 100) * (layerOpacity / 100);

      // Apply color override if exists
      const effectiveConfig = layerOverride?.fillColor
        ? {
            ...config,
            style: {
              ...config.style,
              fillColor: layerOverride.fillColor,
            },
          }
        : config;

      // Ground shadow/reference layer (subtle reference at z=0 when exploded)
      if (explodedView.enabled && zOffset > 0) {
        layers.push(
          createGroundShadowLayer(effectiveConfig, features, 0.15)
        );
      }

      // Main elevated layer
      switch (effectiveConfig.geometryType) {
        case 'polygon':
          // Use specialized layer functions for buildings and parking
          if (effectiveConfig.id.startsWith('buildings-') || effectiveConfig.id === 'buildings') {
            layers.push(
              ...createBuildingLayer(effectiveConfig, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // No vertical connectors for floating buildings
          } else if (effectiveConfig.id === 'parking') {
            layers.push(
              ...createParkingLayer(effectiveConfig, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // No vertical connectors for floating parking
          } else if (effectiveConfig.id === 'parks') {
            layers.push(
              ...createParkLayer(effectiveConfig, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // No vertical connectors for floating parks
          } else {
            layers.push(
              createPolygonLayer(effectiveConfig, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // Vertical connectors for other polygons (parks, land use, etc.)
            if (explodedView.enabled && zOffset > 0) {
              layers.push(
                createVerticalConnectors(effectiveConfig, features, zOffset, 'polygon')
              );
            }
          }
          break;
        case 'line':
          layers.push(
            createLineLayer(effectiveConfig, features, zOffset, opacity, isHovered)
          );
          // Vertical connectors for lines (at endpoints)
          if (explodedView.enabled && zOffset > 0) {
            layers.push(
              createVerticalConnectors(effectiveConfig, features, zOffset, 'line')
            );
          }
          break;
        case 'point':
          layers.push(
            createPointLayer(effectiveConfig, features, zOffset, opacity, isHovered, explodedView.enabled)
          );
          // Vertical connectors for points
          if (explodedView.enabled && zOffset > 0) {
            layers.push(
              createVerticalConnectors(effectiveConfig, features, zOffset, 'point')
            );
          }
          break;
      }
    }

    // Drawing corner markers - rendered LAST to appear on top of all layers
    if (isDrawing && drawingPoints.length > 0) {
      // Corner data with metadata for styling
      const cornerData = drawingPoints.map((point: [number, number], index: number) => ({
        position: point,
        index: index + 1,
        isFirst: index === 0,
        isLast: index === drawingPoints.length - 1,
      }));

      // Draw connecting lines between corner points
      if (drawingPoints.length > 1) {
        const pathData = drawingPoints.map((point: [number, number], index: number) => ({
          path: index < drawingPoints.length - 1
            ? [point, drawingPoints[index + 1]]
            : null,
        })).filter((d: { path: [number, number][] | null }) => d.path !== null);

        layers.push(
          new PathLayer({
            id: `drawing-lines-${drawingPoints.length}`,
            data: pathData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPath: (d: any) => d.path,
            getColor: [65, 135, 255, 255],
            getWidth: 3,
            widthUnits: 'pixels' as const,
            pickable: false,
            updateTriggers: {
              getPath: [drawingPoints.length, JSON.stringify(drawingPoints)],
            },
          })
        );
      }

      // Draw corner nodes - first point is green (close polygon), others are blue
      layers.push(
        new ScatterplotLayer({
          id: `drawing-corners-${drawingPoints.length}`,
          data: cornerData,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getPosition: (d: any) => d.position,
          // First point is green to indicate polygon close point
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getFillColor: (d: any) => d.isFirst ? [0, 220, 100, 255] : [65, 135, 255, 255],
          getLineColor: [255, 255, 255, 255],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getRadius: (d: any) => d.isFirst ? 14 : 12,
          radiusUnits: 'pixels' as const,
          filled: true,
          stroked: true,
          lineWidthMinPixels: 3,
          pickable: false,
          updateTriggers: {
            getPosition: [drawingPoints.length, JSON.stringify(drawingPoints)],
            getFillColor: [drawingPoints.length],
            getRadius: [drawingPoints.length],
          },
        })
      );

    }

    // Editable vertex handles - shown when selection exists and not drawing
    if (!isDrawing && editableVertices.length > 0) {
      // For rectangles and circles, don't allow vertex removal (would break shape)
      const currentShapeType = selectionPolygon?.shapeType;
      const isShapePreserving = currentShapeType === 'rectangle' || currentShapeType === 'circle';

      const vertexData = editableVertices.map((vertex: [number, number], index: number) => ({
        position: vertex,
        index,
        canRemove: !isShapePreserving && editableVertices.length > 3 && !isLoading,
      }));

      // Calculate midpoints for adding new vertices
      const midpointData = editableVertices.map((vertex: [number, number], index: number) => {
        const nextVertex = editableVertices[(index + 1) % editableVertices.length];
        return {
          position: [(vertex[0] + nextVertex[0]) / 2, (vertex[1] + nextVertex[1]) / 2] as [number, number],
          afterIndex: index,
        };
      });

      // Draw polygon edges with editable style
      if (editableVertices.length > 1) {
        const edgeData = editableVertices.map((vertex: [number, number], index: number) => ({
          path: [vertex, editableVertices[(index + 1) % editableVertices.length]],
        }));

        layers.push(
          new PathLayer({
            id: 'editable-edges',
            data: edgeData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPath: (d: any) => d.path,
            // Grey when loading, orange when editable
            getColor: isLoading ? [150, 150, 150, 180] : [255, 200, 50, 255],
            getWidth: 3,
            widthUnits: 'pixels' as const,
            pickable: false,
          })
        );
      }

      // Midpoint handles for adding new vertices (hidden when loading or for rectangles/circles)
      // Rectangles and circles use shape-preserving edits, so adding vertices is not allowed
      const shapeType = selectionPolygon?.shapeType;
      const allowAddVertex = !isLoading && shapeType !== 'rectangle' && shapeType !== 'circle';

      if (allowAddVertex) {
        layers.push(
          new ScatterplotLayer({
            id: 'midpoint-handles',
            data: midpointData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPosition: (d: any) => d.position,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getFillColor: (d: any) =>
              d.afterIndex === hoveredMidpointIndex
                ? [100, 200, 255, 255] // Light blue when hovered
                : [100, 200, 255, 150], // Semi-transparent light blue
            getLineColor: [255, 255, 255, 200],
            getRadius: 8,
            radiusUnits: 'pixels' as const,
            filled: true,
            stroked: true,
            lineWidthMinPixels: 2,
            pickable: true,
            onHover: (info: PickingInfo) => {
              setHoveredMidpointIndex(info.object?.afterIndex ?? null);
            },
            onClick: (info: PickingInfo) => {
              if (info.object && info.coordinate) {
                handleAddVertex(info.object.afterIndex, info.coordinate as [number, number]);
              }
            },
            updateTriggers: {
              getFillColor: [hoveredMidpointIndex],
            },
          })
        );
      }

      // Draggable vertex handles (double-click to remove)
      /* eslint-disable react-hooks/refs -- ref access is in onClick handler, not during render */
      layers.push(
        new ScatterplotLayer({
          id: 'vertex-handles',
          data: vertexData,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getPosition: (d: any) => d.position,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getFillColor: (d: any) =>
            isLoading
              ? [150, 150, 150, 200] // Grey when loading
              : d.index === draggingVertexIndex
              ? [255, 100, 100, 255] // Red when dragging
              : d.index === hoveredVertexIndex
              ? d.canRemove
                ? [255, 150, 100, 255] // Orange-red when hovered and can remove
                : [255, 255, 100, 255] // Yellow when hovered but can't remove
              : [255, 200, 50, 255], // Orange default
          getLineColor: isLoading ? [200, 200, 200, 200] : [255, 255, 255, 255],
          getRadius: 14,
          radiusUnits: 'pixels' as const,
          filled: true,
          stroked: true,
          lineWidthMinPixels: 3,
          pickable: !isLoading, // Not pickable when loading
          onHover: (info: PickingInfo) => {
            if (!isLoading) {
              setHoveredVertexIndex(info.index ?? null);
            }
          },
          onClick: (info: PickingInfo) => {
            // Don't allow removal while loading
            if (isLoading) return;

            if (info.object) {
              handleVertexClick(info.object.index, info.object.canRemove);
            }
          },
          updateTriggers: {
            getFillColor: [draggingVertexIndex, hoveredVertexIndex, editableVertices.length, isLoading],
            getLineColor: [isLoading],
            pickable: [isLoading],
          },
        })
      );
      /* eslint-enable react-hooks/refs */
    }

    // Render selected features with distinct colors (on top of everything)
    if (selectedFeatures.length > 0) {
      // Render each selected feature with its unique color and stacked elevation
      selectedFeatures.forEach((selection: SelectedFeature, selectionIndex: number) => {
        const layerConfig = layerRenderInfo.find((l) => l.config.id === selection.layerId);
        const baseZOffset = layerConfig?.zOffset || 0;
        // Add incremental elevation offset for each selection to prevent z-fighting
        const selectionElevationOffset = (selectionIndex + 1) * 15;

        const geometryType = selection.feature.geometry.type;

        if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
          // Render outline only (no fill) to avoid visual stacking
          layers.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            new GeoJsonLayer<any>({
              id: `selected-polygon-outline-${selection.id}`,
              data: { type: 'FeatureCollection', features: [selection.feature] },
              filled: false,
              stroked: true,
              getLineColor: selection.color,
              getLineWidth: 6,
              lineWidthUnits: 'pixels',
              getElevation: baseZOffset + selectionElevationOffset,
              extruded: false,
              pickable: false,
            })
          );

          // Add a pulsing/glowing effect layer with thinner line
          layers.push(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            new GeoJsonLayer<any>({
              id: `selected-polygon-glow-${selection.id}`,
              data: { type: 'FeatureCollection', features: [selection.feature] },
              filled: false,
              stroked: true,
              getLineColor: [...selection.color.slice(0, 3), 100] as [number, number, number, number],
              getLineWidth: 12,
              lineWidthUnits: 'pixels',
              getElevation: baseZOffset + selectionElevationOffset - 1,
              extruded: false,
              pickable: false,
            })
          );

          // Add colored marker at centroid to identify each selection
          const coords = (selection.feature.geometry as Polygon).coordinates[0];
          if (coords && coords.length > 0) {
            // Calculate centroid
            let sumX = 0, sumY = 0;
            for (const coord of coords) {
              sumX += coord[0];
              sumY += coord[1];
            }
            const centroid: [number, number] = [sumX / coords.length, sumY / coords.length];

            layers.push(
              new ScatterplotLayer({
                id: `selected-polygon-marker-${selection.id}`,
                data: [{ position: centroid }],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getPosition: (d: any) => d.position,
                getFillColor: selection.color,
                getLineColor: [255, 255, 255, 255],
                getRadius: 16,
                radiusUnits: 'pixels' as const,
                filled: true,
                stroked: true,
                lineWidthMinPixels: 3,
                pickable: false,
              })
            );
          }
        } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
          const coords = (selection.feature.geometry as LineString).coordinates;

          // Outer glow
          layers.push(
            new PathLayer({
              id: `selected-line-glow-${selection.id}`,
              data: [{ path: coords.map((c) => [...c, baseZOffset + selectionElevationOffset]) }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getPath: (d: any) => d.path,
              getColor: [...selection.color.slice(0, 3), 100] as [number, number, number, number],
              getWidth: 14,
              widthUnits: 'pixels' as const,
              pickable: false,
            })
          );

          // Main colored line
          layers.push(
            new PathLayer({
              id: `selected-line-${selection.id}`,
              data: [{ path: coords.map((c) => [...c, baseZOffset + selectionElevationOffset + 1]) }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getPath: (d: any) => d.path,
              getColor: selection.color,
              getWidth: 8,
              widthUnits: 'pixels' as const,
              pickable: false,
            })
          );

          // Add marker at midpoint
          if (coords.length >= 2) {
            const midIndex = Math.floor(coords.length / 2);
            const midpoint = coords[midIndex];

            layers.push(
              new ScatterplotLayer({
                id: `selected-line-marker-${selection.id}`,
                data: [{ position: midpoint }],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                getPosition: (d: any) => d.position,
                getFillColor: selection.color,
                getLineColor: [255, 255, 255, 255],
                getRadius: 12,
                radiusUnits: 'pixels' as const,
                filled: true,
                stroked: true,
                lineWidthMinPixels: 2,
                pickable: false,
              })
            );
          }
        } else if (geometryType === 'Point') {
          const coords = (selection.feature.geometry as Point).coordinates;
          const elevation = explodedView.enabled ? baseZOffset + 25 + selectionElevationOffset : 15 + selectionElevationOffset;

          // Larger highlighted sphere
          layers.push(
            new SimpleMeshLayer({
              id: `selected-point-${selection.id}`,
              data: [{ position: [...coords, elevation] }],
              mesh: getSphereMesh(),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getPosition: (d: any) => d.position,
              getColor: selection.color,
              getScale: [22, 22, 22],
              pickable: false,
            })
          );

          // Add ring around the point for extra visibility
          layers.push(
            new ScatterplotLayer({
              id: `selected-point-ring-${selection.id}`,
              data: [{ position: coords }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getPosition: (d: any) => d.position,
              getFillColor: [0, 0, 0, 0],
              getLineColor: selection.color,
              getRadius: 20,
              radiusUnits: 'pixels' as const,
              filled: false,
              stroked: true,
              lineWidthMinPixels: 4,
              pickable: false,
            })
          );
        }
      });
    }

    // Render pinned feature highlights (like autoHighlight but persistent)
    if (pinnedInfos.length > 0) {
      pinnedInfos.forEach((pinned, pinnedIndex) => {
        const layerConfig = layerRenderInfo.find((l) => l.config.id === pinned.layerId);
        const baseZOffset = layerConfig?.zOffset || 0;
        const pinnedElevationOffset = (pinnedIndex + 1) * 5;
        // Yellow highlight color matching autoHighlight
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
              getElevation: baseZOffset + pinnedElevationOffset + 2,
              extruded: false,
              pickable: false,
            })
          );
        } else if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
          // Highlight for lines - thicker bright line
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
          const elevation = explodedView.enabled ? baseZOffset + 25 + pinnedElevationOffset : 15 + pinnedElevationOffset;

          // Highlighted sphere
          layers.push(
            new SimpleMeshLayer({
              id: `pinned-point-${pinned.id}`,
              data: [{ position: [...coords, elevation] }],
              mesh: getSphereMesh(),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getPosition: (d: any) => d.position,
              getColor: highlightLineColor,
              getScale: [20, 20, 20],
              pickable: false,
            })
          );

          // Ring around point
          layers.push(
            new ScatterplotLayer({
              id: `pinned-point-ring-${pinned.id}`,
              data: [{ position: coords }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              getPosition: (d: any) => d.position,
              getFillColor: [0, 0, 0, 0],
              getLineColor: highlightLineColor,
              getRadius: 22,
              radiusUnits: 'pixels' as const,
              filled: false,
              stroked: true,
              lineWidthMinPixels: 4,
              pickable: false,
            })
          );
        }
      });
    }

    // Add areasLayer at the beginning so it renders below other layers
    if (areasLayer) {
      layers.unshift(areasLayer);
    }

    return layers;
  }, [layerRenderInfo, selectionPolygon, hoveredLayerId, isolatedLayerId, explodedView, isDrawing, drawingPoints, editableVertices, draggingVertexIndex, hoveredVertexIndex, hoveredMidpointIndex, handleAddVertex, handleVertexClick, selectedFeatures, pinnedInfos, areasLayer, isLoading, globalOpacity, layerStyleOverrides, activeAreaId, areas]);

  const onViewStateChange = useCallback(
    (params: { viewState: Record<string, unknown> }) => {
      const newViewState = params.viewState;
      if (newViewState) {
        setViewState({
          longitude: newViewState.longitude as number,
          latitude: newViewState.latitude as number,
          zoom: newViewState.zoom as number,
          pitch: (newViewState.pitch as number) || 0,
          bearing: (newViewState.bearing as number) || 0,
          maxPitch: 89,
          minPitch: 0,
        });
      }
    },
    [setViewState]
  );

  // Memoize controller to prevent DeckGL re-initialization
  // Enable two-finger pitch control like Google Maps
  const controller = useMemo(() => ({
    dragRotate: draggingVertexIndex === null,
    touchRotate: draggingVertexIndex === null,
    touchZoom: draggingVertexIndex === null,
    touchPitch: draggingVertexIndex === null, // Two-finger vertical drag to tilt
    keyboard: true,
    dragPan: draggingVertexIndex === null,
    inertia: true, // Smooth momentum after gestures
  }), [draggingVertexIndex]);

  // Memoize getCursor function
  const getCursor = useCallback(
    ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
      draggingVertexIndex !== null
        ? 'grabbing'
        : hoveredVertexIndex !== null
        ? 'grab'
        : isDrawing
        ? 'crosshair'
        : isDragging
        ? 'grabbing'
        : isHovering
        ? 'pointer'
        : 'grab',
    [draggingVertexIndex, hoveredVertexIndex, isDrawing]
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={controller}
        layers={deckLayers}
        onHover={onHover}
        onClick={onClick}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        getCursor={getCursor}
      >
        <MapGL
          ref={mapRef}
          mapStyle={currentMapStyle}
          maxPitch={89}
          minPitch={0}
          onLoad={handleMapLoad}
        />
      </DeckGL>

      {/* Hover Tooltip */}
      {hoveredFeature && cursorPosition && (
        <div
          style={{
            position: 'absolute',
            left: cursorPosition.x + 10,
            top: cursorPosition.y + 10,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            maxWidth: '250px',
            zIndex: 1000,
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
                  <div key={key} style={{ fontSize: '11px', opacity: 0.8 }}>
                    {key}: {String(value)}
                  </div>
                ))}
            </div>
          )}
          <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '4px' }}>
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
                zIndex: 1000,
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
                r="6"
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
                fontSize: '12px',
                maxWidth: '260px',
                zIndex: 1001,
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
                    fontSize: '16px',
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
                      <div key={key} style={{ fontSize: '11px', opacity: 0.85, marginBottom: '2px' }}>
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
    </div>
  );
}

// Calculate polygon area from coordinates (in m²)
function calculatePolygonAreaFromCoords(coords: [number, number][]): number {
  if (coords.length < 3) return 0;

  // Using the Shoelace formula with coordinate conversion
  // This is a simplified calculation - for more accuracy, use turf.js
  const R = 6371000; // Earth's radius in meters

  let area = 0;
  const n = coords.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[j];

    // Convert to radians
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const lon1Rad = (lon1 * Math.PI) / 180;
    const lon2Rad = (lon2 * Math.PI) / 180;

    area += (lon2Rad - lon1Rad) * (2 + Math.sin(lat1Rad) + Math.sin(lat2Rad));
  }

  area = Math.abs((area * R * R) / 2);
  return area;
}

// Helper functions to create layers
function createPolygonLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean,
  isExploded: boolean
): Layer {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  // Use layer's configured extrusion height, or add small height when exploded
  const configuredHeight = config.style.extrusionHeight || 0;
  const extrusionHeight = isExploded ? Math.max(8, configuredHeight) : configuredHeight;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new GeoJsonLayer<any>({
    id: `${config.id}-elevated`,
    data: features,
    filled: true,
    stroked: true,
    getFillColor: fillColor,
    getLineColor: isHovered
      ? [255, 255, 255, 255]
      : style.strokeColor,
    getLineWidth: isHovered ? style.strokeWidth * 2 : style.strokeWidth,
    lineWidthUnits: 'pixels',
    getElevation: zOffset + extrusionHeight,
    extruded: extrusionHeight > 0 || isExploded,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 100],
  });
}

function createLineLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  _isHovered: boolean
) {
  const { style } = config;
  const color = [...style.strokeColor] as [number, number, number, number];
  color[3] = Math.floor(color[3] * opacity);

  // Extract coordinates from features
  const pathData = features.features
    .filter((f) => f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
    .flatMap((f) => {
      if (f.geometry.type === 'LineString') {
        return [{
          path: (f.geometry as LineString).coordinates.map((c) => [...c, zOffset]),
          properties: f.properties,
        }];
      }
      // MultiLineString
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (f.geometry as any).coordinates.map((coords: number[][]) => ({
        path: coords.map((c: number[]) => [...c, zOffset]),
        properties: f.properties,
      }));
    });

  return new PathLayer({
    id: `${config.id}-elevated`,
    data: pathData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPath: (d: any) => d.path,
    getColor: color,
    getWidth: style.strokeWidth,
    widthUnits: 'pixels' as const,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 255], // Bright yellow for individual road highlight
  });
}

// Sphere mesh will be created lazily
let sphereMesh: SphereGeometry | null = null;

function getSphereMesh(): SphereGeometry {
  if (!sphereMesh) {
    sphereMesh = new SphereGeometry({
      radius: 1,
      nlat: 16,
      nlong: 16,
    });
  }
  return sphereMesh;
}

function createPointLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  _isHovered: boolean,
  isExploded: boolean
) {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  // Elevation height for 3D spheres
  const elevation = isExploded ? zOffset + 25 : 15; // meters above ground

  const pointData = features.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => ({
      position: [...(f.geometry as Point).coordinates, elevation],
      properties: f.properties,
    }));

  // Scale for 3D spheres (in meters)
  const sphereScale = isExploded ? 15 : 10;

  return new SimpleMeshLayer({
    id: `${config.id}-elevated`,
    data: pointData,
    mesh: getSphereMesh(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPosition: (d: any) => d.position,
    getColor: fillColor,
    getScale: [sphereScale, sphereScale, sphereScale],
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 255], // Bright yellow for individual sphere highlight
  });
}

function createGroundShadowLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  opacity: number
): Layer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new GeoJsonLayer<any>({
    id: `${config.id}-ground`,
    data: features,
    filled: true,
    stroked: false,
    getFillColor: [80, 80, 80, Math.floor(255 * opacity)],
    getElevation: 0,
    pickable: false,
  });
}

function createVerticalConnectors(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  geometryType: 'polygon' | 'line' | 'point'
) {
  const connectorData: { path: number[][] }[] = [];
  const maxConnectors = 50; // Limit for performance
  let count = 0;

  for (const feature of features.features) {
    if (count >= maxConnectors) break;

    if (geometryType === 'polygon' && feature.geometry.type === 'Polygon') {
      const coords = (feature.geometry as Polygon).coordinates[0];
      // Use just 2 corners per polygon for cleaner look
      const corners = [coords[0], coords[Math.floor(coords.length / 2)]];
      for (const corner of corners) {
        if (count >= maxConnectors) break;
        connectorData.push({
          path: [
            [...corner, 0],
            [...corner, zOffset],
          ],
        });
        count++;
      }
    } else if (geometryType === 'line' && feature.geometry.type === 'LineString') {
      const coords = (feature.geometry as LineString).coordinates;
      // Connect at start and end of line
      if (coords.length >= 2) {
        connectorData.push({
          path: [
            [...coords[0], 0],
            [...coords[0], zOffset],
          ],
        });
        count++;
        if (count < maxConnectors) {
          connectorData.push({
            path: [
              [...coords[coords.length - 1], 0],
              [...coords[coords.length - 1], zOffset],
            ],
          });
          count++;
        }
      }
    } else if (geometryType === 'point' && feature.geometry.type === 'Point') {
      const coords = (feature.geometry as Point).coordinates;
      connectorData.push({
        path: [
          [...coords, 0],
          [...coords, zOffset],
        ],
      });
      count++;
    }
  }

  // Get group color for connectors
  const group = layerManifest.groups.find(g => g.id === config.group);
  const connectorColor = group
    ? [...group.color, 60] as [number, number, number, number]
    : [150, 150, 150, 60] as [number, number, number, number];

  return new PathLayer({
    id: `${config.id}-connectors`,
    data: connectorData,
    getPath: (d) => d.path,
    getColor: connectorColor,
    getWidth: 1,
    widthUnits: 'pixels' as const,
    pickable: false,
  });
}

// Helper to get building height from properties
function getBuildingHeight(props: Record<string, unknown>): number {
  // Try to get actual height
  if (props.height) {
    const h = parseFloat(props.height as string);
    if (!isNaN(h)) return h;
  }
  // Estimate from building levels (average 3.5m per level)
  if (props['building:levels'] || props.levels) {
    const levels = parseInt((props['building:levels'] || props.levels) as string);
    if (!isNaN(levels)) return levels * 3.5;
  }
  // Default height based on building type
  const buildingType = props.building as string;
  if (buildingType === 'yes' || !buildingType) return 8;
  if (['apartments', 'residential', 'house'].includes(buildingType)) return 12;
  if (['commercial', 'office', 'retail'].includes(buildingType)) return 20;
  if (['industrial', 'warehouse'].includes(buildingType)) return 15;
  return 8;
}

// Minimum floating height for buildings when in exploded view
const BUILDING_FLOAT_HEIGHT = 80; // meters above ground

// Specialized layer for buildings - floating in exploded view
function createBuildingLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean,
  isExploded: boolean
): Layer[] {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  if (isExploded) {
    // Floating buildings - render as flat polygons at elevation (no ground extrusion)
    const buildingData = features.features
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f, index) => {
        const coords = (f.geometry as Polygon).coordinates[0];
        const height = getBuildingHeight(f.properties || {});
        // Ensure minimum floating height + zOffset + small per-building offset to prevent z-fighting
        const baseElevation = Math.max(BUILDING_FLOAT_HEIGHT, zOffset) + (index % 10) * 0.5;
        return {
          polygon: coords.map((c) => [c[0], c[1], baseElevation]),
          height: height * 0.4, // Thinner floating blocks
          properties: f.properties,
          id: f.id || index,
        };
      });

    return [
      new PolygonLayer({
        id: `${config.id}-floating`,
        data: buildingData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPolygon: (d: any) => d.polygon,
        getFillColor: fillColor,
        getLineColor: isHovered ? [255, 255, 255, 255] : style.strokeColor,
        getLineWidth: isHovered ? 2 : 1,
        lineWidthUnits: 'pixels' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getElevation: (d: any) => d.height,
        extruded: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 100, 100],
      }),
    ];
  }

  // Non-exploded: traditional ground-based extrusion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [new GeoJsonLayer<any>({
    id: `${config.id}-elevated`,
    data: features,
    filled: true,
    stroked: true,
    getFillColor: fillColor,
    getLineColor: isHovered ? [255, 255, 255, 255] : style.strokeColor,
    getLineWidth: isHovered ? style.strokeWidth * 2 : style.strokeWidth,
    lineWidthUnits: 'pixels',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getElevation: (f: any) => getBuildingHeight(f.properties || {}),
    extruded: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 100],
  })];
}

// Helper to get parking height from properties
function getParkingHeight(props: Record<string, unknown>): number {
  // Multi-story parking
  if (props.parking === 'multi-storey' || props.building === 'parking') {
    const levels = parseInt((props['building:levels'] || props.levels || '3') as string);
    return levels * 3;
  }
  // Surface parking - flat
  return 3;
}

// Specialized layer for parking - floating in exploded view (same height as buildings)
function createParkingLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean,
  isExploded: boolean
): Layer[] {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  if (isExploded) {
    // Floating parking - flat polygons at same height as buildings
    const parkingData = features.features
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f, index) => {
        const coords = (f.geometry as Polygon).coordinates[0];
        // Use same floating height as buildings + small per-parking offset to prevent z-fighting
        const baseElevation = Math.max(BUILDING_FLOAT_HEIGHT, zOffset) + (index % 10) * 0.3;
        return {
          polygon: coords.map((c) => [c[0], c[1], baseElevation]),
          height: 2, // Thin floating parking blocks
          properties: f.properties,
          id: f.id || index,
        };
      });

    return [
      new PolygonLayer({
        id: `${config.id}-floating`,
        data: parkingData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPolygon: (d: any) => d.polygon,
        getFillColor: isHovered ? [100, 149, 237, 200] : fillColor,
        getLineColor: isHovered ? [255, 255, 255, 255] : [255, 255, 255, 180],
        getLineWidth: isHovered ? 3 : 2,
        lineWidthUnits: 'pixels' as const,
        extruded: false,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 100, 100],
      }),
    ];
  }

  // Non-exploded: traditional ground-based extrusion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [new GeoJsonLayer<any>({
    id: `${config.id}-elevated`,
    data: features,
    filled: true,
    stroked: true,
    getFillColor: isHovered ? [100, 149, 237, 200] : fillColor,
    getLineColor: isHovered ? [255, 255, 255, 255] : [255, 255, 255, 180],
    getLineWidth: isHovered ? 3 : 2,
    lineWidthUnits: 'pixels',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getElevation: (f: any) => getParkingHeight(f.properties || {}),
    extruded: true,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 100],
  })];
}

// Floating height for parks - below buildings
const PARK_FLOAT_HEIGHT = 40; // meters above ground (below buildings at 80m)
const PARK_THICKNESS = 5; // meters thick

// Specialized layer for parks - floating in exploded view (below buildings, with thickness)
function createParkLayer(
  config: AnyLayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean,
  isExploded: boolean
): Layer[] {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  if (isExploded) {
    // Floating parks - polygons below buildings with some thickness
    const parkData = features.features
      .filter((f) => f.geometry.type === 'Polygon')
      .map((f, index) => {
        const coords = (f.geometry as Polygon).coordinates[0];
        // Float below buildings + small per-park offset to prevent z-fighting
        const baseElevation = Math.max(PARK_FLOAT_HEIGHT, zOffset) + (index % 10) * 0.3;
        return {
          polygon: coords.map((c) => [c[0], c[1], baseElevation]),
          properties: f.properties,
          id: f.id || index,
        };
      });

    return [
      new PolygonLayer({
        id: `${config.id}-floating`,
        data: parkData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPolygon: (d: any) => d.polygon,
        getFillColor: isHovered ? [100, 200, 100, 200] : fillColor,
        getLineColor: isHovered ? [255, 255, 255, 255] : style.strokeColor,
        getLineWidth: isHovered ? 3 : 2,
        lineWidthUnits: 'pixels' as const,
        getElevation: PARK_THICKNESS,
        extruded: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 100, 100],
      }),
    ];
  }

  // Non-exploded: flat polygon layer (parks don't need extrusion)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [new GeoJsonLayer<any>({
    id: `${config.id}-elevated`,
    data: features,
    filled: true,
    stroked: true,
    getFillColor: isHovered ? [100, 200, 100, 200] : fillColor,
    getLineColor: isHovered ? [255, 255, 255, 255] : style.strokeColor,
    getLineWidth: isHovered ? 2 : 1,
    lineWidthUnits: 'pixels',
    extruded: false,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 100, 100],
  })];
}

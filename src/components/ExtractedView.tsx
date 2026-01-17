import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import type { Layer } from '@deck.gl/core';
import type { FeatureCollection, Polygon, MultiPolygon, LineString, Point } from 'geojson';

import { useStore } from '../store/useStore';
import { getLayersByCustomOrder, layerManifest } from '../data/layerManifest';
import type { LayerConfig, LayerGroup, ViewState } from '../types';

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

// Sphere mesh for points
let sphereMesh: SphereGeometry | null = null;
function getSphereMesh(): SphereGeometry {
  if (!sphereMesh) {
    sphereMesh = new SphereGeometry({ radius: 1, nlat: 16, nlong: 16 });
  }
  return sphereMesh;
}

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

  const panelRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  // Local view state for extracted view (always exploded)
  const [localViewState, setLocalViewState] = useState<ViewState>({
    longitude: selectionPolygon ? getCentroid(selectionPolygon.geometry)[0] : 0,
    latitude: selectionPolygon ? getCentroid(selectionPolygon.geometry)[1] : 0,
    zoom: 16,
    pitch: 60,
    bearing: -30,
    maxPitch: 89,
    minPitch: 0,
  });

  // Exploded view config (always on)
  const [layerSpacing, setLayerSpacing] = useState(80);

  // Update view center when selection changes
  useEffect(() => {
    if (selectionPolygon && isExtractedViewOpen) {
      const [lon, lat] = getCentroid(selectionPolygon.geometry);
      setLocalViewState((prev) => ({
        ...prev,
        longitude: lon,
        latitude: lat,
      }));
    }
  }, [selectionPolygon, isExtractedViewOpen]);

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

  // Build layers for the extracted view
  const extractedLayers = useMemo((): Layer[] => {
    if (!selectionPolygon) return [];

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

    return layers;
  }, [selectionPolygon, layerData, activeLayers, layerOrder, layerSpacing]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleViewStateChange = useCallback((params: any) => {
    const vs = params.viewState;
    if (vs) {
      setLocalViewState({
        longitude: vs.longitude,
        latitude: vs.latitude,
        zoom: vs.zoom,
        pitch: vs.pitch || 0,
        bearing: vs.bearing || 0,
        maxPitch: 89,
        minPitch: 0,
      });
    }
  }, []);

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
      <div style={{ flex: 1, position: 'relative' }}>
        <DeckGL
          viewState={localViewState}
          onViewStateChange={handleViewStateChange}
          controller={{ dragRotate: true, touchRotate: true, keyboard: true }}
          layers={extractedLayers}
          style={{ position: 'absolute', top: '0', left: '0', width: '100%', height: '100%' }}
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

// Helper to get coordinates for PolygonLayer
function getPolygonCoordinates(polygon: Polygon | MultiPolygon): number[][][] {
  if (polygon.type === 'MultiPolygon') {
    return polygon.coordinates[0]; // Use first polygon
  }
  return polygon.coordinates;
}

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
        }];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (f.geometry as any).coordinates.map((coords: number[][]) => ({
        path: coords.map((c: number[]) => [...c, zOffset]),
        properties: f.properties,
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
    }));

  return new SimpleMeshLayer({
    id: `extracted-${config.id}`,
    data: pointData,
    mesh: getSphereMesh(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPosition: (d: any) => d.position,
    getColor: fillColor,
    getScale: [12, 12, 12],
    pickable: true,
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

import { useCallback, useMemo, useState } from 'react';
import Map from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import type { PickingInfo, Layer } from '@deck.gl/core';
import type { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useStore } from '../store/useStore';
import { layerManifest, getLayerById, getSortedLayers } from '../data/layerManifest';
import type { LayerConfig, LayerData, LayerGroup } from '../types';

// Free MapLibre style - OpenStreetMap Carto
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Group spacing configuration for better visual separation
const GROUP_BASE_HEIGHTS: Record<LayerGroup, number> = {
  usage: 0,        // Base layer (land use, buildings)
  infrastructure: 1, // Roads, bike lanes
  access: 2,       // Transit, parking
  safety: 3,       // Signals, crosswalks
  environment: 4,  // Parks, water, trees (top)
};

interface LayerRenderInfo {
  config: LayerConfig;
  data: LayerData;
  zOffset: number;
  groupIndex: number;
}

export function MapView() {
  const {
    viewState,
    setViewState,
    layerData,
    activeLayers,
    explodedView,
    hoveredLayerId,
    setHoveredLayerId,
    isolatedLayerId,
    selectionPolygon,
    isDrawing,
  } = useStore();

  const [hoveredFeature, setHoveredFeature] = useState<Feature | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);

  // Calculate layer render order and z-offsets with group-based separation
  const layerRenderInfo = useMemo((): LayerRenderInfo[] => {
    const sortedLayers = getSortedLayers();
    const activeLayerConfigs = sortedLayers.filter((layer) =>
      activeLayers.includes(layer.id)
    );

    // Calculate z-offsets based on group hierarchy
    const groupSpacing = explodedView.layerSpacing; // Space between groups
    const intraGroupSpacing = explodedView.layerSpacing * 0.6; // Space within groups (increased for better layer separation)

    // Track layer index within each group
    const groupLayerCounts: Record<string, number> = {};

    return activeLayerConfigs.map((config) => {
      const data = layerData.get(config.id);
      const groupIndex = GROUP_BASE_HEIGHTS[config.group] || 0;

      // Get the index of this layer within its group
      if (!groupLayerCounts[config.group]) {
        groupLayerCounts[config.group] = 0;
      }
      const layerIndexInGroup = groupLayerCounts[config.group]++;

      // Calculate z-offset: group base height + layer offset within group
      const zOffset = explodedView.enabled
        ? explodedView.baseElevation +
          groupIndex * groupSpacing +
          layerIndexInGroup * intraGroupSpacing
        : 0;

      return {
        config,
        data: data || { layerId: config.id, features: { type: 'FeatureCollection', features: [] } },
        zOffset,
        groupIndex,
      };
    });
  }, [activeLayers, layerData, explodedView]);

  // Handle hover
  const onHover = useCallback(
    (info: PickingInfo) => {
      if (info.layer) {
        const layerId = info.layer.id
          .replace('-elevated', '')
          .replace('-ground', '')
          .replace('-connectors', '')
          .replace('-platform', '');
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

  // Create deck.gl layers
  const deckLayers = useMemo((): Layer[] => {
    const layers: Layer[] = [];

    // Selection polygon (drawing preview)
    if (selectionPolygon) {
      layers.push(
        new PolygonLayer({
          id: 'selection-polygon',
          data: [selectionPolygon.geometry],
          getPolygon: (d: Polygon) => d.coordinates,
          getFillColor: [100, 150, 255, 50],
          getLineColor: [100, 150, 255, 255],
          getLineWidth: 3,
          lineWidthUnits: 'pixels',
          filled: true,
          stroked: true,
          pickable: false,
        })
      );
    }

    // Add group platform layers when exploded view is enabled
    if (explodedView.enabled && selectionPolygon) {
      const activeGroups = new Set(
        layerRenderInfo
          .filter(info => info.data.features.features.length > 0 || info.data.clippedFeatures?.features.length)
          .map(info => info.config.group)
      );

      for (const group of layerManifest.groups) {
        if (!activeGroups.has(group.id)) continue;

        const groupIndex = GROUP_BASE_HEIGHTS[group.id] || 0;
        const zOffset = explodedView.baseElevation + groupIndex * explodedView.layerSpacing;

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

      const features = selectionPolygon && data.clippedFeatures
        ? data.clippedFeatures
        : data.features;

      if (!features || features.features.length === 0) continue;

      const isHovered = hoveredLayerId === config.id;
      const opacity = isHovered ? 1.0 : 0.85;

      // Ground shadow/reference layer (subtle reference at z=0 when exploded)
      if (explodedView.enabled && zOffset > 0) {
        layers.push(
          createGroundShadowLayer(config, features, 0.15)
        );
      }

      // Main elevated layer
      switch (config.geometryType) {
        case 'polygon':
          layers.push(
            createPolygonLayer(config, features, zOffset, opacity, isHovered, explodedView.enabled)
          );
          // Vertical connectors for polygons
          if (explodedView.enabled && zOffset > 0) {
            layers.push(
              createVerticalConnectors(config, features, zOffset, 'polygon')
            );
          }
          break;
        case 'line':
          layers.push(
            createLineLayer(config, features, zOffset, opacity, isHovered)
          );
          // Vertical connectors for lines (at endpoints)
          if (explodedView.enabled && zOffset > 0) {
            layers.push(
              createVerticalConnectors(config, features, zOffset, 'line')
            );
          }
          break;
        case 'point':
          layers.push(
            createPointLayer(config, features, zOffset, opacity, isHovered, explodedView.enabled)
          );
          // Vertical connectors for points
          if (explodedView.enabled && zOffset > 0) {
            layers.push(
              createVerticalConnectors(config, features, zOffset, 'point')
            );
          }
          break;
      }
    }

    return layers;
  }, [layerRenderInfo, selectionPolygon, hoveredLayerId, isolatedLayerId, explodedView]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onViewStateChange = useCallback(
    (params: any) => {
      const newViewState = params.viewState;
      if (newViewState) {
        setViewState({
          longitude: newViewState.longitude,
          latitude: newViewState.latitude,
          zoom: newViewState.zoom,
          pitch: newViewState.pitch || 0,
          bearing: newViewState.bearing || 0,
          maxPitch: 89,
          minPitch: 0,
        });
      }
    },
    [setViewState]
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{
          dragRotate: true,
          touchRotate: true,
          keyboard: true,
        }}
        layers={deckLayers}
        onHover={onHover}
        getCursor={({ isDragging, isHovering }) =>
          isDrawing ? 'crosshair' : isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
        }
      >
        <Map mapStyle={MAP_STYLE} maxPitch={89} minPitch={0} />
      </DeckGL>

      {/* Tooltip */}
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
            {getLayerById(hoveredLayerId || '')?.name || 'Feature'}
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
        </div>
      )}
    </div>
  );
}

// Helper functions to create layers
function createPolygonLayer(
  config: LayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean,
  isExploded: boolean
): Layer {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  // Add a small extrusion height when exploded to give layers thickness
  const extrusionHeight = isExploded ? 8 : (config.style.extrusionHeight || 0);

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
    getElevation: isExploded ? zOffset + extrusionHeight : zOffset,
    extruded: isExploded || config.style.extruded,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 100],
  });
}

function createLineLayer(
  config: LayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean
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
    getColor: isHovered ? [255, 255, 255, 255] : color,
    getWidth: isHovered ? style.strokeWidth * 2 : style.strokeWidth,
    widthUnits: 'pixels' as const,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 150],
  });
}

function createPointLayer(
  config: LayerConfig,
  features: FeatureCollection,
  zOffset: number,
  opacity: number,
  isHovered: boolean,
  isExploded: boolean
) {
  const { style } = config;
  const fillColor = [...style.fillColor] as [number, number, number, number];
  fillColor[3] = Math.floor(fillColor[3] * opacity);

  const pointData = features.features
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => ({
      position: [...(f.geometry as Point).coordinates, zOffset],
      properties: f.properties,
    }));

  // Make points larger when exploded for better visibility
  const baseRadius = isExploded ? 8 : 5;

  return new ScatterplotLayer({
    id: `${config.id}-elevated`,
    data: pointData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPosition: (d: any) => d.position,
    getFillColor: fillColor,
    getLineColor: isHovered ? [255, 255, 255, 255] : style.strokeColor,
    getRadius: isHovered ? baseRadius * 1.5 : baseRadius,
    radiusUnits: 'pixels' as const,
    filled: true,
    stroked: true,
    lineWidthMinPixels: style.strokeWidth,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 150],
  });
}

function createGroundShadowLayer(
  config: LayerConfig,
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
  config: LayerConfig,
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

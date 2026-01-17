import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import Map from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, PolygonLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import type { PickingInfo, Layer } from '@deck.gl/core';
import type { Feature, FeatureCollection, Polygon, LineString, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';

import { useStore } from '../store/useStore';
import { layerManifest, getLayerById, getLayersByCustomOrder } from '../data/layerManifest';
import type { LayerConfig, LayerData, LayerGroup } from '../types';

// Free MapLibre style - OpenStreetMap Carto
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';


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
    addSelectedFeature,
    layerOrder,
  } = useStore();

  const [hoveredFeature, setHoveredFeature] = useState<Feature | null>(null);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredVertexIndex, setHoveredVertexIndex] = useState<number | null>(null);
  const [hoveredMidpointIndex, setHoveredMidpointIndex] = useState<number | null>(null);
  const lastVertexClickRef = useRef<{ index: number; time: number } | null>(null);

  // Calculate layer render order and z-offsets with group-based separation
  const layerRenderInfo = useMemo((): LayerRenderInfo[] => {
    // Use custom layer order instead of static getSortedLayers()
    const sortedLayers = getLayersByCustomOrder(layerOrder);
    const activeLayerConfigs = sortedLayers.filter((layer) =>
      activeLayers.includes(layer.id)
    );

    // Calculate z-offsets based on group hierarchy
    const groupSpacing = explodedView.layerSpacing; // Space between groups
    const intraGroupSpacing = explodedView.layerSpacing * 0.6; // Space within groups (increased for better layer separation)

    // Build dynamic group base heights from custom order (1-indexed for floating)
    const groupBaseHeights: Record<LayerGroup, number> = {} as Record<LayerGroup, number>;
    layerOrder.groupOrder.forEach((groupId, index) => {
      groupBaseHeights[groupId] = index + 1;
    });

    // Track layer index within each group
    const groupLayerCounts: Record<string, number> = {};

    return activeLayerConfigs.map((config) => {
      const data = layerData.get(config.id);
      const groupIndex = groupBaseHeights[config.group] || 0;

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
  }, [activeLayers, layerData, explodedView, layerOrder]);

  // Handle hover
  const onHover = useCallback(
    (info: PickingInfo) => {
      if (info.layer) {
        const layerId = info.layer.id
          .replace('-elevated', '')
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

  // Handle click to select/deselect features
  const onClick = useCallback(
    (info: PickingInfo) => {
      // Don't select if in drawing mode or dragging vertices
      if (isDrawing || draggingVertexIndex !== null) return;

      // Don't select vertex handles or other UI elements
      if (info.layer?.id === 'vertex-handles') return;

      if (info.object && info.layer) {
        const layerId = info.layer.id
          .replace('-elevated', '')
          .replace('-ground', '')
          .replace('-connectors', '')
          .replace('-platform', '')
          .replace('-selected', '');

        // Get the feature (handle different data formats)
        const feature = info.object as Feature;
        if (feature && feature.type === 'Feature') {
          addSelectedFeature(feature, layerId);
        }
      }
    },
    [isDrawing, draggingVertexIndex, addSelectedFeature]
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
      if (info.layer?.id === 'vertex-handles' && info.index !== undefined) {
        setDraggingVertexIndex(info.index);
        return true; // Prevent map panning
      }
      return false;
    },
    [setDraggingVertexIndex]
  );

  // Handle drag movement
  const onDrag = useCallback(
    (info: PickingInfo) => {
      if (draggingVertexIndex !== null && info.coordinate) {
        const [lng, lat] = info.coordinate;
        updateVertex(draggingVertexIndex, [lng, lat]);
      }
    },
    [draggingVertexIndex, updateVertex]
  );

  // Handle drag end - update the selection polygon
  const onDragEnd = useCallback(() => {
    if (draggingVertexIndex !== null && editableVertices.length >= 3) {
      // Create new polygon from edited vertices
      const newPolygon: Polygon = {
        type: 'Polygon',
        coordinates: [[...editableVertices, editableVertices[0]]],
      };

      // Calculate new area
      const area = editableVertices.length >= 3 ? calculatePolygonAreaFromCoords(editableVertices) : 0;

      setSelectionPolygon({
        id: selectionPolygon?.id || `selection-${Date.now()}`,
        geometry: newPolygon,
        area,
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

  // Handle adding a vertex at midpoint
  const handleAddVertex = useCallback((afterIndex: number, position: [number, number]) => {
    addVertex(afterIndex, position);
    // Update polygon with new vertices (need to include the new vertex)
    const newVertices = [...editableVertices];
    newVertices.splice(afterIndex + 1, 0, position);
    updatePolygonFromVertices(newVertices);
  }, [addVertex, editableVertices, updatePolygonFromVertices]);

  // Handle removing a vertex
  const handleRemoveVertex = useCallback((index: number) => {
    if (editableVertices.length <= 3) return; // Can't remove if only 3 vertices
    removeVertex(index);
    // Update polygon with remaining vertices
    const newVertices = editableVertices.filter((_, i) => i !== index);
    updatePolygonFromVertices(newVertices);
  }, [removeVertex, editableVertices, updatePolygonFromVertices]);

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

      // Build dynamic group base heights from custom order
      const groupBaseHeights: Record<LayerGroup, number> = {} as Record<LayerGroup, number>;
      layerOrder.groupOrder.forEach((groupId, index) => {
        groupBaseHeights[groupId] = index + 1;
      });

      for (const group of layerManifest.groups) {
        if (!activeGroups.has(group.id)) continue;

        const groupIndex = groupBaseHeights[group.id as LayerGroup] || 0;
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
          // Use specialized layer functions for buildings and parking
          if (config.id === 'buildings') {
            layers.push(
              ...createBuildingLayer(config, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // No vertical connectors for floating buildings
          } else if (config.id === 'parking') {
            layers.push(
              ...createParkingLayer(config, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // No vertical connectors for floating parking
          } else if (config.id === 'parks') {
            layers.push(
              ...createParkLayer(config, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // No vertical connectors for floating parks
          } else {
            layers.push(
              createPolygonLayer(config, features, zOffset, opacity, isHovered, explodedView.enabled)
            );
            // Vertical connectors for other polygons (parks, land use, etc.)
            if (explodedView.enabled && zOffset > 0) {
              layers.push(
                createVerticalConnectors(config, features, zOffset, 'polygon')
              );
            }
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

    // Drawing corner markers - rendered LAST to appear on top of all layers
    if (isDrawing && drawingPoints.length > 0) {
      // Corner data with metadata for styling
      const cornerData = drawingPoints.map((point, index) => ({
        position: point,
        index: index + 1,
        isFirst: index === 0,
        isLast: index === drawingPoints.length - 1,
      }));

      // Draw connecting lines between corner points
      if (drawingPoints.length > 1) {
        const pathData = drawingPoints.map((point, index) => ({
          path: index < drawingPoints.length - 1
            ? [point, drawingPoints[index + 1]]
            : null,
        })).filter(d => d.path !== null);

        layers.push(
          new PathLayer({
            id: 'drawing-lines',
            data: pathData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPath: (d: any) => d.path,
            getColor: [65, 135, 255, 255],
            getWidth: 3,
            widthUnits: 'pixels' as const,
            pickable: false,
          })
        );
      }

      // Draw corner nodes - first point is green (close polygon), others are blue
      layers.push(
        new ScatterplotLayer({
          id: 'drawing-corners',
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
            getFillColor: [drawingPoints.length],
            getRadius: [drawingPoints.length],
          },
        })
      );

    }

    // Editable vertex handles - shown when selection exists and not drawing
    if (!isDrawing && editableVertices.length > 0) {
      const vertexData = editableVertices.map((vertex, index) => ({
        position: vertex,
        index,
        canRemove: editableVertices.length > 3,
      }));

      // Calculate midpoints for adding new vertices
      const midpointData = editableVertices.map((vertex, index) => {
        const nextVertex = editableVertices[(index + 1) % editableVertices.length];
        return {
          position: [(vertex[0] + nextVertex[0]) / 2, (vertex[1] + nextVertex[1]) / 2] as [number, number],
          afterIndex: index,
        };
      });

      // Draw polygon edges with editable style
      if (editableVertices.length > 1) {
        const edgeData = editableVertices.map((vertex, index) => ({
          path: [vertex, editableVertices[(index + 1) % editableVertices.length]],
        }));

        layers.push(
          new PathLayer({
            id: 'editable-edges',
            data: edgeData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            getPath: (d: any) => d.path,
            getColor: [255, 200, 50, 255],
            getWidth: 3,
            widthUnits: 'pixels' as const,
            pickable: false,
          })
        );
      }

      // Midpoint handles for adding new vertices
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

      // Draggable vertex handles (double-click to remove)
      layers.push(
        new ScatterplotLayer({
          id: 'vertex-handles',
          data: vertexData,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getPosition: (d: any) => d.position,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getFillColor: (d: any) =>
            d.index === draggingVertexIndex
              ? [255, 100, 100, 255] // Red when dragging
              : d.index === hoveredVertexIndex
              ? d.canRemove
                ? [255, 150, 100, 255] // Orange-red when hovered and can remove
                : [255, 255, 100, 255] // Yellow when hovered but can't remove
              : [255, 200, 50, 255], // Orange default
          getLineColor: [255, 255, 255, 255],
          getRadius: 14,
          radiusUnits: 'pixels' as const,
          filled: true,
          stroked: true,
          lineWidthMinPixels: 3,
          pickable: true,
          onHover: (info: PickingInfo) => {
            setHoveredVertexIndex(info.index ?? null);
          },
          onClick: (info: PickingInfo) => {
            if (info.object && info.object.canRemove) {
              const now = Date.now();
              const lastClick = lastVertexClickRef.current;
              // Detect double-click (within 300ms on same vertex)
              if (lastClick && lastClick.index === info.object.index && now - lastClick.time < 300) {
                handleRemoveVertex(info.object.index);
                lastVertexClickRef.current = null;
              } else {
                lastVertexClickRef.current = { index: info.object.index, time: now };
              }
            }
          },
          updateTriggers: {
            getFillColor: [draggingVertexIndex, hoveredVertexIndex, editableVertices.length],
          },
        })
      );
    }

    // Render selected features with distinct colors (on top of everything)
    if (selectedFeatures.length > 0) {
      // Render each selected feature with its unique color and stacked elevation
      selectedFeatures.forEach((selection, selectionIndex) => {
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

    return layers;
  }, [layerRenderInfo, selectionPolygon, hoveredLayerId, isolatedLayerId, explodedView, isDrawing, drawingPoints, editableVertices, draggingVertexIndex, hoveredVertexIndex, hoveredMidpointIndex, handleAddVertex, handleRemoveVertex, selectedFeatures, layerOrder]);

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

  // Memoize controller to prevent DeckGL re-initialization
  const controller = useMemo(() => ({
    dragRotate: draggingVertexIndex === null,
    touchRotate: draggingVertexIndex === null,
    keyboard: true,
    dragPan: draggingVertexIndex === null,
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
  config: LayerConfig,
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
  config: LayerConfig,
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
  config: LayerConfig,
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
  config: LayerConfig,
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
  config: LayerConfig,
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

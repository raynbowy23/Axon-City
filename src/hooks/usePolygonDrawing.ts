import { useState, useCallback } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';

export function usePolygonDrawing() {
  const {
    setSelectionPolygon,
    setIsDrawing,
    viewState,
    drawingPoints: storeDrawingPoints,
    setDrawingPoints: setStoreDrawingPoints,
  } = useStore();
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);

  // Sync local drawing points to store for MapView visualization
  const updatePoints = useCallback((newPoints: [number, number][]) => {
    setDrawingPoints(newPoints);
    setStoreDrawingPoints(newPoints);
  }, [setStoreDrawingPoints]);

  const startDrawing = useCallback(() => {
    setIsDrawing(true);
    updatePoints([]);
    setSelectionPolygon(null);
  }, [setIsDrawing, setSelectionPolygon, updatePoints]);

  const addPoint = useCallback(
    (screenX: number, screenY: number, containerElement: HTMLDivElement | null) => {
      if (!containerElement) return;

      const rect = containerElement.getBoundingClientRect();
      const x = screenX - rect.left;
      const y = screenY - rect.top;

      // Use deck.gl's WebMercatorViewport for accurate unprojection
      const viewport = new WebMercatorViewport({
        width: rect.width,
        height: rect.height,
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
      });

      // Unproject screen coordinates to [lng, lat]
      const [lng, lat] = viewport.unproject([x, y]);

      const newPoints = [...drawingPoints, [lng, lat] as [number, number]];
      updatePoints(newPoints);

      // Update preview polygon if we have 3+ points
      if (newPoints.length >= 3) {
        const polygon: Polygon = {
          type: 'Polygon',
          coordinates: [[...newPoints, newPoints[0]]],
        };
        setSelectionPolygon({
          id: 'preview',
          geometry: polygon,
          area: calculatePolygonArea(polygon) * 1_000_000,
        });
      }
    },
    [viewState, setSelectionPolygon, drawingPoints, updatePoints]
  );

  const undoLastPoint = useCallback(() => {
    const newPoints = drawingPoints.slice(0, -1);
    updatePoints(newPoints);

    if (newPoints.length >= 3) {
      const polygon: Polygon = {
        type: 'Polygon',
        coordinates: [[...newPoints, newPoints[0]]],
      };
      setSelectionPolygon({
        id: 'preview',
        geometry: polygon,
        area: calculatePolygonArea(polygon) * 1_000_000,
      });
    } else {
      setSelectionPolygon(null);
    }
  }, [setSelectionPolygon, drawingPoints, updatePoints]);

  const completeDrawing = useCallback((): Polygon | null => {
    if (drawingPoints.length < 3) {
      setIsDrawing(false);
      updatePoints([]);
      setSelectionPolygon(null);
      return null;
    }

    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [[...drawingPoints, drawingPoints[0]]],
    };

    setIsDrawing(false);
    updatePoints([]);

    // Update selection with final polygon
    setSelectionPolygon({
      id: `selection-${Date.now()}`,
      geometry: polygon,
      area: calculatePolygonArea(polygon) * 1_000_000,
    });

    return polygon;
  }, [drawingPoints, setIsDrawing, setSelectionPolygon, updatePoints]);

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    updatePoints([]);
    setSelectionPolygon(null);
  }, [setIsDrawing, setSelectionPolygon, updatePoints]);

  return {
    drawingPoints,
    startDrawing,
    addPoint,
    undoLastPoint,
    completeDrawing,
    cancelDrawing,
    pointCount: drawingPoints.length,
  };
}

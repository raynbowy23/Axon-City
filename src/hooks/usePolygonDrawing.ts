import { useState, useCallback } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';

export function usePolygonDrawing() {
  const { setSelectionPolygon, setIsDrawing, viewState } = useStore();
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);

  const startDrawing = useCallback(() => {
    setIsDrawing(true);
    setDrawingPoints([]);
    setSelectionPolygon(null);
  }, [setIsDrawing, setSelectionPolygon]);

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

      setDrawingPoints((prev) => {
        const newPoints = [...prev, [lng, lat] as [number, number]];

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

        return newPoints;
      });
    },
    [viewState, setSelectionPolygon]
  );

  const undoLastPoint = useCallback(() => {
    setDrawingPoints((prev) => {
      const newPoints = prev.slice(0, -1);

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

      return newPoints;
    });
  }, [setSelectionPolygon]);

  const completeDrawing = useCallback((): Polygon | null => {
    if (drawingPoints.length < 3) {
      setIsDrawing(false);
      setDrawingPoints([]);
      setSelectionPolygon(null);
      return null;
    }

    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [[...drawingPoints, drawingPoints[0]]],
    };

    setIsDrawing(false);
    setDrawingPoints([]);

    // Update selection with final polygon
    setSelectionPolygon({
      id: `selection-${Date.now()}`,
      geometry: polygon,
      area: calculatePolygonArea(polygon) * 1_000_000,
    });

    return polygon;
  }, [drawingPoints, setIsDrawing, setSelectionPolygon]);

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setSelectionPolygon(null);
  }, [setIsDrawing, setSelectionPolygon]);

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

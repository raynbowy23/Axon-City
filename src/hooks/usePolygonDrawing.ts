import { useCallback, useRef } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';

// Drag threshold - larger for touch to avoid accidental points
const MOUSE_DRAG_THRESHOLD = 5;
const TOUCH_DRAG_THRESHOLD = 10;

export function usePolygonDrawing() {
  const {
    setSelectionPolygon,
    setIsDrawing,
    viewState,
    setDrawingPoints: setStoreDrawingPoints,
    drawingPoints: storeDrawingPoints,
    drawingMode,
  } = useStore();

  // Use store state directly instead of local state to avoid sync issues
  const drawingPoints = storeDrawingPoints;

  // Track pointer start position for drag detection
  const pointerStartRef = useRef<{ x: number; y: number; isTouch: boolean } | null>(null);

  // Update drawing points in store
  const updatePoints = useCallback((newPoints: [number, number][]) => {
    setStoreDrawingPoints(newPoints);
  }, [setStoreDrawingPoints]);

  const startDrawing = useCallback(() => {
    setIsDrawing(true);
    updatePoints([]);
    setSelectionPolygon(null);
  }, [setIsDrawing, setSelectionPolygon, updatePoints]);

  // Record pointer start position (works for both mouse and touch)
  const handlePointerStart = useCallback((x: number, y: number, isTouch: boolean) => {
    pointerStartRef.current = { x, y, isTouch };
  }, []);

  // Check if the pointer movement was a drag or a tap/click
  const isDrag = useCallback((endX: number, endY: number): boolean => {
    if (!pointerStartRef.current) return false;

    const { x: startX, y: startY, isTouch } = pointerStartRef.current;
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = isTouch ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD;

    return distance > threshold;
  }, []);

  // Clear pointer tracking
  const clearPointerStart = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

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

      // Determine max points based on drawing mode
      const maxPoints = drawingMode === 'circle' ? 2 : drawingMode === 'rectangle' ? 3 : Infinity;

      let newPoints: [number, number][];

      if (drawingPoints.length >= maxPoints) {
        // Max points reached - update the last point instead of adding
        newPoints = [...drawingPoints.slice(0, -1), [lng, lat] as [number, number]];
      } else {
        // Add new point
        newPoints = [...drawingPoints, [lng, lat] as [number, number]];
      }

      updatePoints(newPoints);

      // Update preview polygon if we have 3+ points (for polygon mode)
      if (drawingMode === 'polygon' && newPoints.length >= 3) {
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
    [viewState, setSelectionPolygon, drawingPoints, updatePoints, drawingMode]
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
    // Touch/pointer support
    handlePointerStart,
    isDrag,
    clearPointerStart,
  };
}

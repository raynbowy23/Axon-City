import { useState, useCallback, useEffect } from 'react';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';

interface DrawingToolProps {
  onComplete: (polygon: Polygon) => void;
}

export function DrawingTool({ onComplete }: DrawingToolProps) {
  const { isDrawing, setIsDrawing, setSelectionPolygon, viewState } = useStore();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [previewPolygon, setPreviewPolygon] = useState<Polygon | null>(null);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing();
      }
      if (e.key === 'Enter' && points.length >= 3) {
        completeDrawing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [points]);

  // Update preview polygon when points change
  useEffect(() => {
    if (points.length >= 3) {
      const polygon: Polygon = {
        type: 'Polygon',
        coordinates: [[...points, points[0]]],
      };
      setPreviewPolygon(polygon);
      setSelectionPolygon({
        id: 'preview',
        geometry: polygon,
        area: calculatePolygonArea(polygon) * 1_000_000, // m²
      });
    } else {
      setPreviewPolygon(null);
      setSelectionPolygon(null);
    }
  }, [points, setSelectionPolygon]);

  const handleMapClick = useCallback(
    (e: MouseEvent) => {
      if (!isDrawing) return;

      // Get click coordinates from the map container
      const mapContainer = document.querySelector('.deck-canvas');
      if (!mapContainer) return;

      const rect = mapContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Convert pixel coordinates to lng/lat using viewport
      // This is a simplified conversion - in production you'd use deck.gl's viewport unproject
      const { longitude, latitude, zoom } = viewState;
      const scale = Math.pow(2, zoom);
      const worldSize = 512 * scale;

      const lng =
        longitude +
        ((x - rect.width / 2) / worldSize) * 360;
      const lat =
        latitude -
        ((y - rect.height / 2) / worldSize) * 180;

      setPoints((prev) => [...prev, [lng, lat]]);
    },
    [isDrawing, viewState]
  );

  useEffect(() => {
    if (isDrawing) {
      document.addEventListener('click', handleMapClick);
    }
    return () => {
      document.removeEventListener('click', handleMapClick);
    };
  }, [isDrawing, handleMapClick]);

  const startDrawing = () => {
    setIsDrawing(true);
    setPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
  };

  const completeDrawing = () => {
    if (points.length < 3) return;

    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [[...points, points[0]]],
    };

    setIsDrawing(false);
    setPoints([]);
    onComplete(polygon);
  };

  const undoLastPoint = () => {
    setPoints((prev) => prev.slice(0, -1));
  };

  return (
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
      {!isDrawing ? (
        <button
          onClick={startDrawing}
          style={{
            padding: '12px 24px',
            backgroundColor: '#4A90D9',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s',
          }}
        >
          🖊️ Draw Selection Area
        </button>
      ) : (
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: '16px',
            borderRadius: '8px',
            color: 'white',
            minWidth: '200px',
          }}
        >
          <div style={{ marginBottom: '12px', fontWeight: '600' }}>
            Drawing Mode
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '12px' }}>
            Click to add points ({points.length} added)
            <br />
            Press Enter to complete
            <br />
            Press Escape to cancel
          </div>

          {previewPolygon && (
            <div
              style={{
                fontSize: '12px',
                padding: '8px',
                backgroundColor: 'rgba(74, 144, 217, 0.3)',
                borderRadius: '4px',
                marginBottom: '12px',
              }}
            >
              Area: {formatArea(calculatePolygonArea(previewPolygon))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={undoLastPoint}
              disabled={points.length === 0}
              style={{
                padding: '8px 12px',
                backgroundColor: points.length === 0 ? '#444' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: points.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
              }}
            >
              ↩️ Undo
            </button>
            <button
              onClick={completeDrawing}
              disabled={points.length < 3}
              style={{
                padding: '8px 12px',
                backgroundColor: points.length < 3 ? '#444' : '#4A90D9',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: points.length < 3 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
              }}
            >
              ✓ Complete
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
              ✕ Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatArea(areaKm2: number): string {
  if (areaKm2 < 0.01) {
    return `${(areaKm2 * 1_000_000).toFixed(0)} m²`;
  }
  if (areaKm2 < 1) {
    return `${(areaKm2 * 100).toFixed(2)} ha`;
  }
  return `${areaKm2.toFixed(2)} km²`;
}

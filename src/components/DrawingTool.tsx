import { useState, useEffect } from 'react';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';

interface DrawingToolProps {
  onComplete: (polygon: Polygon) => void;
}

export function DrawingTool({ onComplete }: DrawingToolProps) {
  const { isDrawing, setIsDrawing, setSelectionPolygon, drawingPoints, setDrawingPoints } = useStore();
  const [previewPolygon, setPreviewPolygon] = useState<Polygon | null>(null);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing();
      }
      if (e.key === 'Enter' && drawingPoints.length >= 3) {
        completeDrawing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingPoints]);

  // Update preview polygon when drawing points change (points are added by MapView via DeckGL onClick)
  useEffect(() => {
    if (drawingPoints.length >= 3) {
      const polygon: Polygon = {
        type: 'Polygon',
        coordinates: [[...drawingPoints, drawingPoints[0]]],
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
  }, [drawingPoints, setSelectionPolygon]);

  const startDrawing = () => {
    setIsDrawing(true);
    setDrawingPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
  };

  const completeDrawing = () => {
    if (drawingPoints.length < 3) return;

    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [[...drawingPoints, drawingPoints[0]]],
    };

    setIsDrawing(false);
    setDrawingPoints([]);
    onComplete(polygon);
  };

  const undoLastPoint = () => {
    setDrawingPoints(drawingPoints.slice(0, -1));
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
            Click to add points ({drawingPoints.length} added)
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
              disabled={drawingPoints.length === 0}
              style={{
                padding: '8px 12px',
                backgroundColor: drawingPoints.length === 0 ? '#444' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: drawingPoints.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
              }}
            >
              ↩️ Undo
            </button>
            <button
              onClick={completeDrawing}
              disabled={drawingPoints.length < 3}
              style={{
                padding: '8px 12px',
                backgroundColor: drawingPoints.length < 3 ? '#444' : '#4A90D9',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: drawingPoints.length < 3 ? 'not-allowed' : 'pointer',
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
  const areaM2 = areaKm2 * 1_000_000;
  const areaHa = areaKm2 * 100;
  const areaAcres = areaKm2 * 247.105; // 1 km² = 247.105 acres
  const areaSqFt = areaM2 * 10.7639;

  if (areaKm2 < 0.01) {
    return `${areaM2.toFixed(0)} m² (${areaSqFt.toFixed(0)} sq ft)`;
  }
  if (areaKm2 < 1) {
    return `${areaHa.toFixed(2)} ha (${areaAcres.toFixed(2)} acres)`;
  }
  return `${areaKm2.toFixed(2)} km² (${areaAcres.toFixed(0)} acres)`;
}

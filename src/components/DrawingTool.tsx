import { useState, useEffect, useCallback, useRef } from 'react';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';
import type { DrawingMode } from '../types';

interface DrawingToolProps {
  onComplete: (polygon: Polygon) => void;
}

// Generate a rectangle polygon from two corner points
function createRectanglePolygon(
  corner1: [number, number],
  corner2: [number, number]
): Polygon {
  const [lng1, lat1] = corner1;
  const [lng2, lat2] = corner2;

  return {
    type: 'Polygon',
    coordinates: [[
      [lng1, lat1],
      [lng2, lat1],
      [lng2, lat2],
      [lng1, lat2],
      [lng1, lat1], // Close the polygon
    ]],
  };
}

// Generate a circle polygon from center and edge point
function createCirclePolygon(
  center: [number, number],
  edgePoint: [number, number],
  numPoints: number = 64
): Polygon {
  const [cLng, cLat] = center;
  const [eLng, eLat] = edgePoint;

  // Calculate radius in degrees (approximate for small areas)
  const radiusLng = Math.abs(eLng - cLng);
  const radiusLat = Math.abs(eLat - cLat);
  const radius = Math.sqrt(radiusLng * radiusLng + radiusLat * radiusLat);

  // Generate circle points
  const points: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    // Adjust for latitude distortion (longitude degrees are smaller at higher latitudes)
    const latCorrectionFactor = Math.cos((cLat * Math.PI) / 180);
    const lng = cLng + (radius * Math.cos(angle)) / latCorrectionFactor;
    const lat = cLat + radius * Math.sin(angle);
    points.push([lng, lat]);
  }

  // Close the polygon
  points.push(points[0]);

  return {
    type: 'Polygon',
    coordinates: [points],
  };
}

const MODE_ICONS: Record<DrawingMode, string> = {
  polygon: '✏️',
  rectangle: '▭',
  circle: '○',
};

const MODE_LABELS: Record<DrawingMode, string> = {
  polygon: 'Polygon',
  rectangle: 'Rectangle',
  circle: 'Circle',
};

const MODE_INSTRUCTIONS: Record<DrawingMode, string> = {
  polygon: 'Click to add points, Enter to complete',
  rectangle: 'Click two corners to create rectangle',
  circle: 'Click center, then edge to set radius',
};

export function DrawingTool({ onComplete }: DrawingToolProps) {
  const {
    isDrawing,
    setIsDrawing,
    setSelectionPolygon,
    drawingPoints,
    setDrawingPoints,
    drawingMode: storeDrawingMode,
    setDrawingMode,
  } = useStore();
  const drawingMode = storeDrawingMode as DrawingMode;
  const [previewPolygon, setPreviewPolygon] = useState<Polygon | null>(null);

  // Use refs to avoid dependency issues in useEffect
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const autoCompleteTriggeredRef = useRef(false);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing();
      }
      if (e.key === 'Enter' && drawingMode === 'polygon' && drawingPoints.length >= 3) {
        completeDrawing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingPoints, drawingMode]);

  // Update preview polygon when drawing points change
  useEffect(() => {
    // Reset auto-complete flag when points change
    if (drawingPoints.length < 2) {
      autoCompleteTriggeredRef.current = false;
    }

    if (drawingPoints.length === 0) {
      setPreviewPolygon(null);
      setSelectionPolygon(null);
      // Clear editable vertices too
      const { setEditableVertices } = useStore.getState();
      setEditableVertices([]);
      return;
    }

    let polygon: Polygon | null = null;
    let shouldAutoComplete = false;

    if (drawingMode === 'polygon') {
      if (drawingPoints.length >= 3) {
        polygon = {
          type: 'Polygon',
          coordinates: [[...drawingPoints, drawingPoints[0]]],
        };
      }
    } else if (drawingMode === 'rectangle') {
      if (drawingPoints.length === 2) {
        polygon = createRectanglePolygon(drawingPoints[0], drawingPoints[1]);
        shouldAutoComplete = true;
      }
    } else if (drawingMode === 'circle') {
      if (drawingPoints.length === 2) {
        polygon = createCirclePolygon(drawingPoints[0], drawingPoints[1]);
        shouldAutoComplete = true;
      }
    }

    if (polygon) {
      setPreviewPolygon(polygon);
      setSelectionPolygon({
        id: 'preview',
        geometry: polygon,
        area: calculatePolygonArea(polygon) * 1_000_000,
      });

      // Auto-complete for rectangle and circle (deferred to avoid state conflicts)
      // Only trigger once per drawing session
      if (shouldAutoComplete && !autoCompleteTriggeredRef.current) {
        autoCompleteTriggeredRef.current = true;
        const timeoutId = setTimeout(() => {
          const completedPolygon = polygon;
          setIsDrawing(false);
          setDrawingPoints([]);
          if (completedPolygon) {
            onCompleteRef.current(completedPolygon);
          }
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    } else {
      setPreviewPolygon(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingPoints.length, drawingMode]);

  const startDrawing = useCallback((mode?: DrawingMode) => {
    if (mode) {
      setDrawingMode(mode);
    }
    setIsDrawing(true);
    setDrawingPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
  }, [setIsDrawing, setDrawingPoints, setSelectionPolygon, setDrawingMode]);

  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
    // Also clear editable vertices to ensure no leftover visual state
    const { setEditableVertices } = useStore.getState();
    setEditableVertices([]);
  }, [setIsDrawing, setDrawingPoints, setSelectionPolygon]);

  const completeDrawing = useCallback(() => {
    if (drawingMode === 'polygon' && drawingPoints.length < 3) return;

    let polygon: Polygon;

    if (drawingMode === 'polygon') {
      polygon = {
        type: 'Polygon',
        coordinates: [[...drawingPoints, drawingPoints[0]]],
      };
    } else if (drawingMode === 'rectangle' && drawingPoints.length === 2) {
      polygon = createRectanglePolygon(drawingPoints[0], drawingPoints[1]);
    } else if (drawingMode === 'circle' && drawingPoints.length === 2) {
      polygon = createCirclePolygon(drawingPoints[0], drawingPoints[1]);
    } else {
      return;
    }

    setIsDrawing(false);
    setDrawingPoints([]);
    onComplete(polygon);
  }, [drawingMode, drawingPoints, setIsDrawing, setDrawingPoints, onComplete]);

  const undoLastPoint = useCallback(() => {
    setDrawingPoints(drawingPoints.slice(0, -1));
  }, [drawingPoints, setDrawingPoints]);

  const handleModeChange = useCallback((mode: DrawingMode) => {
    setDrawingMode(mode);
    setDrawingPoints([]);
    setPreviewPolygon(null);
    setSelectionPolygon(null);
  }, [setDrawingMode, setDrawingPoints, setSelectionPolygon]);

  // Get status message based on mode and points
  const getStatusMessage = (): string => {
    if (drawingMode === 'polygon') {
      return `${drawingPoints.length} point${drawingPoints.length !== 1 ? 's' : ''} added`;
    } else if (drawingMode === 'rectangle') {
      if (drawingPoints.length === 0) return 'Click first corner';
      if (drawingPoints.length === 1) return 'Click second corner';
      return 'Rectangle complete';
    } else if (drawingMode === 'circle') {
      if (drawingPoints.length === 0) return 'Click center point';
      if (drawingPoints.length === 1) return 'Click to set radius';
      return 'Circle complete';
    }
    return '';
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {!isDrawing ? (
        <div
          style={{
            display: 'flex',
            gap: '8px',
          }}
        >
          {(['polygon', 'rectangle', 'circle'] as DrawingMode[]).map((mode) => {
            const colors: Record<DrawingMode, { bg: string; shadow: string }> = {
              polygon: { bg: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', shadow: 'rgba(16, 185, 129, 0.4)' },
              rectangle: { bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', shadow: 'rgba(245, 158, 11, 0.4)' },
              circle: { bg: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)', shadow: 'rgba(139, 92, 246, 0.4)' },
            };
            return (
              <button
                key={mode}
                onClick={() => startDrawing(mode)}
                style={{
                  padding: '12px 18px',
                  background: colors[mode].bg,
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: `0 4px 12px ${colors[mode].shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`,
                }}
                title={`Draw ${MODE_LABELS[mode]}`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = `0 6px 16px ${colors[mode].shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = `0 4px 12px ${colors[mode].shadow}, inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
                }}
              >
                <span style={{ fontSize: '16px' }}>{MODE_ICONS[mode]}</span>
                <span>{MODE_LABELS[mode]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: '16px',
            borderRadius: '8px',
            color: 'white',
            minWidth: '240px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Mode selector in drawing mode */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '12px',
            }}
          >
            {(['polygon', 'rectangle', 'circle'] as DrawingMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  backgroundColor: drawingMode === mode ? '#4A90D9' : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <span>{MODE_ICONS[mode]}</span>
                <span>{MODE_LABELS[mode]}</span>
              </button>
            ))}
          </div>

          <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '8px' }}>
            {MODE_INSTRUCTIONS[drawingMode]}
          </div>

          <div
            style={{
              fontSize: '12px',
              padding: '6px 10px',
              backgroundColor: 'rgba(74, 144, 217, 0.2)',
              borderRadius: '4px',
              marginBottom: '12px',
            }}
          >
            {getStatusMessage()}
          </div>

          {previewPolygon && (
            <div
              style={{
                fontSize: '12px',
                padding: '8px',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                borderRadius: '4px',
                marginBottom: '12px',
              }}
            >
              Area: {formatArea(calculatePolygonArea(previewPolygon))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {drawingMode === 'polygon' && (
              <>
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
                  ↩ Undo
                </button>
                <button
                  onClick={completeDrawing}
                  disabled={drawingPoints.length < 3}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: drawingPoints.length < 3 ? '#444' : '#22C55E',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: drawingPoints.length < 3 ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ✓ Complete
                </button>
              </>
            )}
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
  const areaAcres = areaKm2 * 247.105;
  const areaSqFt = areaM2 * 10.7639;

  if (areaKm2 < 0.01) {
    return `${areaM2.toFixed(0)} m² (${areaSqFt.toFixed(0)} sq ft)`;
  }
  if (areaKm2 < 1) {
    return `${areaHa.toFixed(2)} ha (${areaAcres.toFixed(2)} acres)`;
  }
  return `${areaKm2.toFixed(2)} km² (${areaAcres.toFixed(0)} acres)`;
}

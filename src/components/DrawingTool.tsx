import { useState, useEffect, useCallback, useRef } from 'react';
import type { Polygon } from 'geojson';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';
import type { DrawingMode } from '../types';

export interface ShapeInfo {
  polygon: Polygon;
  shapeType: DrawingMode;
  shapeParams?: {
    // Rectangle: 4 corner points
    rectangleCorners?: [[number, number], [number, number], [number, number], [number, number]];
    // Circle: center and radius
    circleCenter?: [number, number];
    circleRadius?: number;
  };
}

interface DrawingToolProps {
  onComplete: (shapeInfo: ShapeInfo) => void;
}

// Generate a rectangle polygon from three points (origin, edge point, width point)
// This allows creating rotated rectangles, not just axis-aligned ones
function createRectanglePolygon(
  origin: [number, number],
  edgePoint: [number, number],
  widthPoint: [number, number]
): Polygon {
  const [x1, y1] = origin;
  const [x2, y2] = edgePoint;
  const [x3, y3] = widthPoint;

  // Vector from origin to edge point (defines one edge)
  const vx = x2 - x1;
  const vy = y2 - y1;

  // Vector from origin to width point
  const wx = x3 - x1;
  const wy = y3 - y1;

  // Calculate perpendicular component of w relative to v
  // This gives us the width direction and magnitude
  const vLengthSq = vx * vx + vy * vy;
  if (vLengthSq === 0) {
    // Degenerate case: origin and edge point are the same
    return {
      type: 'Polygon',
      coordinates: [[[x1, y1], [x1, y1], [x1, y1], [x1, y1], [x1, y1]]],
    };
  }

  // Project w onto v: proj_v(w) = (w·v / v·v) * v
  const dotProduct = wx * vx + wy * vy;
  const projScale = dotProduct / vLengthSq;

  // Perpendicular component: w_perp = w - proj_v(w)
  const perpX = wx - projScale * vx;
  const perpY = wy - projScale * vy;

  // Four corners of the rectangle
  const c1: [number, number] = [x1, y1];                           // Origin
  const c2: [number, number] = [x2, y2];                           // Edge point
  const c3: [number, number] = [x2 + perpX, y2 + perpY];           // Edge point + perpendicular
  const c4: [number, number] = [x1 + perpX, y1 + perpY];           // Origin + perpendicular

  return {
    type: 'Polygon',
    coordinates: [[c1, c2, c3, c4, c1]], // Close the polygon
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
  rectangle: 'Click origin, edge point, then set width',
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
  const [showOptions, setShowOptions] = useState(false);

  // Use refs to avoid dependency issues in useEffect
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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
    if (drawingPoints.length === 0) {
      setPreviewPolygon(null);
      setSelectionPolygon(null);
      // Clear editable vertices too
      const { setEditableVertices } = useStore.getState();
      setEditableVertices([]);
      return;
    }

    let polygon: Polygon | null = null;

    if (drawingMode === 'polygon') {
      if (drawingPoints.length >= 3) {
        polygon = {
          type: 'Polygon',
          coordinates: [[...drawingPoints, drawingPoints[0]]],
        };
      }
    } else if (drawingMode === 'rectangle') {
      // For 3 points, show the complete rectangle
      if (drawingPoints.length === 3) {
        polygon = createRectanglePolygon(drawingPoints[0], drawingPoints[1], drawingPoints[2]);
      }
    } else if (drawingMode === 'circle') {
      if (drawingPoints.length === 2) {
        const center = drawingPoints[0];
        const edgePoint = drawingPoints[1];
        polygon = createCirclePolygon(center, edgePoint);
      }
    }

    if (polygon) {
      setPreviewPolygon(polygon);
      setSelectionPolygon({
        id: 'preview',
        geometry: polygon,
        area: calculatePolygonArea(polygon) * 1_000_000,
      });
    } else {
      setPreviewPolygon(null);
      setSelectionPolygon(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingPoints, drawingMode]);

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

    let shapeInfo: ShapeInfo;

    if (drawingMode === 'polygon') {
      shapeInfo = {
        polygon: {
          type: 'Polygon',
          coordinates: [[...drawingPoints, drawingPoints[0]]],
        },
        shapeType: 'polygon',
      };
    } else if (drawingMode === 'rectangle' && drawingPoints.length === 3) {
      const polygon = createRectanglePolygon(drawingPoints[0], drawingPoints[1], drawingPoints[2]);
      const coords = polygon.coordinates[0] as [number, number][];
      shapeInfo = {
        polygon,
        shapeType: 'rectangle',
        shapeParams: {
          rectangleCorners: [coords[0], coords[1], coords[2], coords[3]],
        },
      };
    } else if (drawingMode === 'circle' && drawingPoints.length === 2) {
      const center = drawingPoints[0];
      const edgePoint = drawingPoints[1];
      // Calculate radius
      const dLng = edgePoint[0] - center[0];
      const dLat = edgePoint[1] - center[1];
      const radius = Math.sqrt(dLng * dLng + dLat * dLat);
      shapeInfo = {
        polygon: createCirclePolygon(center, edgePoint),
        shapeType: 'circle',
        shapeParams: {
          circleCenter: center,
          circleRadius: radius,
        },
      };
    } else {
      return;
    }

    setIsDrawing(false);
    setDrawingPoints([]);
    onComplete(shapeInfo);
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
      if (drawingPoints.length === 0) return 'Click origin point';
      if (drawingPoints.length === 1) return 'Click to define edge';
      if (drawingPoints.length === 2) return 'Click to set width';
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
            flexDirection: 'column',
            gap: '10px',
            ...(showOptions && {
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              padding: '12px',
              borderRadius: '8px',
              margin: '-12px',
            }),
            transition: 'all 0.15s ease',
          }}
        >
          {/* Main button */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            style={{
              padding: '12px 16px',
              backgroundColor: showOptions ? 'rgba(74, 144, 217, 0.7)' : 'rgba(74, 144, 217, 0.55)',
              color: 'white',
              border: `1px solid ${showOptions ? 'rgba(74, 144, 217, 0.8)' : 'rgba(74, 144, 217, 0.6)'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              transition: 'all 0.15s ease',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              if (!showOptions) {
                e.currentTarget.style.backgroundColor = 'rgba(74, 144, 217, 0.65)';
                e.currentTarget.style.borderColor = 'rgba(74, 144, 217, 0.7)';
              }
            }}
            onMouseLeave={(e) => {
              if (!showOptions) {
                e.currentTarget.style.backgroundColor = 'rgba(74, 144, 217, 0.55)';
                e.currentTarget.style.borderColor = 'rgba(74, 144, 217, 0.6)';
              }
            }}
          >
            <span>Draw Selection Area</span>
            <span style={{ fontSize: '10px', opacity: 0.6 }}>{showOptions ? '▲' : '▼'}</span>
          </button>

          {/* Drawing mode options */}
          {showOptions && (
            <div
              style={{
                display: 'flex',
                gap: '6px',
              }}
            >
              {(['polygon', 'rectangle', 'circle'] as DrawingMode[]).map((mode) => {
                const iconColors: Record<DrawingMode, string> = {
                  polygon: 'inherit',
                  rectangle: '#F59E0B',
                  circle: '#A78BFA',
                };
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      startDrawing(mode);
                      setShowOptions(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: 'white',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                    title={`Draw ${MODE_LABELS[mode]}`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(74, 144, 217, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(74, 144, 217, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    }}
                  >
                    <span style={{ fontSize: '14px', color: iconColors[mode] }}>{MODE_ICONS[mode]}</span>
                    <span>{MODE_LABELS[mode]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            color: 'white',
            minWidth: '240px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            padding: '12px',
            borderRadius: '8px',
            margin: '-12px',
          }}
        >
          {/* Mode selector in drawing mode */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginBottom: '12px',
            }}
          >
            {(['polygon', 'rectangle', 'circle'] as DrawingMode[]).map((mode) => {
              const iconColors: Record<DrawingMode, string> = {
                polygon: 'inherit',
                rectangle: '#F59E0B',
                circle: '#A78BFA',
              };
              const isActive = drawingMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    backgroundColor: isActive ? 'rgba(74, 144, 217, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    border: `1px solid ${isActive ? 'rgba(74, 144, 217, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ color: isActive ? 'white' : iconColors[mode] }}>{MODE_ICONS[mode]}</span>
                  <span>{MODE_LABELS[mode]}</span>
                </button>
              );
            })}
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
            {/* Undo button - only for polygon mode */}
            {drawingMode === 'polygon' && (
              <button
                onClick={undoLastPoint}
                disabled={drawingPoints.length === 0}
                style={{
                  padding: '8px 14px',
                  backgroundColor: drawingPoints.length === 0 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  cursor: drawingPoints.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  opacity: drawingPoints.length === 0 ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                ↩ Undo
              </button>
            )}
            {/* Complete button - for all modes when shape is ready */}
            {(() => {
              const isPolygonReady = drawingMode === 'polygon' && drawingPoints.length >= 3;
              const isRectangleReady = drawingMode === 'rectangle' && drawingPoints.length === 3;
              const isCircleReady = drawingMode === 'circle' && drawingPoints.length === 2;
              const isReady = isPolygonReady || isRectangleReady || isCircleReady;

              return (
                <button
                  onClick={completeDrawing}
                  disabled={!isReady}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: !isReady ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.4)',
                    color: 'white',
                    border: `1px solid ${!isReady ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.6)'}`,
                    borderRadius: '6px',
                    cursor: !isReady ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    opacity: !isReady ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✓ Complete
                </button>
              );
            })()}
            <button
              onClick={cancelDrawing}
              style={{
                padding: '8px 14px',
                backgroundColor: 'rgba(217, 74, 74, 0.3)',
                color: 'white',
                border: '1px solid rgba(217, 74, 74, 0.5)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
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

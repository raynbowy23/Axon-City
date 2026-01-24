/**
 * Shape-preserving geometry utilities
 * Functions for resizing rectangles and circles while maintaining their shape
 */

import type { Polygon } from 'geojson';

/**
 * Create a rectangle polygon from 3 defining points
 * @param origin First corner
 * @param edgePoint Second corner (defines one edge)
 * @param widthPoint Third point (perpendicular distance defines width)
 */
export function createRectangleFromPoints(
  origin: [number, number],
  edgePoint: [number, number],
  widthPoint: [number, number]
): { polygon: Polygon; corners: [[number, number], [number, number], [number, number], [number, number]] } {
  const [x1, y1] = origin;
  const [x2, y2] = edgePoint;
  const [x3, y3] = widthPoint;

  // Vector from origin to edge point (defines one edge)
  const vx = x2 - x1;
  const vy = y2 - y1;

  // Vector from origin to width point
  const wx = x3 - x1;
  const wy = y3 - y1;

  // Calculate perpendicular component
  const vLengthSq = vx * vx + vy * vy;
  if (vLengthSq === 0) {
    const c: [number, number] = [x1, y1];
    return {
      polygon: { type: 'Polygon', coordinates: [[c, c, c, c, c]] },
      corners: [c, c, c, c],
    };
  }

  const dotProduct = wx * vx + wy * vy;
  const projScale = dotProduct / vLengthSq;
  const perpX = wx - projScale * vx;
  const perpY = wy - projScale * vy;

  const c1: [number, number] = [x1, y1];
  const c2: [number, number] = [x2, y2];
  const c3: [number, number] = [x2 + perpX, y2 + perpY];
  const c4: [number, number] = [x1 + perpX, y1 + perpY];

  return {
    polygon: { type: 'Polygon', coordinates: [[c1, c2, c3, c4, c1]] },
    corners: [c1, c2, c3, c4],
  };
}

/**
 * Resize a rectangle by moving one of its corners
 * Maintains the rectangular shape with parallel edges
 * @param cornerIndex Which corner is being moved (0-3)
 * @param newPosition New position of the corner
 * @param originalCorners Original 4 corners of the rectangle (used for edge directions)
 * @param currentCorners Current 4 corners (optional, defaults to originalCorners)
 *
 * Rectangle corners are arranged: c0 -> c1 -> c2 -> c3 -> c0
 * c0 and c2 are diagonal opposites
 * c1 and c3 are diagonal opposites
 *
 * The two edge directions from c0 are:
 * - e1: direction from c0 to c1
 * - e2: direction from c0 to c3 (perpendicular to e1)
 */
export function resizeRectangle(
  cornerIndex: number,
  newPosition: [number, number],
  originalCorners: [[number, number], [number, number], [number, number], [number, number]],
  currentCorners?: [[number, number], [number, number], [number, number], [number, number]]
): { polygon: Polygon; corners: [[number, number], [number, number], [number, number], [number, number]] } {
  const [oc0, oc1, , oc3] = originalCorners;
  const corners = currentCorners || originalCorners;
  const [c0, c1, c2, c3] = corners;

  // Calculate the two edge direction unit vectors from ORIGINAL corners
  // This keeps the edge directions consistent during drag
  const edge1 = [oc1[0] - oc0[0], oc1[1] - oc0[1]];
  const edge2 = [oc3[0] - oc0[0], oc3[1] - oc0[1]];

  const edge1Len = Math.sqrt(edge1[0] * edge1[0] + edge1[1] * edge1[1]);
  const edge2Len = Math.sqrt(edge2[0] * edge2[0] + edge2[1] * edge2[1]);

  if (edge1Len === 0 || edge2Len === 0) {
    return { polygon: { type: 'Polygon', coordinates: [[c0, c1, c2, c3, c0]] }, corners: [c0, c1, c2, c3] };
  }

  // Unit vectors for edge directions (from original rectangle)
  const e1 = [edge1[0] / edge1Len, edge1[1] / edge1Len];
  const e2 = [edge2[0] / edge2Len, edge2[1] / edge2Len];

  let newCorners: [[number, number], [number, number], [number, number], [number, number]];

  switch (cornerIndex) {
    case 0: {
      // Dragging c0, c2 stays fixed
      const toFixed = [c2[0] - newPosition[0], c2[1] - newPosition[1]];
      const len1 = toFixed[0] * e1[0] + toFixed[1] * e1[1];
      const len2 = toFixed[0] * e2[0] + toFixed[1] * e2[1];

      const newC0: [number, number] = newPosition;
      const newC1: [number, number] = [newPosition[0] + len1 * e1[0], newPosition[1] + len1 * e1[1]];
      const newC3: [number, number] = [newPosition[0] + len2 * e2[0], newPosition[1] + len2 * e2[1]];
      newCorners = [newC0, newC1, c2, newC3];
      break;
    }
    case 1: {
      // Dragging c1, c3 stays fixed
      const toFixed = [c3[0] - newPosition[0], c3[1] - newPosition[1]];
      const len1 = -(toFixed[0] * e1[0] + toFixed[1] * e1[1]);
      const len2 = toFixed[0] * e2[0] + toFixed[1] * e2[1];

      const newC1: [number, number] = newPosition;
      const newC0: [number, number] = [newPosition[0] - len1 * e1[0], newPosition[1] - len1 * e1[1]];
      const newC2: [number, number] = [newPosition[0] + len2 * e2[0], newPosition[1] + len2 * e2[1]];
      newCorners = [newC0, newC1, newC2, c3];
      break;
    }
    case 2: {
      // Dragging c2, c0 stays fixed
      const toNew = [newPosition[0] - c0[0], newPosition[1] - c0[1]];
      const len1 = toNew[0] * e1[0] + toNew[1] * e1[1];
      const len2 = toNew[0] * e2[0] + toNew[1] * e2[1];

      const newC2: [number, number] = newPosition;
      const newC1: [number, number] = [c0[0] + len1 * e1[0], c0[1] + len1 * e1[1]];
      const newC3: [number, number] = [c0[0] + len2 * e2[0], c0[1] + len2 * e2[1]];
      newCorners = [c0, newC1, newC2, newC3];
      break;
    }
    case 3: {
      // Dragging c3, c1 stays fixed
      const toFixed = [c1[0] - newPosition[0], c1[1] - newPosition[1]];
      const len1 = toFixed[0] * e1[0] + toFixed[1] * e1[1];
      const len2 = -(toFixed[0] * e2[0] + toFixed[1] * e2[1]);

      const newC3: [number, number] = newPosition;
      const newC0: [number, number] = [newPosition[0] - len2 * e2[0], newPosition[1] - len2 * e2[1]];
      const newC2: [number, number] = [newPosition[0] + len1 * e1[0], newPosition[1] + len1 * e1[1]];
      newCorners = [newC0, c1, newC2, newC3];
      break;
    }
    default:
      newCorners = [c0, c1, c2, c3];
  }

  return {
    polygon: { type: 'Polygon', coordinates: [[newCorners[0], newCorners[1], newCorners[2], newCorners[3], newCorners[0]]] },
    corners: newCorners,
  };
}

/**
 * Create a circle polygon from center and radius
 * @param center Center point [lng, lat]
 * @param radius Radius in degrees
 * @param numPoints Number of points to approximate the circle (default 64)
 */
export function createCircleFromCenterRadius(
  center: [number, number],
  radius: number,
  numPoints: number = 64
): Polygon {
  const [cLng, cLat] = center;
  const points: [number, number][] = [];

  // Adjust for latitude distortion
  const latCorrectionFactor = Math.cos((cLat * Math.PI) / 180);

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const lng = cLng + (radius * Math.cos(angle)) / latCorrectionFactor;
    const lat = cLat + radius * Math.sin(angle);
    points.push([lng, lat]);
  }

  points.push(points[0]); // Close the polygon

  return {
    type: 'Polygon',
    coordinates: [points],
  };
}

/**
 * Resize a circle by moving any point on its edge
 * @param newEdgePosition New position of the edge point being dragged
 * @param center Circle center
 */
export function resizeCircle(
  newEdgePosition: [number, number],
  center: [number, number],
  numPoints: number = 64
): { polygon: Polygon; radius: number } {
  const [eLng, eLat] = newEdgePosition;
  const [cLng, cLat] = center;

  // Adjust for latitude distortion when calculating radius
  const latCorrectionFactor = Math.cos((cLat * Math.PI) / 180);

  // Calculate new radius
  const dLng = (eLng - cLng) * latCorrectionFactor;
  const dLat = eLat - cLat;
  const radius = Math.sqrt(dLng * dLng + dLat * dLat);

  return {
    polygon: createCircleFromCenterRadius(center, radius, numPoints),
    radius,
  };
}

/**
 * Calculate circle center from a circle polygon
 * @param coords Circle polygon coordinates
 */
export function getCircleCenter(coords: [number, number][]): [number, number] {
  // For a regular circle polygon, the center is the average of all points
  let sumLng = 0;
  let sumLat = 0;
  const n = coords.length - 1; // Exclude closing point

  for (let i = 0; i < n; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }

  return [sumLng / n, sumLat / n];
}

/**
 * Calculate circle radius from center and a point on the edge
 * @param center Circle center
 * @param edgePoint A point on the circle edge
 */
export function getCircleRadius(center: [number, number], edgePoint: [number, number]): number {
  const [cLng, cLat] = center;
  const [eLng, eLat] = edgePoint;

  const latCorrectionFactor = Math.cos((cLat * Math.PI) / 180);
  const dLng = (eLng - cLng) * latCorrectionFactor;
  const dLat = eLat - cLat;

  return Math.sqrt(dLng * dLng + dLat * dLat);
}

/**
 * Extract the 4 corners from a rectangle polygon
 * Accepts either 4 points (vertices only) or 5 points (vertices + closing point)
 */
export function getRectangleCorners(
  coords: [number, number][]
): [[number, number], [number, number], [number, number], [number, number]] | null {
  // Accept both 4 vertices (editableVertices) or 5 points (polygon coordinates with closing)
  if (coords.length !== 4 && coords.length !== 5) return null;
  return [coords[0], coords[1], coords[2], coords[3]];
}

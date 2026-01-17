import type { FeatureCollection, Feature, Polygon, Point, LineString } from 'geojson';
import type { LayerConfig } from '../types';

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: { type: string; ref: number; role: string }[];
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

/**
 * Fetch OSM data for a specific layer within a bounding box
 * Includes retry logic with exponential backoff for rate limiting
 */
export async function fetchLayerData(
  layer: LayerConfig,
  bbox: [number, number, number, number], // [minLon, minLat, maxLon, maxLat]
  maxRetries: number = 3
): Promise<FeatureCollection> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  // Build Overpass query based on layer config
  const query = buildOverpassQuery(layer, bboxStr);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(OVERPASS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429) {
        // Rate limited - wait with exponential backoff
        const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`Rate limited for ${layer.id}, waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status === 504) {
        // Gateway timeout - retry with backoff
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`Timeout for ${layer.id}, waiting ${waitTime}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data: OverpassResponse = await response.json();
      return convertToGeoJSON(data, layer);
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt + 1} failed for layer ${layer.id}:`, error);

      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`Failed to fetch layer ${layer.id} after ${maxRetries} attempts:`, lastError);
  return { type: 'FeatureCollection', features: [] };
}

/**
 * Build Overpass QL query from layer config
 */
function buildOverpassQuery(layer: LayerConfig, bboxStr: string): string {
  const { osmQuery, geometryType } = layer;

  // Parse the osmQuery - split on | only when it's between queries (not inside quotes)
  // Pattern: split on | that is followed by 'node', 'way', or 'relation'
  const queryParts = splitQueryParts(osmQuery);

  let output = '[out:json][timeout:30];\n(\n';

  for (const part of queryParts) {
    const trimmed = part.trim();
    // Handle different element types
    if (trimmed.startsWith('node') || trimmed.startsWith('way') || trimmed.startsWith('relation')) {
      output += `  ${trimmed}(${bboxStr});\n`;
    }
  }

  output += ');\n';

  // For ways and relations, we need geometry
  if (geometryType === 'polygon' || geometryType === 'line') {
    output += 'out body geom;\n';
  } else {
    output += 'out body;\n';
  }

  return output;
}

/**
 * Split query string on | but only between separate queries, not inside regex patterns
 */
function splitQueryParts(osmQuery: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < osmQuery.length; i++) {
    const char = osmQuery[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '|' && !inQuotes) {
      // Only split on | outside of quotes
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last part
  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Convert Overpass response to GeoJSON
 */
function convertToGeoJSON(
  data: OverpassResponse,
  layer: LayerConfig
): FeatureCollection {
  const features: Feature[] = [];

  for (const element of data.elements) {
    const feature = elementToFeature(element, layer);
    if (feature) {
      features.push(feature);
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Convert a single Overpass element to a GeoJSON feature
 */
function elementToFeature(
  element: OverpassElement,
  layer: LayerConfig
): Feature | null {
  const { geometryType } = layer;

  if (element.type === 'node' && geometryType === 'point') {
    if (element.lat === undefined || element.lon === undefined) return null;

    return {
      type: 'Feature',
      id: element.id,
      properties: {
        id: element.id,
        type: element.type,
        ...element.tags,
      },
      geometry: {
        type: 'Point',
        coordinates: [element.lon, element.lat],
      } as Point,
    };
  }

  if (element.type === 'way' && element.geometry) {
    const coordinates = element.geometry.map((g) => [g.lon, g.lat]);

    if (geometryType === 'line') {
      return {
        type: 'Feature',
        id: element.id,
        properties: {
          id: element.id,
          type: element.type,
          ...element.tags,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        } as LineString,
      };
    }

    if (geometryType === 'polygon') {
      // Close the polygon if needed
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push(first);
      }

      // Skip invalid polygons
      if (coordinates.length < 4) return null;

      return {
        type: 'Feature',
        id: element.id,
        properties: {
          id: element.id,
          type: element.type,
          ...element.tags,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        } as Polygon,
      };
    }
  }

  return null;
}

/**
 * Fetch multiple layers sequentially to avoid rate limiting
 */
export async function fetchMultipleLayers(
  layers: LayerConfig[],
  bbox: [number, number, number, number],
  onProgress?: (layerId: string, progress: number, total: number) => void
): Promise<Map<string, FeatureCollection>> {
  const results = new Map<string, FeatureCollection>();
  const total = layers.length;

  // Fetch layers one at a time to avoid rate limiting
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];

    const data = await fetchLayerData(layer, bbox);
    results.set(layer.id, data);
    onProgress?.(layer.id, results.size, total);

    // Delay between requests to respect API rate limits
    if (i < layers.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second between requests
    }
  }

  return results;
}

/**
 * Calculate bounding box from a polygon (with buffer)
 */
export function getBboxFromPolygon(
  polygon: Polygon,
  bufferDegrees: number = 0.001
): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const ring of polygon.coordinates) {
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }

  return [
    minLon - bufferDegrees,
    minLat - bufferDegrees,
    maxLon + bufferDegrees,
    maxLat + bufferDegrees,
  ];
}

import type { FeatureCollection, Feature, Polygon, Point, LineString } from 'geojson';
import type { LayerConfig } from '../types';

// Multiple Overpass API endpoints for failover
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Query timeout in seconds (increased for complex queries)
const QUERY_TIMEOUT = 90;

// Fetch timeout in milliseconds
const FETCH_TIMEOUT = 120000; // 2 minutes

// Max concurrent requests
const MAX_CONCURRENT = 3;

// Cache for responses (bbox -> layer -> data)
const responseCache = new Map<string, Map<string, FeatureCollection>>();

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
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
 * Create an AbortController with timeout
 */
function createTimeoutController(timeoutMs: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * Fetch with timeout and abort support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT
): Promise<Response> {
  const { controller, timeoutId } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Get cache key for bbox
 */
function getBboxCacheKey(bbox: [number, number, number, number]): string {
  return bbox.map(n => n.toFixed(6)).join(',');
}

/**
 * Fetch OSM data for a specific layer within a bounding box
 * Uses multiple endpoints with failover and retry logic
 */
export async function fetchLayerData(
  layer: LayerConfig,
  bbox: [number, number, number, number],
  maxRetries: number = 3
): Promise<FeatureCollection> {
  // Check cache first
  const cacheKey = getBboxCacheKey(bbox);
  const layerCache = responseCache.get(cacheKey);
  if (layerCache?.has(layer.id)) {
    console.log(`Cache hit for layer ${layer.id}`);
    return layerCache.get(layer.id)!;
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  // Build Overpass query based on layer config
  const query = buildOverpassQuery(layer, bboxStr);

  let lastError: Error | null = null;
  let endpointIndex = 0;

  for (let attempt = 0; attempt < maxRetries * OVERPASS_ENDPOINTS.length; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[endpointIndex];

    try {
      console.log(`Fetching ${layer.id} from ${endpoint} (attempt ${attempt + 1})`);

      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `data=${encodeURIComponent(query)}`,
        },
        FETCH_TIMEOUT
      );

      if (response.status === 429) {
        // Rate limited - try next endpoint immediately
        console.warn(`Rate limited at ${endpoint} for ${layer.id}, trying next endpoint...`);
        endpointIndex = (endpointIndex + 1) % OVERPASS_ENDPOINTS.length;
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      if (response.status === 504 || response.status === 503) {
        // Server overloaded - try next endpoint
        console.warn(`Server error ${response.status} at ${endpoint} for ${layer.id}, trying next endpoint...`);
        endpointIndex = (endpointIndex + 1) % OVERPASS_ENDPOINTS.length;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (response.status === 400) {
        // Bad request - query might be malformed, log and skip
        const errorText = await response.text();
        console.error(`Bad request for layer ${layer.id}: ${errorText.slice(0, 200)}`);
        return { type: 'FeatureCollection', features: [] };
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data: OverpassResponse = await response.json();
      const result = convertToGeoJSON(data, layer);

      // Cache the result
      if (!responseCache.has(cacheKey)) {
        responseCache.set(cacheKey, new Map());
      }
      responseCache.get(cacheKey)!.set(layer.id, result);

      console.log(`Successfully fetched ${result.features.length} features for ${layer.id}`);
      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt + 1} failed for layer ${layer.id} at ${endpoint}:`, error);

      // Rotate to next endpoint on network errors
      if (error instanceof Error && (error.message === 'Request timeout' || error.message.includes('fetch'))) {
        endpointIndex = (endpointIndex + 1) % OVERPASS_ENDPOINTS.length;
      }

      // Wait before retry with exponential backoff
      const waitTime = Math.min(Math.pow(2, Math.floor(attempt / OVERPASS_ENDPOINTS.length)) * 1000, 8000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  console.error(`Failed to fetch layer ${layer.id} after all attempts:`, lastError);
  return { type: 'FeatureCollection', features: [] };
}

/**
 * Build Overpass QL query from layer config
 * Optimized with longer timeout and maxsize limit
 */
function buildOverpassQuery(layer: LayerConfig, bboxStr: string): string {
  const { osmQuery, geometryType } = layer;

  // Parse the osmQuery - split on | only when it's between queries
  const queryParts = splitQueryParts(osmQuery);

  // Use longer timeout and set maxsize to prevent memory issues
  let output = `[out:json][timeout:${QUERY_TIMEOUT}][maxsize:67108864];\n(\n`;

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

  // Handle relations (multipolygons) for polygon layers
  if (element.type === 'relation' && geometryType === 'polygon' && element.members) {
    const outerRings: number[][][] = [];
    const innerRings: number[][][] = [];

    for (const member of element.members) {
      if (member.type === 'way' && member.geometry) {
        const ring = member.geometry.map((g) => [g.lon, g.lat]);

        // Close the ring if needed
        if (ring.length >= 3) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([...first]);
          }
        }

        if (ring.length >= 4) {
          if (member.role === 'outer') {
            outerRings.push(ring);
          } else if (member.role === 'inner') {
            innerRings.push(ring);
          }
        }
      }
    }

    if (outerRings.length === 0) return null;

    // For simplicity, create a MultiPolygon if multiple outer rings
    // or a Polygon with holes if single outer ring with inner rings
    if (outerRings.length === 1) {
      const polygonCoords = [outerRings[0], ...innerRings];
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
          coordinates: polygonCoords,
        } as Polygon,
      };
    } else {
      // Multiple outer rings - create MultiPolygon
      const multiCoords = outerRings.map((outer) => [outer]);
      return {
        type: 'Feature',
        id: element.id,
        properties: {
          id: element.id,
          type: element.type,
          ...element.tags,
        },
        geometry: {
          type: 'MultiPolygon',
          coordinates: multiCoords,
        },
      };
    }
  }

  return null;
}

/**
 * Fetch multiple layers with parallel execution and concurrency limit
 */
export async function fetchMultipleLayers(
  layers: LayerConfig[],
  bbox: [number, number, number, number],
  onProgress?: (layerId: string, progress: number, total: number) => void
): Promise<Map<string, FeatureCollection>> {
  const results = new Map<string, FeatureCollection>();
  const total = layers.length;
  let completed = 0;

  // Process layers in batches with limited concurrency
  const processBatch = async (batch: LayerConfig[]) => {
    const promises = batch.map(async (layer) => {
      const data = await fetchLayerData(layer, bbox);
      results.set(layer.id, data);
      completed++;
      onProgress?.(layer.id, completed, total);
      return data;
    });
    await Promise.all(promises);
  };

  // Split into batches
  for (let i = 0; i < layers.length; i += MAX_CONCURRENT) {
    const batch = layers.slice(i, i + MAX_CONCURRENT);
    await processBatch(batch);

    // Small delay between batches to avoid overwhelming servers
    if (i + MAX_CONCURRENT < layers.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
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

/**
 * Clear the response cache (useful when selection changes)
 */
export function clearCache(): void {
  responseCache.clear();
}

import type { FeatureCollection, Feature, Polygon, Point, LineString } from 'geojson';
import type { LayerConfig } from '../types';
import { getCachedResponse, setCachedResponse, clearPersistentCache } from './osmCache';

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

// Layers combined into a single Overpass request. Fewer requests keeps us
// under the per-IP rate limits of the public servers, while each query
// stays within server time/size limits.
const BATCH_SIZE = 8;

// In-memory cache (L1); the persistent IndexedDB cache in osmCache.ts is L2
const responseCache = new Map<string, FeatureCollection>();

interface OverpassElement {
  type: 'node' | 'way' | 'relation' | 'count';
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
  timeoutMs: number = FETCH_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> {
  const { controller, timeoutId } = createTimeoutController(timeoutMs);

  // If external signal is provided, listen to it
  const abortHandler = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Cancelled');
    }
    externalSignal.addEventListener('abort', abortHandler);
  }

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
      // Check if it was cancelled externally
      if (externalSignal?.aborted) {
        throw new Error('Cancelled');
      }
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortHandler);
    }
  }
}

/**
 * Get cache key for bbox
 */
function getBboxCacheKey(bbox: [number, number, number, number]): string {
  return bbox.map(n => n.toFixed(6)).join(',');
}

/**
 * Cache key for a layer's data within a bbox. Includes the query and
 * geometry type so manifest edits invalidate stale persistent entries.
 */
function getLayerCacheKey(layer: LayerConfig, bbox: [number, number, number, number]): string {
  return `${layer.id}|${layer.osmQuery}|${layer.geometryType}|${getBboxCacheKey(bbox)}`;
}

/**
 * Look up a layer's data in the in-memory cache, then IndexedDB
 */
async function getCachedLayer(cacheKey: string): Promise<FeatureCollection | null> {
  const inMemory = responseCache.get(cacheKey);
  if (inMemory) return inMemory;

  const persisted = await getCachedResponse(cacheKey);
  if (persisted) {
    responseCache.set(cacheKey, persisted);
    return persisted;
  }
  return null;
}

/**
 * Store a layer's data in both cache levels
 */
function storeCachedLayer(cacheKey: string, data: FeatureCollection): void {
  responseCache.set(cacheKey, data);
  void setCachedResponse(cacheKey, data);
}

function bboxToOverpassString(bbox: [number, number, number, number]): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return `${minLat},${minLon},${maxLat},${maxLon}`;
}

// Thrown on HTTP 400 so callers can tell "query is malformed" apart from
// transient server errors (a malformed query will never succeed on retry)
class BadQueryError extends Error {}

/**
 * Execute an Overpass query with endpoint failover, rate-limit handling,
 * and exponential backoff. Throws if all attempts fail.
 */
async function executeOverpassQuery(
  query: string,
  maxRetries: number = 3,
  signal?: AbortSignal,
  label: string = 'query'
): Promise<OverpassResponse> {
  let lastError: Error | null = null;
  let endpointIndex = 0;

  for (let attempt = 0; attempt < maxRetries * OVERPASS_ENDPOINTS.length; attempt++) {
    // Check if cancelled before each attempt
    if (signal?.aborted) {
      throw new Error('Cancelled');
    }

    const endpoint = OVERPASS_ENDPOINTS[endpointIndex];

    try {
      console.log(`Fetching ${label} from ${endpoint} (attempt ${attempt + 1})`);

      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `data=${encodeURIComponent(query)}`,
        },
        FETCH_TIMEOUT,
        signal
      );

      if (response.status === 429) {
        // Rate limited - honor Retry-After (capped so failover stays fast),
        // then try the next endpoint
        const retryAfter = Number(response.headers.get('Retry-After'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 15000)
          : 500;
        console.warn(`Rate limited at ${endpoint} for ${label}, waiting ${waitMs}ms and trying next endpoint...`);
        endpointIndex = (endpointIndex + 1) % OVERPASS_ENDPOINTS.length;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (response.status === 504 || response.status === 503) {
        // Server overloaded - try next endpoint
        console.warn(`Server error ${response.status} at ${endpoint} for ${label}, trying next endpoint...`);
        endpointIndex = (endpointIndex + 1) % OVERPASS_ENDPOINTS.length;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (response.status === 400) {
        const errorText = await response.text();
        throw new BadQueryError(`Bad request for ${label}: ${errorText.slice(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      return (await response.json()) as OverpassResponse;
    } catch (error) {
      if (error instanceof Error && (error.message === 'Cancelled' || error instanceof BadQueryError)) {
        throw error;
      }

      lastError = error as Error;
      console.error(`Attempt ${attempt + 1} failed for ${label} at ${endpoint}:`, error);

      // Rotate to next endpoint on network errors
      if (error instanceof Error && (error.message === 'Request timeout' || error.message.includes('fetch'))) {
        endpointIndex = (endpointIndex + 1) % OVERPASS_ENDPOINTS.length;
      }

      // Wait before retry with exponential backoff
      const waitTime = Math.min(Math.pow(2, Math.floor(attempt / OVERPASS_ENDPOINTS.length)) * 1000, 8000);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError ?? new Error(`Overpass query failed for ${label}`);
}

/**
 * Fetch OSM data for a specific layer within a bounding box
 * Uses multiple endpoints with failover and retry logic
 */
export async function fetchLayerData(
  layer: LayerConfig,
  bbox: [number, number, number, number],
  maxRetries: number = 3,
  signal?: AbortSignal
): Promise<FeatureCollection> {
  // Check if already cancelled
  if (signal?.aborted) {
    throw new Error('Cancelled');
  }

  // Check caches first
  const cacheKey = getLayerCacheKey(layer, bbox);
  const cached = await getCachedLayer(cacheKey);
  if (cached) {
    console.log(`Cache hit for layer ${layer.id}`);
    return cached;
  }

  const query = buildOverpassQuery(layer, bboxToOverpassString(bbox));

  try {
    const data = await executeOverpassQuery(query, maxRetries, signal, layer.id);
    const result = convertToGeoJSON(data, layer);
    storeCachedLayer(cacheKey, result);
    console.log(`Successfully fetched ${result.features.length} features for ${layer.id}`);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message === 'Cancelled') {
      throw error;
    }
    console.error(`Failed to fetch layer ${layer.id} after all attempts:`, error);
    return { type: 'FeatureCollection', features: [] };
  }
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
 * Build a single Overpass query covering multiple layers. Each layer's
 * union is followed by its own `out` statement plus an `out count;` marker,
 * so the response can be split back into exact per-layer segments without
 * re-implementing Overpass tag matching client-side.
 */
function buildBatchedQuery(layers: LayerConfig[], bboxStr: string): string {
  // Larger maxsize than single-layer queries since one response carries
  // several layers' data
  let output = `[out:json][timeout:${QUERY_TIMEOUT}][maxsize:134217728];\n`;

  for (const layer of layers) {
    output += '(\n';
    for (const part of splitQueryParts(layer.osmQuery)) {
      const trimmed = part.trim();
      if (trimmed.startsWith('node') || trimmed.startsWith('way') || trimmed.startsWith('relation')) {
        output += `  ${trimmed}(${bboxStr});\n`;
      }
    }
    output += ');\n';

    if (layer.geometryType === 'polygon' || layer.geometryType === 'line') {
      output += 'out body geom;\n';
    } else {
      output += 'out body;\n';
    }
    output += 'out count;\n';
  }

  return output;
}

/**
 * Split a batched response into per-layer element segments using the
 * `count` marker elements as separators
 */
function splitBatchedElements(elements: OverpassElement[]): OverpassElement[][] {
  const segments: OverpassElement[][] = [];
  let current: OverpassElement[] = [];

  for (const element of elements) {
    if (element.type === 'count') {
      segments.push(current);
      current = [];
    } else {
      current.push(element);
    }
  }

  return segments;
}

/**
 * A layer with no parseable query parts would produce an empty union and
 * break segment alignment in a batched query
 */
function hasValidQueryParts(layer: LayerConfig): boolean {
  return splitQueryParts(layer.osmQuery).some((part) => {
    const trimmed = part.trim();
    return trimmed.startsWith('node') || trimmed.startsWith('way') || trimmed.startsWith('relation');
  });
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
 * Fetch multiple layers, combining them into a few batched Overpass
 * requests instead of one request per layer. Cached layers (memory or
 * IndexedDB) are served without touching the network.
 */
export async function fetchMultipleLayers(
  layers: LayerConfig[],
  bbox: [number, number, number, number],
  onProgress?: (layerId: string, progress: number, total: number) => void,
  signal?: AbortSignal
): Promise<Map<string, FeatureCollection>> {
  const results = new Map<string, FeatureCollection>();
  const total = layers.length;
  let completed = 0;

  // Check if already cancelled
  if (signal?.aborted) {
    throw new Error('Cancelled');
  }

  const reportDone = (layerId: string) => {
    completed++;
    onProgress?.(layerId, completed, total);
  };

  // Serve everything we can from cache first
  const uncached: LayerConfig[] = [];
  for (const layer of layers) {
    if (!hasValidQueryParts(layer)) {
      results.set(layer.id, { type: 'FeatureCollection', features: [] });
      reportDone(layer.id);
      continue;
    }

    const cached = await getCachedLayer(getLayerCacheKey(layer, bbox));
    if (cached) {
      console.log(`Cache hit for layer ${layer.id}`);
      results.set(layer.id, cached);
      reportDone(layer.id);
    } else {
      uncached.push(layer);
    }
  }

  const bboxStr = bboxToOverpassString(bbox);

  // Fetch remaining layers in combined requests, sequentially to stay
  // within the public servers' per-IP slot limits
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    if (signal?.aborted) {
      throw new Error('Cancelled');
    }

    const batch = uncached.slice(i, i + BATCH_SIZE);

    try {
      const label = `batch [${batch.map((l) => l.id).join(', ')}]`;
      const data = await executeOverpassQuery(buildBatchedQuery(batch, bboxStr), 3, signal, label);

      const segments = splitBatchedElements(data.elements);
      if (segments.length !== batch.length) {
        throw new Error(`Batched response had ${segments.length} segments for ${batch.length} layers`);
      }

      batch.forEach((layer, index) => {
        const result = convertToGeoJSON({ ...data, elements: segments[index] }, layer);
        storeCachedLayer(getLayerCacheKey(layer, bbox), result);
        results.set(layer.id, result);
        console.log(`Successfully fetched ${result.features.length} features for ${layer.id}`);
        reportDone(layer.id);
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Cancelled') {
        throw error;
      }

      // Batch failed (e.g. one malformed sub-query poisoning the whole
      // request) - fall back to per-layer requests so the rest still load
      console.warn('Batched fetch failed, falling back to per-layer requests:', error);
      for (const layer of batch) {
        const data = await fetchLayerData(layer, bbox, 2, signal);
        results.set(layer.id, data);
        reportDone(layer.id);
      }
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
 * Clear both cache levels (useful when fresh data is explicitly wanted)
 */
export function clearCache(): void {
  responseCache.clear();
  void clearPersistentCache();
}

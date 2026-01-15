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
 */
export async function fetchLayerData(
  layer: LayerConfig,
  bbox: [number, number, number, number] // [minLon, minLat, maxLon, maxLat]
): Promise<FeatureCollection> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  // Build Overpass query based on layer config
  const query = buildOverpassQuery(layer, bboxStr);

  try {
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data: OverpassResponse = await response.json();
    return convertToGeoJSON(data, layer);
  } catch (error) {
    console.error(`Failed to fetch layer ${layer.id}:`, error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Build Overpass QL query from layer config
 */
function buildOverpassQuery(layer: LayerConfig, bboxStr: string): string {
  const { osmQuery, geometryType } = layer;

  // Parse the osmQuery which can have multiple parts separated by |
  const queryParts = osmQuery.split('|').map((part) => part.trim());

  let output = '[out:json][timeout:30];\n(\n';

  for (const part of queryParts) {
    // Handle different element types
    if (part.startsWith('node')) {
      output += `  ${part}(${bboxStr});\n`;
    } else if (part.startsWith('way')) {
      output += `  ${part}(${bboxStr});\n`;
    } else if (part.startsWith('relation')) {
      output += `  ${part}(${bboxStr});\n`;
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
 * Fetch multiple layers in parallel
 */
export async function fetchMultipleLayers(
  layers: LayerConfig[],
  bbox: [number, number, number, number],
  onProgress?: (layerId: string, progress: number, total: number) => void
): Promise<Map<string, FeatureCollection>> {
  const results = new Map<string, FeatureCollection>();
  const total = layers.length;

  // Fetch layers in batches to avoid overwhelming the API
  const batchSize = 3;
  for (let i = 0; i < layers.length; i += batchSize) {
    const batch = layers.slice(i, i + batchSize);
    const promises = batch.map(async (layer) => {
      const data = await fetchLayerData(layer, bbox);
      results.set(layer.id, data);
      onProgress?.(layer.id, results.size, total);
      return { layerId: layer.id, data };
    });

    await Promise.all(promises);

    // Small delay between batches to be nice to the API
    if (i + batchSize < layers.length) {
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

import * as turf from '@turf/turf';
import type {
  FeatureCollection,
  Feature,
  Polygon,
  MultiPolygon,
  LineString,
  Point,
} from 'geojson';
import type { LayerConfig, LayerStats } from '../types';

/**
 * Clip features to a polygon boundary
 */
export function clipFeaturesToPolygon(
  features: FeatureCollection,
  clipPolygon: Polygon | MultiPolygon,
  geometryType: 'polygon' | 'line' | 'point'
): FeatureCollection {
  const clippedFeatures: Feature[] = [];

  for (const feature of features.features) {
    try {
      const clipped = clipFeature(feature, clipPolygon, geometryType);
      if (clipped) {
        clippedFeatures.push(clipped);
      }
    } catch (error) {
      // Skip features that fail to clip (invalid geometries)
      console.warn('Failed to clip feature:', error);
    }
  }

  return {
    type: 'FeatureCollection',
    features: clippedFeatures,
  };
}

/**
 * Clip a single feature to a polygon
 */
function clipFeature(
  feature: Feature,
  clipPolygon: Polygon | MultiPolygon,
  geometryType: 'polygon' | 'line' | 'point'
): Feature | null {
  if (!feature.geometry) return null;

  const clipFeatureObj = turf.feature(clipPolygon);

  switch (geometryType) {
    case 'polygon': {
      const poly = feature as Feature<Polygon | MultiPolygon>;
      const intersection = turf.intersect(
        turf.featureCollection([poly, clipFeatureObj as Feature<Polygon>])
      );
      if (intersection) {
        return {
          ...feature,
          geometry: intersection.geometry,
        };
      }
      return null;
    }

    case 'line': {
      const line = feature as Feature<LineString>;
      // Check if line intersects the polygon first
      if (!turf.booleanIntersects(line, clipFeatureObj)) {
        return null;
      }
      // Split the line by the polygon boundary
      const clipped = turf.lineSplit(line, clipFeatureObj);
      if (clipped.features.length === 0) {
        // Line is entirely within polygon
        if (turf.booleanWithin(line, clipFeatureObj)) {
          return feature;
        }
        return null;
      }
      // Return segments that are within the polygon
      const withinSegments = clipped.features.filter((segment) =>
        turf.booleanWithin(turf.centroid(segment), clipFeatureObj)
      );
      if (withinSegments.length === 0) {
        // Original line might be within, check that
        if (turf.booleanWithin(turf.centroid(line), clipFeatureObj)) {
          return feature;
        }
        return null;
      }
      if (withinSegments.length === 1) {
        return {
          ...feature,
          geometry: withinSegments[0].geometry,
        };
      }
      // Merge multiple segments
      return {
        ...feature,
        geometry: {
          type: 'MultiLineString',
          coordinates: withinSegments.map((s) => s.geometry.coordinates),
        },
      };
    }

    case 'point': {
      const point = feature as Feature<Point>;
      if (turf.booleanPointInPolygon(point, clipFeatureObj)) {
        return feature;
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Calculate statistics for a layer within a polygon
 */
export function calculateLayerStats(
  features: FeatureCollection,
  layer: LayerConfig,
  polygonAreaKm2: number
): LayerStats {
  const stats: LayerStats = {
    count: features.features.length,
  };

  const { statsRecipes, geometryType } = layer;

  if (statsRecipes.includes('density') && polygonAreaKm2 > 0) {
    stats.density = features.features.length / polygonAreaKm2;
  }

  if (statsRecipes.includes('length') && geometryType === 'line') {
    let totalLength = 0;
    for (const feature of features.features) {
      try {
        totalLength += turf.length(feature as Feature<LineString>, {
          units: 'meters',
        });
      } catch {
        // Skip invalid geometries
      }
    }
    stats.totalLength = totalLength;
  }

  if (
    (statsRecipes.includes('area') || statsRecipes.includes('area_share')) &&
    geometryType === 'polygon'
  ) {
    let totalArea = 0;
    for (const feature of features.features) {
      try {
        totalArea += turf.area(feature as Feature<Polygon>);
      } catch {
        // Skip invalid geometries
      }
    }
    stats.totalArea = totalArea;

    if (statsRecipes.includes('area_share') && polygonAreaKm2 > 0) {
      const polygonAreaM2 = polygonAreaKm2 * 1_000_000;
      stats.areaShare = (totalArea / polygonAreaM2) * 100;
    }
  }

  return stats;
}

/**
 * Calculate the area of a polygon in km²
 */
export function calculatePolygonArea(polygon: Polygon | MultiPolygon): number {
  const areaM2 = turf.area(turf.feature(polygon));
  return areaM2 / 1_000_000; // Convert to km²
}

/**
 * Get the centroid of a polygon
 */
export function getPolygonCentroid(
  polygon: Polygon | MultiPolygon
): [number, number] {
  const centroid = turf.centroid(turf.feature(polygon));
  return centroid.geometry.coordinates as [number, number];
}

/**
 * Create a bounding box from coordinates
 */
export function createBbox(
  coordinates: [number, number][]
): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Simplify geometries for better performance
 */
export function simplifyFeatures(
  features: FeatureCollection,
  tolerance: number = 0.00001
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.features.map((feature) => {
      try {
        return turf.simplify(feature, {
          tolerance,
          highQuality: true,
        });
      } catch {
        return feature;
      }
    }),
  };
}

/**
 * Reverse geocode a coordinate to get a location name using Nominatim API
 */
export async function reverseGeocode(
  lon: number,
  lat: number
): Promise<string | null> {
  const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';

  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      format: 'json',
      zoom: '14', // City/district level
    });

    const response = await fetch(`${NOMINATIM_API}?${params}`, {
      headers: {
        'User-Agent': 'AxonCity/1.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.display_name) {
        // Parse the display name to get a cleaner result
        const parts = data.display_name.split(',').map((p: string) => p.trim());
        // Return first 2-3 meaningful parts (neighborhood, city, etc.)
        if (parts.length >= 2) {
          return parts.slice(0, 2).join(', ');
        }
        return parts[0];
      }
    }
    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

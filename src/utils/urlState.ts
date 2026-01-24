/**
 * URL State Utility
 * Encode/decode shareable state to/from URL parameters
 * Uses compact encoding to minimize URL length
 */

import type { ShareableState, EncodedArea, ComparisonArea, Polygon, ViewState, MapStyleType } from '../types';

// Precision for coordinate encoding (4 decimals = ~11m accuracy, good enough for areas)
const COORD_PRECISION = 4;
const PRECISION_FACTOR = 10 ** COORD_PRECISION;

/**
 * Encode a signed integer using variable-length encoding (similar to Google Polyline)
 * More compact than decimal representation for small deltas
 */
function encodeSignedInt(num: number): string {
  // Convert to integer with precision
  let value = Math.round(num * PRECISION_FACTOR);

  // Left-shift and invert if negative
  value = value < 0 ? ~(value << 1) : value << 1;

  // Encode as base64-like characters (using URL-safe chars)
  let encoded = '';
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);

  return encoded;
}

/**
 * Decode a variable-length encoded signed integer
 */
function decodeSignedInt(encoded: string, index: { value: number }): number {
  let result = 0;
  let shift = 0;
  let b: number;

  do {
    b = encoded.charCodeAt(index.value++) - 63;
    result |= (b & 0x1f) << shift;
    shift += 5;
  } while (b >= 0x20);

  // Un-invert if negative
  const value = (result & 1) ? ~(result >> 1) : result >> 1;
  return value / PRECISION_FACTOR;
}

/**
 * Encode coordinates using polyline-style encoding
 * Much more compact than JSON/Base64
 */
function encodePolyline(coords: number[][]): string {
  if (coords.length === 0) return '';

  let encoded = '';
  let prevLng = 0;
  let prevLat = 0;

  for (const [lng, lat] of coords) {
    // Encode deltas
    encoded += encodeSignedInt(lat - prevLat);
    encoded += encodeSignedInt(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

/**
 * Decode polyline-encoded coordinates
 */
function decodePolyline(encoded: string): number[][] {
  if (!encoded) return [];

  const coords: number[][] = [];
  const index = { value: 0 };
  let lat = 0;
  let lng = 0;

  while (index.value < encoded.length) {
    lat += decodeSignedInt(encoded, index);
    lng += decodeSignedInt(encoded, index);
    coords.push([
      Math.round(lng * PRECISION_FACTOR) / PRECISION_FACTOR,
      Math.round(lat * PRECISION_FACTOR) / PRECISION_FACTOR,
    ]);
  }

  return coords;
}

/**
 * Encode areas compactly
 * Format: name1~polyline1|name2~polyline2
 */
function encodeAreas(areas: EncodedArea[]): string {
  if (areas.length === 0) return '';

  return areas.map((area) => {
    // Use short name or first letter + number
    const shortName = area.name.length <= 2 ? area.name : area.name.charAt(0);
    const polyline = encodePolyline(area.coordinates);
    return `${shortName}~${polyline}`;
  }).join('|');
}

/**
 * Decode areas from compact format
 */
function decodeAreas(encoded: string): EncodedArea[] {
  if (!encoded) return [];

  try {
    return encoded.split('|').map((part, index) => {
      const [name, polyline] = part.split('~');
      return {
        name: name || `Area ${String.fromCharCode(65 + index)}`,
        coordinates: decodePolyline(polyline || ''),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Encode state to URL parameters
 */
export function encodeState(state: ShareableState): URLSearchParams {
  const params = new URLSearchParams();

  // Center and zoom: c=lng,lat,zoom (reduced precision)
  params.set('c', `${state.center[0].toFixed(3)},${state.center[1].toFixed(3)},${Math.round(state.zoom)}`);

  // Pitch and bearing: p=pitch,bearing (only if non-default)
  if (state.pitch !== 45 || state.bearing !== 0) {
    params.set('p', `${Math.round(state.pitch)},${Math.round(state.bearing)}`);
  }

  // Areas (compact polyline encoding)
  if (state.areas.length > 0) {
    const encoded = encodeAreas(state.areas);
    if (encoded) {
      params.set('a', encoded);
    }
  }

  // Story preset (use short codes)
  if (state.presetId) {
    // Map preset IDs to short codes
    const presetCodes: Record<string, string> = {
      'built-intensity': 'bi',
      'amenity-access': 'aa',
      'bike-friendliness': 'bf',
      'green-balance': 'gb',
      'daily-needs': 'dn',
    };
    params.set('s', presetCodes[state.presetId] || state.presetId.substring(0, 2));
  }

  // Exploded view
  if (state.explodedView) {
    params.set('e', '1');
  }

  // Map style (only if not default)
  if (state.mapStyle && state.mapStyle !== 'dark') {
    params.set('m', state.mapStyle.charAt(0)); // 'l' or 's'
  }

  return params;
}

/**
 * Decode URL parameters to state
 */
export function decodeState(params: URLSearchParams): ShareableState | null {
  // Center is required
  const center = params.get('c');
  if (!center) return null;

  const centerParts = center.split(',').map(Number);
  if (centerParts.length < 3 || centerParts.some(isNaN)) return null;

  const [lng, lat, zoom] = centerParts;

  // Pitch and bearing
  let pitch = 45;
  let bearing = 0;
  const p = params.get('p');
  if (p) {
    const [parsedPitch, parsedBearing] = p.split(',').map(Number);
    if (!isNaN(parsedPitch)) pitch = parsedPitch;
    if (!isNaN(parsedBearing)) bearing = parsedBearing;
  }

  // Areas
  const areasEncoded = params.get('a');
  const areas = areasEncoded ? decodeAreas(areasEncoded) : [];

  // Preset (decode short codes)
  const presetCode = params.get('s');
  const presetMap: Record<string, string> = {
    'bi': 'built-intensity',
    'aa': 'amenity-access',
    'bf': 'bike-friendliness',
    'gb': 'green-balance',
    'dn': 'daily-needs',
  };
  const presetId = presetCode ? (presetMap[presetCode] || presetCode) : undefined;

  // Exploded view
  const explodedView = params.get('e') === '1';

  // Map style
  const mapStyleCode = params.get('m');
  const mapStyleMap: Record<string, MapStyleType> = {
    'l': 'light',
    's': 'satellite',
  };
  const mapStyle = mapStyleCode ? mapStyleMap[mapStyleCode] : undefined;

  return {
    center: [lng, lat],
    zoom,
    pitch,
    bearing,
    areas,
    presetId,
    activeLayers: undefined,
    explodedView,
    mapStyle,
  };
}

/**
 * Generate shareable URL from current state
 */
export function generateShareUrl(state: ShareableState): string {
  const params = encodeState(state);
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Create ShareableState from app state
 */
export function createShareableState(
  viewState: ViewState,
  areas: ComparisonArea[],
  presetId: string | null,
  activeLayers: string[],
  explodedView: boolean,
  mapStyle: MapStyleType
): ShareableState {
  const encodedAreas: EncodedArea[] = areas.map((area) => {
    // Get coordinates from polygon
    const polygon = area.polygon.geometry as Polygon;
    const ring = polygon.coordinates[0];
    return {
      name: area.name,
      coordinates: ring.map((coord) => [coord[0], coord[1]]),
    };
  });

  return {
    center: [viewState.longitude, viewState.latitude],
    zoom: viewState.zoom,
    pitch: viewState.pitch,
    bearing: viewState.bearing,
    areas: encodedAreas,
    presetId: presetId || undefined,
    activeLayers: presetId ? undefined : activeLayers,
    explodedView,
    mapStyle: mapStyle !== 'dark' ? mapStyle : undefined,
  };
}

/**
 * Check if URL has shareable state
 */
export function hasUrlState(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('c');
}

/**
 * Get state from current URL
 */
export function getUrlState(): ShareableState | null {
  const params = new URLSearchParams(window.location.search);
  return decodeState(params);
}

/**
 * Update URL without page reload
 */
export function updateUrl(state: ShareableState): void {
  const params = encodeState(state);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

/**
 * Clear URL state
 */
export function clearUrlState(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

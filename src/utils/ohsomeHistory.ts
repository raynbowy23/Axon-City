/**
 * ohsome layer history (novelty track N4 — Time Machine v1).
 *
 * Fetches the full version history of a layer's features in an area as ONE
 * cached request (`/elementsFullHistory/geometry`), then slices it to any year
 * on the client. Generic over geometry type — the same machinery drives
 * buildings (polygons extrude), roads (lines draw on), parks/water (fill), and
 * POIs (points pop).
 *
 * "As mapped in OSM": a version's validity is when it was *mapped*, which mixes
 * real change with mapping activity (bulk imports look like booms).
 */

import type { Feature, FeatureCollection, Geometry } from 'geojson';

const OHSOME = 'https://api.ohsome.org/v1';
// ohsome rejects timestamps past its data extent, so QUERY_END must be a real
// recent date (not the future). TODO(N4): read the extent from /metadata.
const QUERY_START = '2010-01-01';
const QUERY_END = '2026-01-01';
const QUERY_END_ISO = `${QUERY_END}T00:00:00Z`;

export const TIME_MACHINE_START_YEAR = 2010;
export const TIME_MACHINE_END_YEAR = 2026;
/** Hard cap — full-history payload grows with area; keep it sane. */
export const TIME_MACHINE_MAX_KM2 = 1.2;

export interface TimeMachineLayer {
  id: string;
  label: string;
  /** ohsome filter-syntax string. */
  filter: string;
  geometryType: 'polygon' | 'line' | 'point';
  color: [number, number, number];
  extruded?: boolean;
  elevation?: number;
}

/** Layers the time machine plays back together (each = one cached request). */
export const TIME_MACHINE_LAYERS: TimeMachineLayer[] = [
  { id: 'buildings', label: 'Buildings', filter: 'building=* and geometry:polygon', geometryType: 'polygon', color: [120, 180, 255], extruded: true, elevation: 14 },
  { id: 'roads', label: 'Roads', filter: 'highway in (primary, secondary, tertiary, residential, living_street, unclassified, service) and geometry:line', geometryType: 'line', color: [255, 180, 80] },
  { id: 'parks', label: 'Parks', filter: '(leisure=park or landuse=grass) and geometry:polygon', geometryType: 'polygon', color: [90, 200, 120] },
  { id: 'water', label: 'Water', filter: '(natural=water or water=*) and geometry:polygon', geometryType: 'polygon', color: [70, 140, 235] },
  { id: 'pois', label: 'Amenities', filter: 'shop=* or amenity in (restaurant, cafe, bar, fast_food)', geometryType: 'point', color: [255, 120, 170] },
];

export interface FeatureVersion {
  geometry: Geometry;
  osmId: string;
  /** ISO timestamps for the [from, to) validity interval of this version. */
  validFrom: string;
  validTo: string;
}

export interface LayerHistory {
  versions: FeatureVersion[];
  firstMappedYear: number;
}

/** Parse an ohsome full-history GeoJSON into feature versions. */
export function parseLayerHistory(geojson: FeatureCollection): LayerHistory {
  const versions: FeatureVersion[] = [];
  let earliest = TIME_MACHINE_END_YEAR;

  for (const f of geojson.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    if (!f.geometry) continue;
    const validFrom = String(p['@validFrom'] ?? '');
    const validTo = String(p['@validTo'] ?? '');
    if (!validFrom || !validTo) continue;
    versions.push({ geometry: f.geometry, osmId: String(p['@osmId'] ?? ''), validFrom, validTo });
    const y = Number(validFrom.slice(0, 4));
    if (Number.isFinite(y) && y < earliest) earliest = y;
  }

  return { versions, firstMappedYear: earliest };
}

/** Features valid at Jan 1 of `year` (validFrom ≤ t < validTo; ISO strings compare correctly). */
export function featuresAtYear(history: LayerHistory, year: number): FeatureCollection {
  const target = `${year}-01-01T00:00:00Z`;
  const features: Feature[] = [];
  for (const v of history.versions) {
    // The latest version of a still-existing feature has validTo == the query
    // end — treat that as "current" at the top of the timeline.
    const current = v.validTo >= QUERY_END_ISO;
    if (v.validFrom <= target && (target < v.validTo || current)) {
      features.push({ type: 'Feature', geometry: v.geometry, properties: { osmId: v.osmId } });
    }
  }
  return { type: 'FeatureCollection', features };
}

const cache = new Map<string, LayerHistory>();

/**
 * Fetch + parse one layer's history for a bbox ([west, south, east, north]).
 * One request per (bbox, filter), cached forever. The browser sets its own
 * User-Agent (ohsome accepts it); the geometry endpoints reject `format=`.
 */
export async function fetchLayerHistory(
  bbox: [number, number, number, number],
  filter: string,
  signal?: AbortSignal
): Promise<LayerHistory> {
  const key = `${bbox.map((v) => v.toFixed(4)).join(',')}|${filter}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const [w, s, e, n] = bbox;
  const body = new URLSearchParams({
    bboxes: `${w},${s},${e},${n}`,
    filter,
    time: `${QUERY_START},${QUERY_END}`,
    // metadata (not tags) — we only need @osmId + @validFrom/@validTo, so
    // dropping the OSM tags shrinks the payload (no addr:*, building, height…).
    properties: 'metadata',
  });

  const res = await fetch(`${OHSOME}/elementsFullHistory/geometry`, { method: 'POST', body, signal });
  if (!res.ok) throw new Error(`ohsome history HTTP ${res.status}`);

  const geojson = (await res.json()) as FeatureCollection;
  const history = parseLayerHistory(geojson);
  cache.set(key, history);
  return history;
}

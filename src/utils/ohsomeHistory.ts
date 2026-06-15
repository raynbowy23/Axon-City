/**
 * ohsome building history (novelty track N4 — Time Machine v1).
 *
 * Fetches the full version history of buildings in an area as ONE cached
 * request (`/elementsFullHistory/geometry`), then slices it to any year on the
 * client — the spike decided this beats N per-year snapshots (smaller payload,
 * one request, any year sliceable for smooth scrubbing).
 *
 * "As mapped in OSM": a version's validity is when it was *mapped*, which mixes
 * real construction with mapping activity (bulk imports look like booms).
 */

import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

const OHSOME = 'https://api.ohsome.org/v1';
const FILTER = 'building=* and geometry:polygon';
// ohsome rejects timestamps past its data extent, so QUERY_END must be a real
// recent date (not the future). The latest version's validTo equals this end;
// `buildingsAtYear` treats such "still-current" versions as valid at the top of
// the slider. TODO(N4): fetch the extent from /metadata instead of hardcoding.
const QUERY_START = '2010-01-01';
const QUERY_END = '2026-01-01';
const QUERY_END_ISO = `${QUERY_END}T00:00:00Z`;

export const TIME_MACHINE_START_YEAR = 2010;
export const TIME_MACHINE_END_YEAR = 2026;
/** Hard cap — full-history payload grows with area; keep it sane. */
export const TIME_MACHINE_MAX_KM2 = 1.2;

export interface BuildingVersion {
  geometry: Polygon | MultiPolygon;
  osmId: string;
  /** ISO timestamps for the [from, to) validity interval of this version. */
  validFrom: string;
  validTo: string;
}

export interface BuildingHistory {
  versions: BuildingVersion[];
  /** First year any building was mapped (for trimming the slider). */
  firstMappedYear: number;
}

/** Parse an ohsome full-history GeoJSON into building versions. */
export function parseBuildingHistory(geojson: FeatureCollection): BuildingHistory {
  const versions: BuildingVersion[] = [];
  let earliest = TIME_MACHINE_END_YEAR;

  for (const f of geojson.features ?? []) {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const geometry = f.geometry as Polygon | MultiPolygon | null;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) continue;
    const validFrom = String(p['@validFrom'] ?? '');
    const validTo = String(p['@validTo'] ?? '');
    if (!validFrom || !validTo) continue;
    versions.push({ geometry, osmId: String(p['@osmId'] ?? ''), validFrom, validTo });
    const y = Number(validFrom.slice(0, 4));
    if (Number.isFinite(y) && y < earliest) earliest = y;
  }

  return { versions, firstMappedYear: earliest };
}

/**
 * Building footprints valid at Jan 1 of `year` (a version is valid at instant t
 * when validFrom <= t < validTo; ISO strings compare correctly).
 */
export function buildingsAtYear(history: BuildingHistory, year: number): FeatureCollection {
  const target = `${year}-01-01T00:00:00Z`;
  const features: Feature[] = [];
  for (const v of history.versions) {
    // Valid at `target` when validFrom ≤ target < validTo; the latest version of
    // a still-standing building has validTo == the query end, so treat that as
    // "current" at the top of the timeline rather than dropping it.
    const current = v.validTo >= QUERY_END_ISO;
    if (v.validFrom <= target && (target < v.validTo || current)) {
      features.push({
        type: 'Feature',
        geometry: v.geometry,
        properties: { osmId: v.osmId, validFrom: v.validFrom },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const cache = new Map<string, BuildingHistory>();
const cacheKey = (b: [number, number, number, number]) => b.map((v) => v.toFixed(4)).join(',');

/**
 * Fetch + parse the building history for a bbox ([west, south, east, north]).
 * One request, cached forever (history is immutable). The browser sets its own
 * User-Agent (ohsome accepts it) and the geometry endpoints reject `format=`.
 */
export async function fetchBuildingHistory(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<BuildingHistory> {
  const key = cacheKey(bbox);
  const cached = cache.get(key);
  if (cached) return cached;

  const [w, s, e, n] = bbox;
  const body = new URLSearchParams({
    bboxes: `${w},${s},${e},${n}`,
    filter: FILTER,
    time: `${QUERY_START},${QUERY_END}`,
    properties: 'tags',
  });

  const res = await fetch(`${OHSOME}/elementsFullHistory/geometry`, {
    method: 'POST',
    body,
    signal,
  });
  if (!res.ok) throw new Error(`ohsome history HTTP ${res.status}`);

  const geojson = (await res.json()) as FeatureCollection;
  const history = parseBuildingHistory(geojson);
  cache.set(key, history);
  return history;
}

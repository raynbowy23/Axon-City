/**
 * Build the City DNA reference corpus (novelty track N2).
 *
 *   npx tsx scripts/buildDnaCorpus.ts
 *
 * For each curated neighborhood it fetches the canonical DNA layer set from
 * Overpass, clips to the bbox, computes the raw DNA vector (reusing the app's
 * own pure extraction), and writes src/data/dnaCorpus.json. The distribution
 * of these vectors becomes the percentile-normalization basis + similarity set.
 *
 * Self-contained Overpass fetch/convert (the app's osmFetcher is browser-
 * coupled) — kept faithful to osmFetcher's elementToFeature so corpus vectors
 * match live extraction. Throttled + retried; ~1 request per layer per place.
 *
 * Re-run when DNA_DIMENSIONS or the extraction changes; bump CORPUS_VERSION.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Feature, FeatureCollection, Point, LineString, Polygon } from 'geojson';

import { layerManifest } from '../src/data/layerManifest';
import {
  clipFeaturesToPolygon,
  calculateLayerStats,
  calculatePolygonArea,
} from '../src/utils/geometryUtils';
import { extractRawDna, DNA_LAYER_IDS, DNA_DIMENSIONS } from '../src/utils/cityDna';
import type { LayerConfig, LayerData } from '../src/types';
import { NEIGHBORHOODS, type CorpusNeighborhood } from './dnaCorpusList';

const CORPUS_VERSION = 1;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const NEIGHBORHOOD_PAUSE_MS = 2500; // polite pause between neighborhoods
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round = (v: number) => Math.round(v * 1000) / 1000;

// --- Overpass element types (subset we use) ---------------------------------
interface OverpassGeom {
  lat: number;
  lon: number;
}
interface OverpassMember {
  type: string;
  role?: string;
  geometry?: OverpassGeom[];
}
interface OverpassElement {
  type: 'node' | 'way' | 'relation' | 'count';
  id: number;
  lat?: number;
  lon?: number;
  geometry?: OverpassGeom[];
  members?: OverpassMember[];
  tags?: Record<string, string>;
}

// --- Query building (mirrors osmFetcher.splitQueryParts) --------------------
function splitQueryParts(osmQuery: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of osmQuery) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '|' && !inQuotes) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function bboxToOverpassString([w, s, e, n]: [number, number, number, number]): string {
  return `${s},${w},${n},${e}`;
}

function bboxToPolygon([w, s, e, n]: [number, number, number, number]): Polygon {
  return {
    type: 'Polygon',
    coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
  };
}

/**
 * One Overpass query covering ALL layers — each layer's union is followed by
 * its `out` + an `out count;` separator, so the response splits back into exact
 * per-layer segments (mirrors osmFetcher.buildBatchedQuery). 16 requests → 1.
 */
function buildBatchedQuery(layers: LayerConfig[], bboxStr: string): string {
  let output = `[out:json][timeout:180][maxsize:134217728];\n`;
  for (const layer of layers) {
    output += '(\n';
    for (const part of splitQueryParts(layer.osmQuery)) {
      const t = part.trim();
      if (/^(node|way|relation)/.test(t)) output += `  ${t}(${bboxStr});\n`;
    }
    output += ');\n';
    output += layer.geometryType === 'polygon' || layer.geometryType === 'line'
      ? 'out body geom;\n'
      : 'out body;\n';
    output += 'out count;\n';
  }
  return output;
}

/** Split a batched response into per-layer segments using the `count` markers. */
function splitBatchedElements(elements: OverpassElement[]): OverpassElement[][] {
  const segments: OverpassElement[][] = [];
  let current: OverpassElement[] = [];
  for (const el of elements) {
    if (el.type === 'count') {
      segments.push(current);
      current = [];
    } else {
      current.push(el);
    }
  }
  return segments;
}

// --- Element → GeoJSON (faithful to osmFetcher.elementToFeature) ------------
function elementToFeature(element: OverpassElement, geometryType: string): Feature | null {
  if (element.type === 'node' && geometryType === 'point') {
    if (element.lat === undefined || element.lon === undefined) return null;
    return {
      type: 'Feature',
      id: element.id,
      properties: { id: element.id, type: element.type, ...element.tags },
      geometry: { type: 'Point', coordinates: [element.lon, element.lat] } as Point,
    };
  }

  if (element.type === 'way' && element.geometry) {
    const coordinates = element.geometry.map((g) => [g.lon, g.lat]);
    if (geometryType === 'line') {
      return {
        type: 'Feature',
        id: element.id,
        properties: { id: element.id, type: element.type, ...element.tags },
        geometry: { type: 'LineString', coordinates } as LineString,
      };
    }
    if (geometryType === 'polygon') {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (!first || !last) return null;
      if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
      if (coordinates.length < 4) return null;
      return {
        type: 'Feature',
        id: element.id,
        properties: { id: element.id, type: element.type, ...element.tags },
        geometry: { type: 'Polygon', coordinates: [coordinates] } as Polygon,
      };
    }
  }

  if (element.type === 'relation' && geometryType === 'polygon' && element.members) {
    const outerRings: number[][][] = [];
    const innerRings: number[][][] = [];
    for (const member of element.members) {
      if (member.type === 'way' && member.geometry) {
        const ring = member.geometry.map((g) => [g.lon, g.lat]);
        if (ring.length >= 3) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        }
        if (ring.length >= 4) {
          if (member.role === 'outer') outerRings.push(ring);
          else if (member.role === 'inner') innerRings.push(ring);
        }
      }
    }
    if (outerRings.length === 0) return null;
    if (outerRings.length === 1) {
      return {
        type: 'Feature',
        id: element.id,
        properties: { id: element.id, type: element.type, ...element.tags },
        geometry: { type: 'Polygon', coordinates: [outerRings[0], ...innerRings] } as Polygon,
      };
    }
    return {
      type: 'Feature',
      id: element.id,
      properties: { id: element.id, type: element.type, ...element.tags },
      geometry: { type: 'MultiPolygon', coordinates: outerRings.map((o) => [o]) },
    };
  }

  return null;
}

function convertToGeoJSON(elements: OverpassElement[], geometryType: string): FeatureCollection {
  const features: Feature[] = [];
  for (const el of elements) {
    const f = elementToFeature(el, geometryType);
    if (f) features.push(f);
  }
  return { type: 'FeatureCollection', features };
}

// The DNA layers, resolved to configs once, in DNA_LAYER_IDS order (the order
// the batched query and its segments must agree on).
const DNA_LAYERS: LayerConfig[] = DNA_LAYER_IDS
  .map((id) => layerManifest.layers.find((l) => l.id === id))
  .filter((l): l is LayerConfig => l !== undefined);

// --- One batched fetch per neighborhood, with endpoint failover + retry -----
async function fetchAllLayers(
  bbox: [number, number, number, number]
): Promise<Map<string, FeatureCollection>> {
  const query = buildBatchedQuery(DNA_LAYERS, bboxToOverpassString(bbox));
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
      });
      if (res.status === 429 || res.status === 504 || res.status === 503) {
        await sleep(6000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { elements: OverpassElement[] };
      const segments = splitBatchedElements(data.elements ?? []);
      const out = new Map<string, FeatureCollection>();
      DNA_LAYERS.forEach((layer, i) => {
        out.set(layer.id, convertToGeoJSON(segments[i] ?? [], layer.geometryType));
      });
      return out;
    } catch (err) {
      lastErr = err;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`Overpass batched query failed after ${MAX_RETRIES} tries: ${String(lastErr)}`);
}

// --- Build one neighborhood's raw DNA vector --------------------------------
async function buildNeighborhood(nb: CorpusNeighborhood): Promise<number[]> {
  const polygon = bboxToPolygon(nb.bbox);
  const areaKm2 = calculatePolygonArea(polygon);
  const layerData = new Map<string, LayerData>();

  const fetched = await fetchAllLayers(nb.bbox);
  for (const layer of DNA_LAYERS) {
    const features = fetched.get(layer.id) ?? { type: 'FeatureCollection', features: [] };
    const clippedFeatures = clipFeaturesToPolygon(features, polygon, layer.geometryType);
    const stats = calculateLayerStats(clippedFeatures, layer, areaKm2);
    layerData.set(layer.id, { layerId: layer.id, features, clippedFeatures, stats });
  }

  const { raw } = extractRawDna(layerData, areaKm2, polygon);
  return raw.map(round);
}

interface CorpusEntry extends CorpusNeighborhood {
  raw: number[];
}

async function main(): Promise<void> {
  const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'dnaCorpus.json');
  const entries: CorpusEntry[] = [];

  // DNA_LIMIT=N builds only the first N neighborhoods (handy for a test run).
  const limit = process.env.DNA_LIMIT ? Math.max(1, parseInt(process.env.DNA_LIMIT, 10)) : NEIGHBORHOODS.length;
  const list = NEIGHBORHOODS.slice(0, limit);

  console.log(`Building DNA corpus for ${list.length} neighborhoods…`);
  console.log(`Layers per place: ${DNA_LAYER_IDS.length} — be patient + polite to Overpass.\n`);

  for (let i = 0; i < list.length; i++) {
    const nb = list[i];
    process.stdout.write(`[${i + 1}/${list.length}] ${nb.name}, ${nb.city}… `);
    try {
      const raw = await buildNeighborhood(nb);
      entries.push({ ...nb, raw });
      console.log('ok');
    } catch (err) {
      console.log('FAILED');
      console.warn(err);
    }

    // Write incrementally so a crash keeps progress.
    const corpus = {
      version: CORPUS_VERSION,
      dimensions: DNA_DIMENSIONS.map((d) => d.id),
      generatedAt: new Date().toISOString(),
      count: entries.length,
      neighborhoods: entries,
    };
    writeFileSync(outPath, JSON.stringify(corpus, null, 2));

    await sleep(NEIGHBORHOOD_PAUSE_MS);
  }

  console.log(`\nWrote ${entries.length} neighborhoods → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

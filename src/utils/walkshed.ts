/**
 * Walkshed (novelty track N3 — static v1, pre-ripple).
 *
 * Fetches the pedestrian network for an area and computes what's reachable on
 * foot from a tapped origin within a time cutoff — the data behind the (later
 * animated) ripple. Uses Option A topology (exact OSM node IDs) per the spike.
 */

import type { Feature } from 'geojson';
import type { LayerData } from '../types';
import {
  buildWalkGraphFromNodes,
  buildAdjacency,
  dijkstra,
  nearestNode,
  type OverpassEl,
  type WalkGraph,
} from './walkGraph';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Walk network: more than the visible road layers — footways, paths, steps, etc.
const WALK_FILTER =
  'footway|path|pedestrian|steps|living_street|service|residential|tertiary|secondary|primary|unclassified|track|cycleway';

/** Default cutoff: 15 min at 80 m/min = 1200 m. */
export const WALK_CUTOFF_M = 1200;

const cache = new Map<string, WalkGraph>();
const cacheKey = (b: [number, number, number, number]) => b.map((v) => v.toFixed(4)).join(',');

/**
 * Fetch + build the walk graph for a bbox ([west, south, east, north]).
 * In-memory cached per bbox. Browser fetch (the browser sets a User-Agent and
 * Overpass accepts it; the `data=`-form POST is the canonical format).
 */
export async function fetchWalkGraph(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<WalkGraph> {
  const key = cacheKey(bbox);
  const cached = cache.get(key);
  if (cached) return cached;

  const [w, s, e, n] = bbox;
  const query = `[out:json][timeout:90];way["highway"~"${WALK_FILTER}"](${s},${w},${n},${e});out body;>;out skel qt;`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (res.status === 429 || res.status === 504 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const data = (await res.json()) as { elements: OverpassEl[] };
      const graph = buildWalkGraphFromNodes(data.elements ?? []);
      cache.set(key, graph);
      return graph;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw new Error(`Walk-network fetch failed: ${String(lastErr)}`);
}

export interface PoiReach {
  label: string;
  count: number;
}

export interface Walkshed {
  /** Snapped origin node [lon, lat]. */
  origin: [number, number];
  /** Reachable edges as [[lon,lat],[lon,lat]] pairs, for a deck.gl PathLayer. */
  reachableEdges: Array<[[number, number], [number, number]]>;
  /** Per-reachable-edge mid-distance from origin (m), for later coloring/animation. */
  edgeDistances: number[];
  /** Per-node distance from origin (m); Infinity if unreachable. */
  dist: Float64Array;
  /** Number of graph nodes within the cutoff. */
  reachedNodeCount: number;
  /** Total reachable street length within the cutoff (meters). */
  reachableLengthM: number;
  /** Amenities reachable within the cutoff, by category (filled separately). */
  poiReach: PoiReach[];
  cutoffM: number;
}

/**
 * Compute the walkshed: streets reachable on foot from an origin within
 * `cutoffM`. An edge is "reachable" when both endpoints are within the cutoff.
 */
export function computeWalkshed(
  graph: WalkGraph,
  originLon: number,
  originLat: number,
  cutoffM: number = WALK_CUTOFF_M
): Walkshed {
  const seed = nearestNode(graph, originLon, originLat);
  if (seed < 0) {
    return {
      origin: [originLon, originLat],
      reachableEdges: [],
      edgeDistances: [],
      dist: new Float64Array(0),
      reachedNodeCount: 0,
      reachableLengthM: 0,
      poiReach: [],
      cutoffM,
    };
  }

  const adj = buildAdjacency(graph);
  const dist = dijkstra(adj, seed);

  const reachableEdges: Array<[[number, number], [number, number]]> = [];
  const edgeDistances: number[] = [];
  let reachableLengthM = 0;

  for (const [a, b, len] of graph.edges) {
    if (dist[a] <= cutoffM && dist[b] <= cutoffM) {
      reachableEdges.push([
        [graph.nodes[a * 2], graph.nodes[a * 2 + 1]],
        [graph.nodes[b * 2], graph.nodes[b * 2 + 1]],
      ]);
      edgeDistances.push((dist[a] + dist[b]) / 2);
      reachableLengthM += len;
    }
  }

  let reachedNodeCount = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] <= cutoffM) reachedNodeCount++;

  return {
    origin: [graph.nodes[seed * 2], graph.nodes[seed * 2 + 1]],
    reachableEdges,
    edgeDistances,
    dist,
    reachedNodeCount,
    reachableLengthM,
    poiReach: [],
    cutoffM,
  };
}

// Amenity categories for the reach readout (label + the layer ids that feed it).
const POI_REACH_CATEGORIES: Array<{ label: string; ids: string[] }> = [
  { label: 'groceries', ids: ['poi-grocery'] },
  { label: 'cafés & restaurants', ids: ['poi-food-drink'] },
  { label: 'shops', ids: ['poi-shopping'] },
  { label: 'health', ids: ['poi-health'] },
  { label: 'schools', ids: ['poi-education'] },
  { label: 'transit stops', ids: ['transit-stops'] },
  { label: 'parks', ids: ['parks'] },
];

/** Representative lon/lat for a feature (point coord, or polygon/line midpoint). */
function featureLonLat(f: Feature): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates as [number, number];
  if (g.type === 'LineString') {
    const c = g.coordinates;
    return c[Math.floor(c.length / 2)] as [number, number];
  }
  const ring =
    g.type === 'Polygon'
      ? g.coordinates[0]
      : g.type === 'MultiPolygon'
        ? g.coordinates[0]?.[0]
        : null;
  if (!ring || ring.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring as number[][]) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

/**
 * Count amenities reachable within the walkshed: a feature counts if its
 * nearest walk node is within `cutoffM`. Reads from the loaded layer data
 * (clipped features). Categories with zero reachable items are omitted.
 */
export function computeReachablePois(
  graph: WalkGraph,
  dist: Float64Array,
  layerData: Map<string, LayerData>,
  cutoffM: number = WALK_CUTOFF_M
): PoiReach[] {
  if (dist.length === 0) return [];
  const out: PoiReach[] = [];

  for (const cat of POI_REACH_CATEGORIES) {
    let count = 0;
    for (const id of cat.ids) {
      const ld = layerData.get(id);
      const features = ld?.clippedFeatures?.features ?? ld?.features?.features ?? [];
      for (const f of features) {
        const ll = featureLonLat(f);
        if (!ll) continue;
        const node = nearestNode(graph, ll[0], ll[1]);
        if (node >= 0 && dist[node] <= cutoffM) count++;
      }
    }
    if (count > 0) out.push({ label: cat.label, count });
  }

  return out;
}

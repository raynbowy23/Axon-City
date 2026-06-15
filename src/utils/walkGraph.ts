/**
 * Walk graph (novelty track N3 — Walkshed Ripple).
 *
 * Builds a pedestrian network graph from an Overpass response, then provides
 * the primitives the ripple needs: connectivity analysis, an adjacency list,
 * Dijkstra shortest-paths from a tapped origin, and nearest-node snapping.
 *
 * Two topology strategies (the N3 spike compares them):
 *  - Option A (preferred): EXACT topology from node IDs. Query the walk network
 *    with `out body; >; out skel qt;` so ways carry their node-ID sequence and
 *    nodes carry coordinates. Ways sharing a node ID are connected exactly.
 *  - Option B (fallback): COORDINATE SNAPPING. From `out geom`, round vertices
 *    to a grid and join coincident points. Simpler, but risks false joins at
 *    bridges/tunnels.
 */

export interface WalkGraph {
  /** Interleaved [lon0, lat0, lon1, lat1, …] for nodeCount nodes. */
  nodes: Float64Array;
  nodeCount: number;
  /** Undirected edges as [aIndex, bIndex, lengthMeters]. */
  edges: Array<[number, number, number]>;
}

interface OverpassNodeEl {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}
interface OverpassWayEl {
  type: 'way';
  id: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
}
export type OverpassEl = OverpassNodeEl | OverpassWayEl | { type: string };

const EARTH_R = 6371000; // meters
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in meters between two lon/lat points. */
export function haversineMeters(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Option A — exact topology from `out body; >; out skel qt;` elements.
 * Ways carry `nodes` (node-ID sequence); nodes carry coordinates.
 */
export function buildWalkGraphFromNodes(elements: OverpassEl[]): WalkGraph {
  const coordById = new Map<number, [number, number]>();
  for (const el of elements) {
    if (el.type === 'node') {
      const n = el as OverpassNodeEl;
      coordById.set(n.id, [n.lon, n.lat]);
    }
  }

  const idToIndex = new Map<number, number>();
  const coords: number[] = [];
  const indexOf = (osmId: number): number => {
    let i = idToIndex.get(osmId);
    if (i !== undefined) return i;
    const c = coordById.get(osmId);
    if (!c) return -1;
    i = idToIndex.size;
    idToIndex.set(osmId, i);
    coords.push(c[0], c[1]);
    return i;
  };

  const edges: Array<[number, number, number]> = [];
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const w = el as OverpassWayEl;
    if (!w.nodes || w.nodes.length < 2) continue;
    for (let k = 0; k < w.nodes.length - 1; k++) {
      const a = indexOf(w.nodes[k]);
      const b = indexOf(w.nodes[k + 1]);
      if (a < 0 || b < 0 || a === b) continue;
      const len = haversineMeters(coords[a * 2], coords[a * 2 + 1], coords[b * 2], coords[b * 2 + 1]);
      edges.push([a, b, len]);
    }
  }

  return { nodes: new Float64Array(coords), nodeCount: idToIndex.size, edges };
}

/**
 * Option B — coordinate snapping from `out geom` elements (ways carry a
 * `geometry` coordinate array). Vertices are rounded to `precision` decimal
 * degrees (~1e-5 ≈ 1.1 m) and coincident points are joined.
 */
export function buildWalkGraphFromGeom(elements: OverpassEl[], precision = 5): WalkGraph {
  const keyToIndex = new Map<string, number>();
  const coords: number[] = [];
  const snapKey = (lon: number, lat: number) => `${lon.toFixed(precision)},${lat.toFixed(precision)}`;
  const indexOf = (lon: number, lat: number): number => {
    const key = snapKey(lon, lat);
    let i = keyToIndex.get(key);
    if (i !== undefined) return i;
    i = keyToIndex.size;
    keyToIndex.set(key, i);
    coords.push(lon, lat);
    return i;
  };

  const edges: Array<[number, number, number]> = [];
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const w = el as OverpassWayEl;
    if (!w.geometry || w.geometry.length < 2) continue;
    for (let k = 0; k < w.geometry.length - 1; k++) {
      const p = w.geometry[k];
      const q = w.geometry[k + 1];
      const a = indexOf(p.lon, p.lat);
      const b = indexOf(q.lon, q.lat);
      if (a === b) continue;
      edges.push([a, b, haversineMeters(p.lon, p.lat, q.lon, q.lat)]);
    }
  }

  return { nodes: new Float64Array(coords), nodeCount: keyToIndex.size, edges };
}

/** Undirected adjacency list: adjacency[i] = [neighborIndex, lengthMeters][]. */
export function buildAdjacency(graph: WalkGraph): Array<Array<[number, number]>> {
  const adj: Array<Array<[number, number]>> = Array.from({ length: graph.nodeCount }, () => []);
  for (const [a, b, len] of graph.edges) {
    adj[a].push([b, len]);
    adj[b].push([a, len]);
  }
  return adj;
}

export interface ComponentStats {
  count: number;
  largest: number;
  largestFraction: number;
}

/** Connected-component stats via union-find — the key topology-quality signal. */
export function connectedComponents(graph: WalkGraph): ComponentStats {
  const parent = new Int32Array(graph.nodeCount);
  for (let i = 0; i < graph.nodeCount; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const [a, b] of graph.edges) union(a, b);

  const sizes = new Map<number, number>();
  for (let i = 0; i < graph.nodeCount; i++) {
    const r = find(i);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let largest = 0;
  for (const s of sizes.values()) if (s > largest) largest = s;
  return {
    count: sizes.size,
    largest,
    largestFraction: graph.nodeCount ? largest / graph.nodeCount : 0,
  };
}

/** Nearest node index to a lon/lat (linear scan — fine for a selection-sized graph). */
export function nearestNode(graph: WalkGraph, lon: number, lat: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < graph.nodeCount; i++) {
    const dx = graph.nodes[i * 2] - lon;
    const dy = graph.nodes[i * 2 + 1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Dijkstra shortest-path distances (meters) from `source` over the walk graph,
 * using a binary min-heap. Unreachable nodes stay Infinity. This is the core
 * the ripple animates over (later moved into a Web Worker).
 */
export function dijkstra(
  adjacency: Array<Array<[number, number]>>,
  source: number
): Float64Array {
  const n = adjacency.length;
  const dist = new Float64Array(n).fill(Infinity);
  dist[source] = 0;

  // Binary heap of [distance, node].
  const heap: Array<[number, number]> = [[0, source]];
  const swap = (i: number, j: number) => {
    const t = heap[i];
    heap[i] = heap[j];
    heap[j] = t;
  };
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      swap(p, i);
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        swap(s, i);
        i = s;
      }
    }
    return top;
  };

  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const [v, w] of adjacency[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        push([nd, v]);
      }
    }
  }
  return dist;
}

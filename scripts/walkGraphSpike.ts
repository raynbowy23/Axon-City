/**
 * N3 Walkshed Ripple — topology spike.
 *
 *   npx tsx scripts/walkGraphSpike.ts
 *
 * Fetches a dense area's pedestrian network from Overpass two ways and compares
 * graph quality, to decide Option A (exact node-ID topology) vs Option B
 * (coordinate snapping). Also runs a fixture assertion and a 15-minute-walk
 * Dijkstra reachability sanity check. This de-risks N3 before building the
 * Web Worker + GPU ripple.
 */

import {
  buildWalkGraphFromNodes,
  buildWalkGraphFromGeom,
  connectedComponents,
  buildAdjacency,
  dijkstra,
  nearestNode,
  type OverpassEl,
  type WalkGraph,
} from '../src/utils/walkGraph';

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const WALK_FILTER =
  'footway|path|pedestrian|steps|living_street|service|residential|tertiary|secondary|primary|unclassified|track|cycleway';

// Dense test areas (bbox = [west, south, east, north]).
const AREAS = [
  { name: 'Shibuya, Tokyo', bbox: [139.694, 35.656, 139.706, 35.666] },
  { name: 'SoHo, New York', bbox: [-74.005, 40.72, -73.996, 40.727] },
] as const;

const WALK_CUTOFF_M = 1200; // 15 min @ 80 m/min

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bboxStr([w, s, e, n]: readonly number[]): string {
  return `${s},${w},${n},${e}`;
}

async function overpass(query: string): Promise<OverpassEl[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const endpoint = OVERPASS[attempt % OVERPASS.length];
    try {
      // Overpass requires a descriptive User-Agent (Node's default gets 406'd);
      // `data=`-form-encoded body is the canonical POST format.
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': 'AxonCity/0.2 (walkgraph spike; github.com/raynbowy23/Axon-City)' },
        body: new URLSearchParams({ data: query }),
      });
      if (res.status === 429 || res.status === 504 || res.status === 503) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { elements: OverpassEl[] };
      return data.elements ?? [];
    } catch (err) {
      lastErr = err;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`Overpass failed: ${String(lastErr)}`);
}

function queryA(bbox: readonly number[]): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:120];way["highway"~"${WALK_FILTER}"](${b});out body;>;out skel qt;`;
}
function queryB(bbox: readonly number[]): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:120];way["highway"~"${WALK_FILTER}"](${b});out geom;`;
}

function reachability(graph: WalkGraph, bbox: readonly number[]) {
  if (graph.nodeCount === 0) return null;
  const [w, s, e, n] = bbox;
  const adj = buildAdjacency(graph);
  const seed = nearestNode(graph, (w + e) / 2, (s + n) / 2);
  const t0 = Date.now();
  const dist = dijkstra(adj, seed);
  const ms = Date.now() - t0;
  let reached = 0;
  let maxFinite = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] <= WALK_CUTOFF_M) reached++;
    if (Number.isFinite(dist[i]) && dist[i] > maxFinite) maxFinite = dist[i];
  }
  return { seed, dijkstraMs: ms, reachedWithinCutoff: reached, maxReachM: Math.round(maxFinite) };
}

function report(label: string, graph: WalkGraph, bbox: readonly number[]) {
  const cc = connectedComponents(graph);
  const reach = reachability(graph, bbox);
  console.log(`  [${label}] nodes=${graph.nodeCount} edges=${graph.edges.length}`);
  console.log(
    `         components=${cc.count}  largest=${cc.largest} (${(cc.largestFraction * 100).toFixed(1)}% of nodes)`
  );
  if (reach) {
    console.log(
      `         15-min reach: ${reach.reachedWithinCutoff} nodes ≤${WALK_CUTOFF_M}m  (max reach ${reach.maxReachM}m, Dijkstra ${reach.dijkstraMs}ms)`
    );
  }
}

function fixtureCheck(): void {
  // Two ways sharing node 2 → must be one connected component.
  const fixture: OverpassEl[] = [
    { type: 'node', id: 1, lon: 139.7, lat: 35.66 },
    { type: 'node', id: 2, lon: 139.701, lat: 35.66 },
    { type: 'node', id: 3, lon: 139.702, lat: 35.661 },
    { type: 'way', id: 10, nodes: [1, 2] } as OverpassEl,
    { type: 'way', id: 11, nodes: [2, 3] } as OverpassEl,
  ];
  const g = buildWalkGraphFromNodes(fixture);
  const cc = connectedComponents(g);
  const ok = g.nodeCount === 3 && g.edges.length === 2 && cc.count === 1;
  console.log(`Fixture (2 ways sharing a node): nodes=${g.nodeCount} edges=${g.edges.length} components=${cc.count} → ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) throw new Error('walkGraph fixture assertion failed');
}

async function main(): Promise<void> {
  fixtureCheck();
  console.log('');

  // SPIKE_LIMIT=1 runs only the first area (faster).
  const limit = process.env.SPIKE_LIMIT ? Math.max(1, parseInt(process.env.SPIKE_LIMIT, 10)) : AREAS.length;
  for (const area of AREAS.slice(0, limit)) {
    console.log(`=== ${area.name} ===`);
    try {
      const elemsA = await overpass(queryA(area.bbox));
      report('A: node-id topology', buildWalkGraphFromNodes(elemsA), area.bbox);
      await sleep(2000);
      const elemsB = await overpass(queryB(area.bbox));
      report('B: coord-snapping  ', buildWalkGraphFromGeom(elemsB), area.bbox);
    } catch (err) {
      console.log('  FAILED:', err);
    }
    console.log('');
    await sleep(2500);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

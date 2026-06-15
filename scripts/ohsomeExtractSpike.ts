/**
 * N4 Time Machine v1 — geometry extraction spike.
 *
 *   npx tsx scripts/ohsomeExtractSpike.ts
 *
 * The v0 aggregation endpoint is cheap (numbers). v1 needs actual GEOMETRY
 * snapshots — the heavy, risky part. This measures payload + latency for
 * yearly building snapshots on a dense ~0.5 km² area, comparing two strategies:
 *   A) /elements/geometry at N yearly timestamps (N requests, cacheable each)
 *   B) /elementsFullHistory/geometry once (client-side slicing)
 * to decide the fetch strategy + area cap before building the timeline UI.
 */

const OHSOME = 'https://api.ohsome.org/v1';
const UA = 'AxonCity/0.2 (time-machine extract spike; github.com/raynbowy23/Axon-City)';
const FILTER = 'building=* and geometry:polygon';

// ~0.6 km² dense, building-rich test area.
const AREA = { name: 'SoHo, New York', bbox: [-74.005, 40.72, -73.996, 40.727] };
const SNAPSHOT_YEARS = [2010, 2014, 2018, 2022, 2026];

interface GeoJSON {
  features?: Array<{ properties?: Record<string, unknown> }>;
}

async function post(path: string, params: Record<string, string>): Promise<{ json: GeoJSON; ms: number; bytes: number }> {
  const t0 = Date.now();
  const res = await fetch(`${OHSOME}${path}`, {
    method: 'POST',
    headers: { 'User-Agent': UA },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return { json: JSON.parse(text) as GeoJSON, ms, bytes: text.length };
}

const kb = (b: number) => `${(b / 1024).toFixed(0)} KB`;

async function main(): Promise<void> {
  const [w, s, e, n] = AREA.bbox;
  const bboxes = `${w},${s},${e},${n}`;
  console.log(`=== ${AREA.name} (buildings) ===\n`);

  // --- A) per-year snapshots via /elements/geometry ---
  console.log('A) /elements/geometry — one request per snapshot year:');
  let totalA = 0;
  let totalMsA = 0;
  for (const year of SNAPSHOT_YEARS) {
    try {
      const { json, ms, bytes } = await post('/elements/geometry', {
        bboxes,
        filter: FILTER,
        time: `${year}-01-01`,
        properties: 'tags',
      });
      const count = json.features?.length ?? 0;
      console.log(`   ${year}: ${String(count).padStart(4)} buildings, ${kb(bytes).padStart(7)}, ${ms}ms`);
      totalA += bytes;
      totalMsA += ms;
    } catch (err) {
      console.log(`   ${year}: FAILED ${String(err).slice(0, 120)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`   → ${SNAPSHOT_YEARS.length} requests, ${kb(totalA)} total, ${totalMsA}ms total\n`);

  // --- B) one full-history request via /elementsFullHistory/geometry ---
  console.log('B) /elementsFullHistory/geometry — one request, client slices:');
  try {
    const { json, ms, bytes } = await post('/elementsFullHistory/geometry', {
      bboxes,
      filter: FILTER,
      time: '2010-01-01,2026-01-01',
        properties: 'tags',
    });
    const versions = json.features?.length ?? 0;
    console.log(`   ${versions} feature-versions, ${kb(bytes)}, ${ms}ms (one request)\n`);
  } catch (err) {
    console.log(`   FAILED ${String(err).slice(0, 160)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

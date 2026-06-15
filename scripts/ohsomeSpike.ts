/**
 * N4 Time Machine — ohsome spike.
 *
 *   npx tsx scripts/ohsomeSpike.ts
 *
 * Validates the ohsome aggregation API + our filter translation, and measures
 * payload/latency, by pulling yearly growth time series (2010→2026) for a
 * fast-growing district and a stable baseline. De-risks N4 before building v0
 * sparklines.
 */

import {
  OHSOME_GROWTH_METRICS,
  ohsomeEndpoint,
  toDisplayValue,
  type OhsomeMetric,
} from '../src/utils/ohsomeFilters';

const TIME = '2010-01-01/2026-01-01/P1Y';

const AREAS = [
  { name: 'Dubai Marina', bbox: [55.13, 25.07, 55.15, 25.09] },
  { name: 'SoHo, New York', bbox: [-74.005, 40.72, -73.996, 40.727] },
] as const;

interface OhsomeResult {
  result?: Array<{ timestamp: string; value: number }>;
}

async function fetchSeries(
  metric: OhsomeMetric,
  bbox: readonly number[]
): Promise<{ series: Array<{ year: number; value: number }>; ms: number; bytes: number }> {
  const [w, s, e, n] = bbox;
  const body = new URLSearchParams({
    bboxes: `${w},${s},${e},${n}`,
    filter: metric.filter,
    time: TIME,
    format: 'json',
  });
  const t0 = Date.now();
  const res = await fetch(ohsomeEndpoint(metric.aggregation), {
    method: 'POST',
    headers: { 'User-Agent': 'AxonCity/0.2 (time-machine spike; github.com/raynbowy23/Axon-City)' },
    body,
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as OhsomeResult;
  const series = (data.result ?? []).map((r) => ({
    year: new Date(r.timestamp).getUTCFullYear(),
    value: toDisplayValue(metric, r.value),
  }));
  return { series, ms, bytes: text.length };
}

function spark(values: number[]): string {
  const blocks = '▁▂▃▄▅▆▇█';
  const max = Math.max(...values, 1);
  return values.map((v) => blocks[Math.min(7, Math.floor((v / max) * 7))]).join('');
}

async function main(): Promise<void> {
  for (const area of AREAS) {
    console.log(`\n=== ${area.name} ===`);
    for (const metric of OHSOME_GROWTH_METRICS) {
      try {
        const { series, ms, bytes } = await fetchSeries(metric, area.bbox);
        const first = series[0]?.value ?? 0;
        const last = series[series.length - 1]?.value ?? 0;
        const fmt = (v: number) => (metric.unit ? `${v.toFixed(1)}${metric.unit}` : String(Math.round(v)));
        console.log(
          `  ${metric.label.padEnd(13)} ${spark(series.map((p) => p.value))}  ` +
            `${fmt(first)} → ${fmt(last)}  (Δ ${fmt(last - first)})  [${ms}ms, ${bytes}B]`
        );
      } catch (err) {
        console.log(`  ${metric.label.padEnd(13)} FAILED: ${String(err).slice(0, 160)}`);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

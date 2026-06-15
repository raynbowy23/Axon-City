/**
 * ohsome growth fetcher (novelty track N4 — Time Machine, v0).
 *
 * Pulls yearly "growth" time series for an area from the ohsome aggregation
 * API (cheap: numbers, ~1.3 KB each). The 6 group metrics are fetched in
 * parallel and cached in memory — OSM history is immutable, so a given bbox's
 * series never changes within a session.
 *
 * Everything here is "as mapped in OSM": series reflect mapping activity as
 * well as real-world change (e.g. a bulk import looks like a sudden boom).
 */

import {
  OHSOME_GROWTH_METRICS,
  ohsomeEndpoint,
  toDisplayValue,
  type OhsomeMetric,
} from './ohsomeFilters';

const START_YEAR = 2010;
const END_YEAR = 2026;
const TIME = `${START_YEAR}-01-01/${END_YEAR}-01-01/P1Y`;

export interface MetricSeries {
  id: string;
  label: string;
  unit: '' | 'km' | 'km²';
  series: Array<{ year: number; value: number }>;
  first: number;
  last: number;
  delta: number;
}

export interface GrowthData {
  startYear: number;
  endYear: number;
  metrics: MetricSeries[];
}

interface OhsomeResult {
  result?: Array<{ timestamp: string; value: number }>;
}

const cache = new Map<string, GrowthData>();
const cacheKey = (b: [number, number, number, number]) => b.map((v) => v.toFixed(4)).join(',');

async function fetchMetric(
  metric: OhsomeMetric,
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<MetricSeries> {
  const [w, s, e, n] = bbox;
  const body = new URLSearchParams({
    bboxes: `${w},${s},${e},${n}`,
    filter: metric.filter,
    time: TIME,
    format: 'json',
  });

  const res = await fetch(ohsomeEndpoint(metric.aggregation), {
    method: 'POST',
    body,
    signal,
  });
  if (!res.ok) throw new Error(`ohsome HTTP ${res.status}`);

  const data = (await res.json()) as OhsomeResult;
  const series = (data.result ?? []).map((r) => ({
    year: new Date(r.timestamp).getUTCFullYear(),
    value: toDisplayValue(metric, r.value),
  }));
  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;

  return { id: metric.id, label: metric.label, unit: metric.unit, series, first, last, delta: last - first };
}

/**
 * Fetch all growth metrics for a bbox ([west, south, east, north]) in parallel.
 * Cached forever (in memory). Per-metric failures are dropped, not fatal —
 * ohsome is an academic service; the panel degrades gracefully.
 */
export async function fetchGrowthSeries(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<GrowthData> {
  const key = cacheKey(bbox);
  const cached = cache.get(key);
  if (cached) return cached;

  const settled = await Promise.allSettled(
    OHSOME_GROWTH_METRICS.map((m) => fetchMetric(m, bbox, signal))
  );
  const metrics = settled
    .filter((r): r is PromiseFulfilledResult<MetricSeries> => r.status === 'fulfilled')
    .map((r) => r.value);

  const data: GrowthData = { startYear: START_YEAR, endYear: END_YEAR, metrics };
  if (metrics.length > 0) cache.set(key, data);
  return data;
}

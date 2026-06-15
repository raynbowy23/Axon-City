/**
 * ohsome filter translation (novelty track N4 — Time Machine).
 *
 * ohsome (https://api.ohsome.org) serves historical OSM. It uses its own filter
 * syntax (e.g. `building=* and geometry:polygon`), NOT Overpass QL — so the
 * layer manifest's queries are re-expressed here. These "growth metrics" drive
 * the v0 sparklines (cheap aggregation time series) and seed v1 snapshots.
 *
 * Aggregation per metric: count (features), length (line meters), area (m²).
 */

export type OhsomeAggregation = 'count' | 'length' | 'area';

export interface OhsomeMetric {
  id: string;
  label: string;
  /** ohsome filter-syntax string. */
  filter: string;
  aggregation: OhsomeAggregation;
  /** Display unit for the aggregated value. */
  unit: '' | 'km' | 'km²';
}

/**
 * The group-level growth metrics (one aggregation request each — ~6 per area,
 * cached forever since history is immutable).
 */
export const OHSOME_GROWTH_METRICS: OhsomeMetric[] = [
  {
    id: 'buildings',
    label: 'Buildings',
    filter: 'building=* and geometry:polygon',
    aggregation: 'count',
    unit: '',
  },
  {
    id: 'streets',
    label: 'Streets',
    filter:
      'highway in (primary, secondary, tertiary, residential, living_street, unclassified, service) and geometry:line',
    aggregation: 'length',
    unit: 'km',
  },
  {
    id: 'parks',
    label: 'Parks',
    filter: '(leisure=park or landuse=grass) and geometry:polygon',
    aggregation: 'count',
    unit: '',
  },
  {
    id: 'water',
    label: 'Water',
    filter: '(natural=water or water=*) and geometry:polygon',
    aggregation: 'area',
    unit: 'km²',
  },
  {
    id: 'food',
    label: 'Food & drink',
    filter: 'amenity in (restaurant, cafe, bar, fast_food)',
    aggregation: 'count',
    unit: '',
  },
  {
    id: 'shops',
    label: 'Shops',
    filter: 'shop=*',
    aggregation: 'count',
    unit: '',
  },
];

export const OHSOME_BASE = 'https://api.ohsome.org/v1';

/** Endpoint path for an aggregation type. */
export function ohsomeEndpoint(aggregation: OhsomeAggregation): string {
  return `${OHSOME_BASE}/elements/${aggregation}`;
}

/**
 * Convert a raw ohsome aggregation value to the metric's display unit.
 * ohsome returns length in meters and area in m².
 */
export function toDisplayValue(metric: OhsomeMetric, raw: number): number {
  if (metric.unit === 'km') return raw / 1000;
  if (metric.unit === 'km²') return raw / 1_000_000;
  return raw;
}

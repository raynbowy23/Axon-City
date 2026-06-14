/**
 * City DNA (novelty track N2).
 *
 * Compresses an area's spatial composition into a fixed-order vector of 10
 * normalized dimensions — a "DNA signature" you can read at a glance and
 * compare between areas. Built entirely from stats the app already computes
 * (layer `stats`, `calculatePOIMetrics`, `calculateDerivedMetrics`).
 *
 * NORMALIZATION (provisional): each dimension is mapped to 0–1 against a fixed
 * reference scale below. This is the N2 step-1 foundation that lets us validate
 * the vector differentiates places; step 3 replaces these scales with
 * percentiles against a reference corpus of famous neighborhoods.
 */

import type { Polygon } from 'geojson';
import type { ComparisonArea, LayerData, DerivedMetricType } from '../types';
import { calculatePOIMetrics } from './metricsCalculator';
import { calculateDerivedMetrics } from './externalIndices';

export interface DnaDimension {
  id: string;
  /** Full label for legends/tooltips. */
  label: string;
  /** Short label for compact glyph spokes. */
  short: string;
  /** Phrasing when this dimension is a top/bottom trait. */
  high: string;
  low: string;
}

/** Fixed order — the vector and every glyph spoke follow this. */
export const DNA_DIMENSIONS: DnaDimension[] = [
  { id: 'built', label: 'Built Intensity', short: 'Built', high: 'densely built', low: 'low-built' },
  { id: 'residential', label: 'Residential Character', short: 'Resid.', high: 'residential', low: 'non-residential' },
  { id: 'commercial', label: 'Commercial Mix', short: 'Comm.', high: 'commercial', low: 'commerce-light' },
  { id: 'streets', label: 'Street Grain', short: 'Streets', high: 'fine-grained streets', low: 'coarse street grain' },
  { id: 'bike', label: 'Bike Infrastructure', short: 'Bike', high: 'bike-friendly', low: 'bike-poor' },
  { id: 'transit', label: 'Transit Richness', short: 'Transit', high: 'transit-rich', low: 'transit-poor' },
  { id: 'green', label: 'Green Balance', short: 'Green', high: 'green', low: 'green-poor' },
  { id: 'water', label: 'Water Presence', short: 'Water', high: 'waterfront', low: 'landlocked' },
  { id: 'diversity', label: 'Amenity Diversity', short: 'Diversity', high: 'diverse amenities', low: 'uniform amenities' },
  { id: 'dailyNeeds', label: 'Daily Needs', short: 'Daily', high: 'self-sufficient', low: 'amenity-sparse' },
];

export interface CityDna {
  /** 0–1 per DNA_DIMENSIONS, same order. */
  vector: number[];
  /** Raw values in natural units (pre-normalization), corpus-ready. */
  raw: number[];
  /** Per dimension: was the underlying layer fetched at all? */
  available: boolean[];
  /** Short descriptive traits (2 strongest + 1 weakest dimension). */
  traits: string[];
  /** Raw inputs + normalized values, for calibrating the provisional scales. */
  debug: Record<string, number>;
}

const BUILDING_IDS = [
  'buildings-residential',
  'buildings-commercial',
  'buildings-industrial',
  'buildings-other',
];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Map a raw value to 0–1 against a reference maximum. */
const norm = (value: number, refMax: number): number => clamp01(value / refMax);

const layerCount = (ld: Map<string, LayerData>, id: string): number =>
  ld.get(id)?.stats?.count ?? ld.get(id)?.clippedFeatures?.features.length ?? 0;
const layerAreaShare = (ld: Map<string, LayerData>, id: string): number =>
  ld.get(id)?.stats?.areaShare ?? 0;
const layerLength = (ld: Map<string, LayerData>, id: string): number =>
  ld.get(id)?.stats?.totalLength ?? 0;

/**
 * Provisional normalization scales — the raw value mapping to 1.0 per
 * dimension (DNA_DIMENSIONS order). These are deliberately separated from
 * extraction so recalibration is a one-line edit, and so the corpus step can
 * later replace linear `raw / refMax` with percentile-against-corpus.
 *
 * TODO(N2): tune these against real selections, then replace with corpus
 * percentiles. Current values are first-pass estimates.
 */
export const DNA_SCALES: number[] = [
  50, // built       — building footprint %
  0.9, // residential — residential share of buildings (0–1)
  0.2, // commercial  — commercial share of buildings (0–1; OSM under-tags)
  120, // streets     — intersections / km²
  70, // bike        — bike_score (0–100)
  100, // transit     — weighted stop density (stops / km²)
  25, // green        — park area share %
  6, // water        — water area share %
  2.1, // diversity   — Shannon entropy (8 categories → ~2.08 theoretical max)
  100, // dailyNeeds  — 15-minute score (0–100)
];

/**
 * Layers each dimension depends on. If NONE are present in an area's layerData
 * (the Map lacks the key — i.e. the layer was never fetched), that dimension is
 * "unavailable" rather than genuinely zero, so the glyph and traits can flag it
 * instead of misreading "not loaded" as "none here".
 */
const BUILDING_LAYERS = BUILDING_IDS;
const POI_LAYERS = [
  'poi-food-drink',
  'poi-shopping',
  'poi-grocery',
  'poi-health',
  'poi-education',
];
const DIM_REQUIRED_LAYERS: string[][] = [
  BUILDING_LAYERS, // built
  BUILDING_LAYERS, // residential
  BUILDING_LAYERS, // commercial
  ['roads-primary', 'roads-residential'], // streets
  ['bike-lanes'], // bike
  ['transit-stops', 'rail-lines'], // transit
  ['parks'], // green
  ['water'], // water
  POI_LAYERS, // diversity
  POI_LAYERS, // dailyNeeds
];

/**
 * Canonical layer set City DNA depends on — the single source of truth reused
 * by both the live per-area completeness fetch and the corpus build script, so
 * live areas and corpus entries are computed over the same layers.
 */
export const DNA_LAYER_IDS: string[] = Array.from(new Set(DIM_REQUIRED_LAYERS.flat()));

/**
 * Extract the raw DNA vector in natural units (pre-normalization). This is the
 * corpus-ready representation; `normalizeRawDna` maps it to 0–1.
 */
export function extractRawDna(
  layerData: Map<string, LayerData>,
  areaKm2: number,
  polygon?: Polygon
): { raw: number[]; available: boolean[]; debug: Record<string, number> } {
  const poi = calculatePOIMetrics(layerData, areaKm2);
  const derived = calculateDerivedMetrics(layerData, areaKm2, polygon);
  const dv = (id: DerivedMetricType): number =>
    derived.find((d) => d.metricId === id)?.value ?? 0;

  // Building composition (by count — features are always present).
  const buildingCounts = BUILDING_IDS.map((id) => layerCount(layerData, id));
  const totalBuildings = buildingCounts.reduce((a, b) => a + b, 0);
  const buildingDenom = totalBuildings || 1;
  const residentialShare = buildingCounts[0] / buildingDenom;
  const commercialShare = buildingCounts[1] / buildingDenom;

  const parksShare = layerAreaShare(layerData, 'parks');
  const waterShare = layerAreaShare(layerData, 'water');

  const buildingDensity = dv('building_density');
  const bikeScore = dv('bike_score');
  const fifteenMin = dv('fifteen_min_score');

  // Street grain: calculateDerivedMetrics never emits 'street_connectivity'
  // (it's only used internally for walk/bike scores), so compute it here the
  // same way — ~1 intersection per 200 m of road, per km².
  const roadLength = layerLength(layerData, 'roads-primary') + layerLength(layerData, 'roads-residential');
  const streetConnectivity = areaKm2 > 0 ? roadLength / 200 / areaKm2 : 0;

  // Transit: use the RAW weighted stop density (stops/km²) rather than the
  // derived score, whose log normalization saturates on small selections — a
  // few highway bus stops would otherwise spike Transit to ~1.0.
  const transitBreakdown = derived.find((d) => d.metricId === 'transit_coverage')?.breakdown;
  const transitDensity = transitBreakdown?.weighted_density ?? 0;

  const raw = [
    /* built       */ buildingDensity,
    /* residential */ residentialShare,
    /* commercial  */ commercialShare,
    /* streets     */ streetConnectivity,
    /* bike        */ bikeScore,
    /* transit     */ transitDensity,
    /* green       */ parksShare,
    /* water       */ waterShare,
    /* diversity   */ poi.diversityIndex,
    /* dailyNeeds  */ fifteenMin,
  ];

  const available = DIM_REQUIRED_LAYERS.map((ids) => ids.some((id) => layerData.has(id)));

  const debug: Record<string, number> = {
    areaKm2: round(areaKm2),
    totalBuildings,
  };
  DNA_DIMENSIONS.forEach((d, i) => {
    debug[`${d.short}.raw`] = round(raw[i]);
  });

  // Roads diagnostics for the persistent Streets=0. -1 means the layer key is
  // absent entirely (never fetched); 0 means present but empty after clipping.
  for (const id of ['roads-primary', 'roads-residential']) {
    const entry = layerData.get(id);
    debug[`${id}.has`] = entry ? 1 : -1;
    debug[`${id}.rawFeat`] = entry?.features?.features.length ?? -1;
    debug[`${id}.clipFeat`] = entry?.clippedFeatures?.features.length ?? -1;
    debug[`${id}.len`] = round(entry?.stats?.totalLength ?? -1);
  }

  return { raw, available, debug };
}

/** A function mapping a raw DNA vector to a 0–1 vector. */
export type DnaNormalizer = (raw: number[]) => number[];

/** Map a raw DNA vector to 0–1 using the provisional fixed scales. */
export const normalizeRawDna: DnaNormalizer = (raw) => raw.map((v, i) => norm(v, DNA_SCALES[i]));

/**
 * Compute the City DNA vector for an area's layer data.
 */
export function computeCityDna(
  layerData: Map<string, LayerData>,
  areaKm2: number,
  polygon?: Polygon,
  normalize: DnaNormalizer = normalizeRawDna
): CityDna {
  const { raw, available, debug } = extractRawDna(layerData, areaKm2, polygon);
  const vector = normalize(raw);
  // Surface the normalized value next to each raw input for calibration.
  DNA_DIMENSIONS.forEach((d, i) => {
    debug[`${d.short}.norm`] = round(vector[i]);
  });
  return { vector, raw, available, traits: deriveTraits(vector, available), debug };
}

const round = (v: number): number => Math.round(v * 100) / 100;

/** Convenience: compute DNA directly from a ComparisonArea. */
export function computeAreaDna(area: ComparisonArea, normalize?: DnaNormalizer): CityDna {
  const areaKm2 = area.polygon.area / 1_000_000;
  return computeCityDna(area.layerData, areaKm2, area.polygon.geometry as Polygon, normalize);
}

/**
 * Pick the 2 strongest and the single weakest dimension as descriptive traits,
 * but only when they're meaningfully high/low (avoids "green-poor" noise on a
 * flat profile).
 */
function deriveTraits(vector: number[], available: boolean[]): string[] {
  // Only describe dimensions whose layers were actually loaded.
  const indexed = vector
    .map((value, i) => ({ value, dim: DNA_DIMENSIONS[i], available: available[i] }))
    .filter((d) => d.available);
  const byValue = [...indexed].sort((a, b) => b.value - a.value);

  const traits: string[] = [];
  for (const top of byValue.slice(0, 2)) {
    if (top.value >= 0.5) traits.push(top.dim.high);
  }
  const weakest = byValue[byValue.length - 1];
  if (weakest && weakest.value <= 0.15) traits.push(weakest.dim.low);

  return traits;
}

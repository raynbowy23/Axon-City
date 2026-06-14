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
  /** Short descriptive traits (2 strongest + 1 weakest dimension). */
  traits: string[];
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
const layerDensity = (ld: Map<string, LayerData>, id: string): number =>
  ld.get(id)?.stats?.density ?? 0;

/**
 * Compute the City DNA vector for an area's layer data.
 */
export function computeCityDna(
  layerData: Map<string, LayerData>,
  areaKm2: number,
  polygon?: Polygon
): CityDna {
  const poi = calculatePOIMetrics(layerData, areaKm2);
  const derived = calculateDerivedMetrics(layerData, areaKm2, polygon);
  const dv = (id: DerivedMetricType): number =>
    derived.find((d) => d.metricId === id)?.value ?? 0;

  // Building composition (by count — features are always present).
  const buildingCounts = BUILDING_IDS.map((id) => layerCount(layerData, id));
  const totalBuildings = buildingCounts.reduce((a, b) => a + b, 0) || 1;
  const residentialShare = buildingCounts[0] / totalBuildings;
  const commercialShare = buildingCounts[1] / totalBuildings;

  const shoppingDensity = layerDensity(layerData, 'poi-shopping');
  const parksShare = layerAreaShare(layerData, 'parks');
  const treeDensity = layerDensity(layerData, 'trees');
  const waterShare = layerAreaShare(layerData, 'water');

  // Each dimension → 0–1 (see provisional normalization note at top).
  const vector = [
    /* built       */ norm(dv('building_density'), 60), // footprint %, ~60% = max
    /* residential */ clamp01(residentialShare),
    /* commercial  */ clamp01(commercialShare * 0.6 + norm(shoppingDensity, 40) * 0.4),
    /* streets     */ norm(dv('street_connectivity'), 150), // intersections/km²
    /* bike        */ norm(dv('bike_score'), 100),
    /* transit     */ norm(dv('transit_coverage'), 100),
    /* green       */ clamp01(norm(parksShare, 25) * 0.7 + norm(treeDensity, 150) * 0.3),
    /* water       */ norm(waterShare, 15),
    /* diversity   */ norm(poi.diversityIndex, 2.1), // Shannon, ~2.1 = very high
    /* dailyNeeds  */ norm(dv('fifteen_min_score'), 100),
  ];

  return { vector, traits: deriveTraits(vector) };
}

/** Convenience: compute DNA directly from a ComparisonArea. */
export function computeAreaDna(area: ComparisonArea): CityDna {
  const areaKm2 = area.polygon.area / 1_000_000;
  return computeCityDna(area.layerData, areaKm2, area.polygon.geometry as Polygon);
}

/**
 * Pick the 2 strongest and the single weakest dimension as descriptive traits,
 * but only when they're meaningfully high/low (avoids "green-poor" noise on a
 * flat profile).
 */
function deriveTraits(vector: number[]): string[] {
  const indexed = vector.map((value, i) => ({ value, dim: DNA_DIMENSIONS[i] }));
  const byValue = [...indexed].sort((a, b) => b.value - a.value);

  const traits: string[] = [];
  for (const top of byValue.slice(0, 2)) {
    if (top.value >= 0.5) traits.push(top.dim.high);
  }
  const weakest = byValue[byValue.length - 1];
  if (weakest.value <= 0.15) traits.push(weakest.dim.low);

  return traits;
}

/**
 * POI Metrics Calculator
 * Practitioner-grade urban analysis metrics
 */

import type { LayerData, ComparisonArea } from '../types';

// POI category definitions for metrics
export const POI_CATEGORIES = {
  food: {
    id: 'food',
    name: 'Food & Dining',
    layerIds: ['poi-food-drink'],
    color: [255, 87, 51] as [number, number, number],
  },
  shopping: {
    id: 'shopping',
    name: 'Retail & Shopping',
    layerIds: ['poi-shopping'],
    color: [255, 195, 0] as [number, number, number],
  },
  grocery: {
    id: 'grocery',
    name: 'Grocery & Convenience',
    layerIds: ['poi-grocery'],
    color: [76, 175, 80] as [number, number, number],
  },
  health: {
    id: 'health',
    name: 'Healthcare',
    layerIds: ['poi-health'],
    color: [244, 67, 54] as [number, number, number],
  },
  education: {
    id: 'education',
    name: 'Education',
    layerIds: ['poi-education'],
    color: [103, 58, 183] as [number, number, number],
  },
  bike: {
    id: 'bike',
    name: 'Cycling Infrastructure',
    layerIds: ['poi-bike-parking', 'poi-bike-shops', 'bike-lanes'],
    color: [0, 188, 212] as [number, number, number],
  },
  transit: {
    id: 'transit',
    name: 'Public Transit',
    layerIds: ['transit-stops', 'rail-lines'],
    color: [0, 128, 255] as [number, number, number],
  },
  green: {
    id: 'green',
    name: 'Green Space',
    layerIds: ['parks', 'trees'],
    color: [34, 139, 34] as [number, number, number],
  },
} as const;

export type POICategoryId = keyof typeof POI_CATEGORIES;

export interface CategoryMetric {
  id: string;
  name: string;
  count: number;
  density: number;        // per km²
  share: number;          // percentage of total
  color: [number, number, number];
}

export interface POIMetrics {
  totalCount: number;
  density: number;              // total POIs per km²
  diversityIndex: number;       // Shannon index
  diversityLabel: string;       // Human-readable interpretation
  categoryBreakdown: CategoryMetric[];
  coverageScore: number;        // 0-100%
  coverageLabel: string;        // Human-readable
  areaKm2: number;
  timestamp: string;            // ISO 8601
}

/**
 * Calculate Shannon Diversity Index
 * H = -Σ(pᵢ × ln(pᵢ))
 *
 * Measures how evenly POIs are distributed across categories.
 * - 0 = Single category only
 * - Higher values = More diversity
 */
export function calculateShannonIndex(counts: number[]): number {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;

  let entropy = 0;
  for (const count of counts) {
    if (count > 0) {
      const proportion = count / total;
      entropy -= proportion * Math.log(proportion);
    }
  }

  return entropy;
}

/**
 * Interpret Shannon Diversity Index value
 */
export function interpretDiversityIndex(index: number): string {
  if (index === 0) return 'None';
  if (index < 0.5) return 'Very Low';
  if (index < 1.0) return 'Low';
  if (index < 1.5) return 'Moderate';
  if (index < 2.0) return 'High';
  return 'Very High';
}

/**
 * Calculate coverage score (percentage of categories with data)
 */
export function calculateCoverageScore(breakdown: CategoryMetric[]): number {
  if (breakdown.length === 0) return 0;
  const presentCategories = breakdown.filter(c => c.count > 0).length;
  return (presentCategories / breakdown.length) * 100;
}

/**
 * Interpret coverage score
 */
export function interpretCoverageScore(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Partial';
  return 'Limited';
}

/**
 * Get POI count from layer data for specified layer IDs
 */
function getCountFromLayers(
  layerData: Map<string, LayerData>,
  layerIds: readonly string[]
): number {
  let total = 0;
  for (const layerId of layerIds) {
    const data = layerData.get(layerId);
    if (data?.clippedFeatures) {
      total += data.clippedFeatures.features.length;
    } else if (data?.features) {
      total += data.features.features.length;
    }
  }
  return total;
}

/**
 * Calculate comprehensive POI metrics for an area
 */
export function calculatePOIMetrics(
  layerData: Map<string, LayerData>,
  areaKm2: number
): POIMetrics {
  const categoryBreakdown: CategoryMetric[] = [];
  let totalCount = 0;

  // Calculate metrics for each category
  for (const category of Object.values(POI_CATEGORIES)) {
    const count = getCountFromLayers(layerData, category.layerIds);
    totalCount += count;

    categoryBreakdown.push({
      id: category.id,
      name: category.name,
      count,
      density: areaKm2 > 0 ? count / areaKm2 : 0,
      share: 0, // Will calculate after total is known
      color: category.color,
    });
  }

  // Calculate share percentages
  for (const category of categoryBreakdown) {
    category.share = totalCount > 0 ? (category.count / totalCount) * 100 : 0;
  }

  // Calculate diversity index from category counts
  const counts = categoryBreakdown.map(c => c.count);
  const diversityIndex = calculateShannonIndex(counts);

  // Calculate coverage
  const coverageScore = calculateCoverageScore(categoryBreakdown);

  return {
    totalCount,
    density: areaKm2 > 0 ? totalCount / areaKm2 : 0,
    diversityIndex,
    diversityLabel: interpretDiversityIndex(diversityIndex),
    categoryBreakdown,
    coverageScore,
    coverageLabel: interpretCoverageScore(coverageScore),
    areaKm2,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate metrics for a comparison area
 */
export function calculateAreaMetrics(area: ComparisonArea): POIMetrics {
  const areaKm2 = area.polygon.area / 1_000_000; // Convert m² to km²
  return calculatePOIMetrics(area.layerData, areaKm2);
}

/**
 * Calculate delta between two values as percentage
 */
export function calculateDelta(valueA: number, valueB: number): number {
  if (valueB === 0) return valueA > 0 ? 100 : 0;
  return ((valueA - valueB) / valueB) * 100;
}

/**
 * Get delta indicator symbol
 */
export function getDeltaIndicator(delta: number): string {
  if (delta > 50) return '▲▲';
  if (delta > 10) return '▲';
  if (delta < -50) return '▼▼';
  if (delta < -10) return '▼';
  return '';
}

/**
 * Format number for display
 */
export function formatMetricValue(value: number, decimals: number = 1): string {
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'k';
  }
  return value.toFixed(decimals);
}

/**
 * Format density for display
 */
export function formatDensity(density: number): string {
  return formatMetricValue(density, 1) + '/km²';
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  return value.toFixed(1) + '%';
}

/**
 * Compare metrics between two areas
 */
export interface MetricComparison {
  metricId: string;
  metricName: string;
  values: number[];
  delta: number;
  deltaIndicator: string;
  unit: string;
}

export function compareAreaMetrics(
  metricsA: POIMetrics,
  metricsB: POIMetrics
): MetricComparison[] {
  const comparisons: MetricComparison[] = [
    {
      metricId: 'totalCount',
      metricName: 'Total POIs',
      values: [metricsA.totalCount, metricsB.totalCount],
      delta: calculateDelta(metricsA.totalCount, metricsB.totalCount),
      deltaIndicator: getDeltaIndicator(calculateDelta(metricsA.totalCount, metricsB.totalCount)),
      unit: 'count',
    },
    {
      metricId: 'density',
      metricName: 'POI Density',
      values: [metricsA.density, metricsB.density],
      delta: calculateDelta(metricsA.density, metricsB.density),
      deltaIndicator: getDeltaIndicator(calculateDelta(metricsA.density, metricsB.density)),
      unit: 'per km²',
    },
    {
      metricId: 'diversityIndex',
      metricName: 'Diversity Index',
      values: [metricsA.diversityIndex, metricsB.diversityIndex],
      delta: calculateDelta(metricsA.diversityIndex, metricsB.diversityIndex),
      deltaIndicator: getDeltaIndicator(calculateDelta(metricsA.diversityIndex, metricsB.diversityIndex)),
      unit: 'index',
    },
  ];

  return comparisons;
}

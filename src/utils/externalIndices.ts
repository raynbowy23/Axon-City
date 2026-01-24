import * as turf from '@turf/turf';
import type {
  ExternalIndex,
  DerivedMetricType,
  DerivedMetricDefinition,
  DerivedMetricValue,
  IndexImportConfig,
  LayerData,
  FeatureCollection,
  Polygon,
  Feature,
} from '../types';

// Derived metric definitions
export const DERIVED_METRIC_DEFINITIONS: DerivedMetricDefinition[] = [
  {
    id: 'diversity_index',
    name: 'Diversity Index',
    description: 'Shannon entropy measuring variety of POI types. Higher = more diverse mix of amenities.',
    formula: 'H = -Σ(pᵢ × ln(pᵢ))',
    unit: '',
    requiredLayers: [
      'amenities-restaurants',
      'amenities-cafes',
      'amenities-shops',
      'amenities-entertainment',
      'amenities-healthcare',
      'amenities-education',
    ],
    interpretation: {
      low: '< 1.0: Limited variety, dominated by one type',
      medium: '1.0 - 2.0: Moderate mix of amenities',
      high: '> 2.0: High diversity, vibrant mixed-use area',
    },
  },
  {
    id: 'green_ratio',
    name: 'Green Space Ratio',
    description: 'Percentage of area covered by parks and green spaces.',
    formula: '(Park Area / Total Area) × 100',
    unit: '%',
    requiredLayers: ['parks', 'nature-water'],
    interpretation: {
      low: '< 10%: Limited green space',
      medium: '10-20%: Adequate green coverage',
      high: '> 20%: Excellent green space access',
    },
  },
  {
    id: 'street_connectivity',
    name: 'Street Connectivity',
    description: 'Intersection density indicating walkable grid vs cul-de-sac patterns.',
    formula: 'Intersections / km²',
    unit: 'per km²',
    requiredLayers: ['roads-primary', 'roads-secondary', 'roads-residential'],
    interpretation: {
      low: '< 50: Disconnected, car-dependent',
      medium: '50-100: Moderate connectivity',
      high: '> 100: Highly connected, walkable grid',
    },
  },
  {
    id: 'building_density',
    name: 'Building Density',
    description: 'Building footprint coverage as percentage of land area.',
    formula: '(Building Footprint / Total Area) × 100',
    unit: '%',
    requiredLayers: [
      'buildings-residential',
      'buildings-commercial',
      'buildings-industrial',
      'buildings-other',
    ],
    interpretation: {
      low: '< 20%: Low density, suburban',
      medium: '20-40%: Medium density',
      high: '> 40%: High density urban',
    },
  },
  {
    id: 'transit_coverage',
    name: 'Transit Coverage',
    description: 'Percentage of area within 400m walking distance of transit stops.',
    formula: '(Area within 400m of transit / Total Area) × 100',
    unit: '%',
    requiredLayers: ['transit-stops', 'transit-stations'],
    interpretation: {
      low: '< 30%: Poor transit access',
      medium: '30-70%: Moderate transit coverage',
      high: '> 70%: Excellent transit access',
    },
  },
  {
    id: 'mixed_use_score',
    name: 'Mixed-Use Score',
    description: 'Measure of residential and commercial land use integration.',
    formula: '1 - |Residential% - Commercial%| / 100',
    unit: '',
    requiredLayers: ['buildings-residential', 'buildings-commercial'],
    interpretation: {
      low: '< 0.3: Segregated single-use',
      medium: '0.3-0.6: Partial mixed-use',
      high: '> 0.6: Well-integrated mixed-use',
    },
  },
  {
    id: 'walkability_proxy',
    name: 'Walkability Score',
    description: 'Composite score based on amenity density and street connectivity.',
    formula: '(Amenity Density × 0.6) + (Street Connectivity × 0.4)',
    unit: '',
    requiredLayers: [
      'amenities-restaurants',
      'amenities-shops',
      'roads-residential',
      'transit-stops',
    ],
    interpretation: {
      low: '< 40: Car-dependent',
      medium: '40-70: Somewhat walkable',
      high: '> 70: Very walkable',
    },
  },
  {
    id: 'fifteen_min_score',
    name: '15-Minute City Score',
    description: 'Access to essential amenities within 15-minute walk (1.2km).',
    formula: 'Categories accessible / Total essential categories',
    unit: '%',
    requiredLayers: [
      'amenities-restaurants',
      'amenities-shops',
      'amenities-healthcare',
      'amenities-education',
      'parks',
      'transit-stops',
    ],
    interpretation: {
      low: '< 50%: Missing essential services',
      medium: '50-80%: Most essentials accessible',
      high: '> 80%: Complete 15-minute neighborhood',
    },
  },
];

/**
 * Parse CSV file and extract columns
 */
export async function parseCSV(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const text = await file.text();
  const lines = text.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Detect delimiter (comma, semicolon, or tab)
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

/**
 * Import external index from CSV file
 */
export async function importIndexFromCSV(
  config: IndexImportConfig
): Promise<ExternalIndex> {
  const { headers, rows } = await parseCSV(config.file);

  // Validate required columns exist
  if (!headers.includes(config.valueColumn)) {
    throw new Error(`Value column "${config.valueColumn}" not found in CSV`);
  }

  const values = new Map<string, number>();
  let min = Infinity;
  let max = -Infinity;

  for (const row of rows) {
    const valueStr = row[config.valueColumn];
    const value = parseFloat(valueStr);

    if (isNaN(value)) continue;

    // Determine the key (area name, ID, or coordinates)
    let key: string;
    if (config.areaColumn && row[config.areaColumn]) {
      key = row[config.areaColumn];
    } else if (config.latColumn && config.lonColumn) {
      const lat = parseFloat(row[config.latColumn]);
      const lon = parseFloat(row[config.lonColumn]);
      if (!isNaN(lat) && !isNaN(lon)) {
        key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
      } else {
        continue;
      }
    } else {
      // Use row index as key
      key = `row-${values.size}`;
    }

    values.set(key, value);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (values.size === 0) {
    throw new Error('No valid numeric values found in CSV');
  }

  return {
    id: `index-${Date.now()}`,
    name: config.name,
    source: `Imported from ${config.file.name}`,
    description: config.description,
    values,
    min,
    max,
    unit: config.unit,
    colorScale: 'sequential',
    importedAt: new Date(),
  };
}

/**
 * Calculate Shannon diversity index from layer data
 */
function calculateDiversityIndex(
  layerData: Map<string, LayerData>,
  requiredLayers: string[]
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const counts: Record<string, number> = {};
  let total = 0;
  let availableLayers = 0;

  for (const layerId of requiredLayers) {
    const data = layerData.get(layerId);
    if (data?.clippedFeatures) {
      const count = data.clippedFeatures.features.length;
      counts[layerId] = count;
      total += count;
      availableLayers++;
    }
  }

  if (total === 0) {
    return { value: 0, confidence: 'low', breakdown: counts };
  }

  // Shannon entropy: H = -Σ(pᵢ × ln(pᵢ))
  let entropy = 0;
  for (const layerId of Object.keys(counts)) {
    const p = counts[layerId] / total;
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }

  // Normalize to 0-100 scale (max entropy for n categories = ln(n))
  const maxEntropy = Math.log(requiredLayers.length);
  const normalizedValue = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

  const confidence =
    availableLayers >= requiredLayers.length * 0.8
      ? 'high'
      : availableLayers >= requiredLayers.length * 0.5
        ? 'medium'
        : 'low';

  return { value: normalizedValue, confidence, breakdown: counts };
}

/**
 * Calculate green space ratio
 */
function calculateGreenRatio(
  layerData: Map<string, LayerData>,
  areaKm2: number
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let totalGreenArea = 0;

  const greenLayers = ['parks', 'nature-water'];
  let availableLayers = 0;

  for (const layerId of greenLayers) {
    const data = layerData.get(layerId);
    if (data?.stats?.totalArea) {
      breakdown[layerId] = data.stats.totalArea;
      totalGreenArea += data.stats.totalArea;
      availableLayers++;
    }
  }

  const areaM2 = areaKm2 * 1_000_000;
  const ratio = areaM2 > 0 ? (totalGreenArea / areaM2) * 100 : 0;

  return {
    value: Math.min(ratio, 100),
    confidence: availableLayers > 0 ? 'high' : 'low',
    breakdown,
  };
}

/**
 * Calculate building density
 */
function calculateBuildingDensity(
  layerData: Map<string, LayerData>,
  areaKm2: number
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let totalBuildingArea = 0;

  const buildingLayers = [
    'buildings-residential',
    'buildings-commercial',
    'buildings-industrial',
    'buildings-other',
  ];
  let availableLayers = 0;

  for (const layerId of buildingLayers) {
    const data = layerData.get(layerId);
    if (data?.stats?.totalArea) {
      breakdown[layerId] = data.stats.totalArea;
      totalBuildingArea += data.stats.totalArea;
      availableLayers++;
    }
  }

  const areaM2 = areaKm2 * 1_000_000;
  const density = areaM2 > 0 ? (totalBuildingArea / areaM2) * 100 : 0;

  return {
    value: Math.min(density, 100),
    confidence: availableLayers >= 2 ? 'high' : availableLayers > 0 ? 'medium' : 'low',
    breakdown,
  };
}

/**
 * Calculate transit coverage (simplified - based on stop density)
 */
function calculateTransitCoverage(
  layerData: Map<string, LayerData>,
  areaKm2: number,
  polygon?: Polygon
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  const transitLayers = ['transit-stops', 'transit-stations'];
  let totalStops = 0;

  for (const layerId of transitLayers) {
    const data = layerData.get(layerId);
    if (data?.clippedFeatures) {
      const count = data.clippedFeatures.features.length;
      breakdown[layerId] = count;
      totalStops += count;
    }
  }

  // Estimate coverage: each stop covers ~400m radius = ~0.5 km² with overlap
  // Use a diminishing returns formula
  const coveragePerStop = 0.15; // km² effective coverage per stop (accounting for overlap)
  const estimatedCoverage = Math.min(
    (1 - Math.exp(-totalStops * coveragePerStop / areaKm2)) * 100,
    100
  );

  return {
    value: estimatedCoverage,
    confidence: totalStops > 0 ? 'medium' : 'low',
    breakdown,
  };
}

/**
 * Calculate mixed-use score
 */
function calculateMixedUseScore(
  layerData: Map<string, LayerData>
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  const residentialData = layerData.get('buildings-residential');
  const commercialData = layerData.get('buildings-commercial');

  const residentialArea = residentialData?.stats?.totalArea || 0;
  const commercialArea = commercialData?.stats?.totalArea || 0;
  const totalArea = residentialArea + commercialArea;

  breakdown['buildings-residential'] = residentialArea;
  breakdown['buildings-commercial'] = commercialArea;

  if (totalArea === 0) {
    return { value: 0, confidence: 'low', breakdown };
  }

  const residentialRatio = residentialArea / totalArea;
  const commercialRatio = commercialArea / totalArea;

  // Score is highest when ratios are equal (0.5 each)
  // Formula: 1 - |res - com| gives max 1 when equal
  const mixScore = (1 - Math.abs(residentialRatio - commercialRatio)) * 100;

  return {
    value: mixScore,
    confidence: totalArea > 0 ? 'high' : 'low',
    breakdown,
  };
}

/**
 * Calculate walkability proxy score
 */
function calculateWalkabilityProxy(
  layerData: Map<string, LayerData>,
  areaKm2: number
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // Amenity density component (60% weight)
  const amenityLayers = ['amenities-restaurants', 'amenities-cafes', 'amenities-shops'];
  let totalAmenities = 0;

  for (const layerId of amenityLayers) {
    const data = layerData.get(layerId);
    if (data?.clippedFeatures) {
      totalAmenities += data.clippedFeatures.features.length;
    }
  }

  const amenityDensity = areaKm2 > 0 ? totalAmenities / areaKm2 : 0;
  // Normalize: 100 amenities/km² = score of 100
  const amenityScore = Math.min((amenityDensity / 100) * 100, 100);
  breakdown['amenity_density'] = amenityDensity;

  // Transit access component (40% weight)
  const transitData = layerData.get('transit-stops');
  const transitCount = transitData?.clippedFeatures?.features.length || 0;
  const transitDensity = areaKm2 > 0 ? transitCount / areaKm2 : 0;
  // Normalize: 10 stops/km² = score of 100
  const transitScore = Math.min((transitDensity / 10) * 100, 100);
  breakdown['transit_density'] = transitDensity;

  const walkabilityScore = amenityScore * 0.6 + transitScore * 0.4;

  return {
    value: walkabilityScore,
    confidence: totalAmenities > 0 || transitCount > 0 ? 'medium' : 'low',
    breakdown,
  };
}

/**
 * Calculate 15-minute city score
 */
function calculateFifteenMinScore(
  layerData: Map<string, LayerData>
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  // Essential categories for 15-minute city
  const essentialCategories = [
    { id: 'food', layers: ['amenities-restaurants', 'amenities-cafes', 'amenities-shops'] },
    { id: 'healthcare', layers: ['amenities-healthcare'] },
    { id: 'education', layers: ['amenities-education'] },
    { id: 'green_space', layers: ['parks'] },
    { id: 'transit', layers: ['transit-stops', 'transit-stations'] },
  ];

  let categoriesWithAccess = 0;

  for (const category of essentialCategories) {
    let hasAccess = false;
    for (const layerId of category.layers) {
      const data = layerData.get(layerId);
      if (data?.clippedFeatures && data.clippedFeatures.features.length > 0) {
        hasAccess = true;
        break;
      }
    }
    breakdown[category.id] = hasAccess ? 1 : 0;
    if (hasAccess) categoriesWithAccess++;
  }

  const score = (categoriesWithAccess / essentialCategories.length) * 100;

  return {
    value: score,
    confidence: 'high',
    breakdown,
  };
}

/**
 * Calculate all derived metrics for a given area
 */
export function calculateDerivedMetrics(
  layerData: Map<string, LayerData>,
  areaKm2: number,
  polygon?: Polygon
): DerivedMetricValue[] {
  const metrics: DerivedMetricValue[] = [];

  // Diversity Index
  const diversityDef = DERIVED_METRIC_DEFINITIONS.find((d) => d.id === 'diversity_index')!;
  const diversity = calculateDiversityIndex(layerData, diversityDef.requiredLayers);
  metrics.push({
    metricId: 'diversity_index',
    value: diversity.value,
    confidence: diversity.confidence,
    breakdown: diversity.breakdown,
  });

  // Green Ratio
  const greenRatio = calculateGreenRatio(layerData, areaKm2);
  metrics.push({
    metricId: 'green_ratio',
    value: greenRatio.value,
    confidence: greenRatio.confidence,
    breakdown: greenRatio.breakdown,
  });

  // Building Density
  const buildingDensity = calculateBuildingDensity(layerData, areaKm2);
  metrics.push({
    metricId: 'building_density',
    value: buildingDensity.value,
    confidence: buildingDensity.confidence,
    breakdown: buildingDensity.breakdown,
  });

  // Transit Coverage
  const transitCoverage = calculateTransitCoverage(layerData, areaKm2, polygon);
  metrics.push({
    metricId: 'transit_coverage',
    value: transitCoverage.value,
    confidence: transitCoverage.confidence,
    breakdown: transitCoverage.breakdown,
  });

  // Mixed-Use Score
  const mixedUse = calculateMixedUseScore(layerData);
  metrics.push({
    metricId: 'mixed_use_score',
    value: mixedUse.value,
    confidence: mixedUse.confidence,
    breakdown: mixedUse.breakdown,
  });

  // Walkability Proxy
  const walkability = calculateWalkabilityProxy(layerData, areaKm2);
  metrics.push({
    metricId: 'walkability_proxy',
    value: walkability.value,
    confidence: walkability.confidence,
    breakdown: walkability.breakdown,
  });

  // 15-Minute City Score
  const fifteenMin = calculateFifteenMinScore(layerData);
  metrics.push({
    metricId: 'fifteen_min_score',
    value: fifteenMin.value,
    confidence: fifteenMin.confidence,
    breakdown: fifteenMin.breakdown,
  });

  return metrics;
}

/**
 * Get metric definition by ID
 */
export function getMetricDefinition(metricId: DerivedMetricType): DerivedMetricDefinition | undefined {
  return DERIVED_METRIC_DEFINITIONS.find((d) => d.id === metricId);
}

/**
 * Format metric value with unit
 */
export function formatMetricValue(value: number, metricId: DerivedMetricType): string {
  const definition = getMetricDefinition(metricId);
  const unit = definition?.unit || '';

  if (unit === '%') {
    return `${value.toFixed(1)}%`;
  } else if (unit === 'per km²') {
    return `${value.toFixed(0)}/km²`;
  } else {
    return value.toFixed(1);
  }
}

/**
 * Get interpretation level for a metric value
 */
export function getMetricInterpretation(
  value: number,
  metricId: DerivedMetricType
): 'low' | 'medium' | 'high' {
  // Thresholds based on metric type
  const thresholds: Record<DerivedMetricType, { low: number; high: number }> = {
    diversity_index: { low: 30, high: 60 },
    green_ratio: { low: 10, high: 20 },
    street_connectivity: { low: 50, high: 100 },
    building_density: { low: 20, high: 40 },
    transit_coverage: { low: 30, high: 70 },
    mixed_use_score: { low: 30, high: 60 },
    walkability_proxy: { low: 40, high: 70 },
    fifteen_min_score: { low: 50, high: 80 },
  };

  const t = thresholds[metricId];
  if (!t) return 'medium';

  if (value < t.low) return 'low';
  if (value >= t.high) return 'high';
  return 'medium';
}

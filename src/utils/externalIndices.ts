import type {
  ExternalIndex,
  DerivedMetricType,
  DerivedMetricDefinition,
  DerivedMetricValue,
  IndexImportConfig,
  LayerData,
  Polygon,
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
      'poi-food-drink',
      'poi-shopping',
      'poi-grocery',
      'poi-health',
      'poi-education',
    ],
    interpretation: {
      low: '< 30: Limited variety, dominated by one type',
      medium: '30-60: Moderate mix of amenities',
      high: '> 60: High diversity, vibrant mixed-use area',
    },
  },
  {
    id: 'green_ratio',
    name: 'Green Space Ratio',
    description: 'Percentage of area covered by parks and green spaces.',
    formula: '(Park Area / Total Area) × 100',
    unit: '%',
    requiredLayers: ['parks', 'water'],
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
    requiredLayers: ['roads-primary', 'roads-residential'],
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
    name: 'Transit Score (Proxy)',
    description: 'Estimates transit accessibility using Transit Score methodology: mode-weighted stop density with logarithmic normalization. Rail stations weighted 2x, bus stops 1x.',
    formula: 'log(Σ(stops × mode_weight)) normalized to 0-100',
    unit: '',
    requiredLayers: ['transit-stops', 'rail-lines'],
    interpretation: {
      low: '< 25: Minimal Transit (few or no transit options)',
      medium: '25-50: Some Transit (a few public transportation options)',
      high: '> 50: Excellent Transit to Rider\'s Paradise',
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
      low: '< 30: Segregated single-use',
      medium: '30-60: Partial mixed-use',
      high: '> 60: Well-integrated mixed-use',
    },
  },
  {
    id: 'walkability_proxy',
    name: 'Walk Score (Proxy)',
    description: 'Estimates walkability based on Walk Score methodology: amenity categories with distance-decay weighting, plus pedestrian friendliness factors (intersection density).',
    formula: 'Σ(Category Score × Weight) + Pedestrian Friendliness Bonus',
    unit: '',
    requiredLayers: [
      'poi-food-drink',
      'poi-shopping',
      'poi-grocery',
      'poi-health',
      'poi-education',
      'parks',
      'transit-stops',
      'roads-primary',
      'roads-residential',
    ],
    interpretation: {
      low: '< 50: Car-Dependent (most errands require a car)',
      medium: '50-70: Somewhat Walkable (some errands can be done on foot)',
      high: '> 70: Very Walkable to Walker\'s Paradise',
    },
  },
  {
    id: 'fifteen_min_score',
    name: '15-Minute City Score',
    description: 'Access to essential amenities within 15-minute walk (1.2km).',
    formula: 'Categories accessible / Total essential categories',
    unit: '%',
    requiredLayers: [
      'poi-food-drink',
      'poi-grocery',
      'poi-health',
      'poi-education',
      'parks',
      'transit-stops',
    ],
    interpretation: {
      low: '< 50%: Missing essential services',
      medium: '50-80%: Most essentials accessible',
      high: '> 80%: Complete 15-minute neighborhood',
    },
  },
  {
    id: 'bike_score',
    name: 'Bike Score (Proxy)',
    description: 'Estimates bikeability based on Bike Score methodology: bike infrastructure density, bike facilities, and road connectivity for cycling.',
    formula: 'Infrastructure Score (50%) + Amenities Score (30%) + Connectivity Bonus (20%)',
    unit: '',
    requiredLayers: [
      'bike-lanes',
      'poi-bike-parking',
      'poi-bike-shops',
      'roads-primary',
      'roads-residential',
    ],
    interpretation: {
      low: '< 50: Minimal Bike Infrastructure (biking is inconvenient)',
      medium: '50-70: Bikeable (biking is convenient for most trips)',
      high: '> 70: Very Bikeable to Biker\'s Paradise',
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

  const greenLayers = ['parks', 'water'];
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
 * Transit Score methodology:
 * - Mode weights: Heavy/light rail = 2x, Ferry/cable car = 1.5x, Bus = 1x
 * - Sum up mode-weighted value of all nearby transit stops
 * - Apply logarithmic normalization (matches rider experience)
 * - Benchmarked against major US cities for calibration
 *
 * Since we don't have frequency data from OSM, we use stop count as proxy:
 * - Rail stations (higher frequency assumed): weight = 2
 * - Bus stops: weight = 1
 *
 * Logarithmic normalization: Transit riders experience incremental improvements
 * as transit quality increases, but with diminishing returns at higher levels.
 */

// Transit Score mode weights
const TRANSIT_MODE_WEIGHTS = {
  'rail-lines': 2.0,  // Rail stations (heavy/light rail)
  'transit-stops': 1.0,     // Bus stops
  // Future: 'transit-ferry': 1.5, 'transit-cable': 1.5
};

// Benchmark values based on major US cities (mode-weighted stops per km²)
// Used for logarithmic normalization
const TRANSIT_BENCHMARKS = {
  // Dense transit: Manhattan, SF, Chicago Loop
  highDensity: 50,    // ~100 Transit Score
  // Good transit: Boston, Portland, Seattle
  mediumDensity: 20,  // ~50 Transit Score
  // Minimal transit: Suburban areas
  lowDensity: 5,      // ~25 Transit Score
};

/**
 * Calculate Transit Score using mode-weighted density with logarithmic normalization
 */
function calculateTransitCoverage(
  layerData: Map<string, LayerData>,
  areaKm2: number,
  _polygon?: Polygon
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  let weightedSum = 0;
  let totalStops = 0;
  let hasStationData = false;
  let hasBusData = false;

  // Calculate mode-weighted sum
  for (const [layerId, weight] of Object.entries(TRANSIT_MODE_WEIGHTS)) {
    const data = layerData.get(layerId);
    if (data?.clippedFeatures) {
      const count = data.clippedFeatures.features.length;
      breakdown[`${layerId}_count`] = count;
      breakdown[`${layerId}_weighted`] = count * weight;
      weightedSum += count * weight;
      totalStops += count;

      if (layerId === 'rail-lines' && count > 0) hasStationData = true;
      if (layerId === 'transit-stops' && count > 0) hasBusData = true;
    }
  }

  breakdown['total_stops'] = totalStops;
  breakdown['weighted_sum'] = weightedSum;

  if (weightedSum === 0 || areaKm2 === 0) {
    return {
      value: 0,
      confidence: 'low',
      breakdown,
    };
  }

  // Calculate mode-weighted density (stops per km²)
  const weightedDensity = weightedSum / areaKm2;
  breakdown['weighted_density'] = weightedDensity;

  // Logarithmic normalization formula:
  // Score = 100 * log(1 + density) / log(1 + highDensity)
  // This gives:
  // - density = highDensity → score = 100
  // - density = mediumDensity → score ≈ 72
  // - density = lowDensity → score ≈ 43
  // - density = 1 → score ≈ 17
  const normalizedScore = Math.min(
    100,
    (Math.log1p(weightedDensity) / Math.log1p(TRANSIT_BENCHMARKS.highDensity)) * 100
  );

  breakdown['raw_score'] = normalizedScore;

  // Determine confidence based on data availability
  // High confidence if we have both rail and bus data
  // Medium if we have one type, low if no data
  const confidence: 'high' | 'medium' | 'low' =
    hasStationData && hasBusData ? 'high' :
    hasStationData || hasBusData ? 'medium' : 'low';

  return {
    value: normalizedScore,
    confidence,
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
 * Walk Score methodology:
 * - Points awarded based on distance to amenities in each category
 * - Max points within 5 min walk (0.25 mi / 400m)
 * - Decay function to 0 points at 30 min walk (1.5 mi / 2.4km)
 * - Categories: Grocery, Restaurants, Shopping, Coffee, Banks, Parks, Schools, Entertainment
 * - Pedestrian friendliness: population density, intersection density, block length
 *
 * Our proxy uses amenity density as a stand-in for distance-based scoring,
 * since higher density means amenities are more likely to be within walking distance.
 */

// Walk Score category weights (based on Walk Score's published methodology)
// Layer IDs must match layerManifest.ts
const WALK_SCORE_CATEGORIES = [
  { id: 'grocery', layers: ['poi-grocery'], weight: 3, maxCount: 5 },
  { id: 'restaurants', layers: ['poi-food-drink'], weight: 3, maxCount: 10 },
  { id: 'shopping', layers: ['poi-shopping'], weight: 2, maxCount: 5 },
  { id: 'coffee', layers: ['poi-food-drink'], weight: 2, maxCount: 4 },
  { id: 'parks', layers: ['parks'], weight: 2, maxCount: 3 },
  { id: 'schools', layers: ['poi-education'], weight: 2, maxCount: 3 },
  { id: 'healthcare', layers: ['poi-health'], weight: 1, maxCount: 2 },
];

/**
 * Distance decay function based on Walk Score methodology
 * Max points at 0.25 mi (400m), decay to 0 at 1.5 mi (2400m)
 * Since we use density as proxy, we convert density to an estimated "coverage score"
 */
function densityToWalkScore(density: number, maxDensity: number): number {
  // Higher density = more likely to have amenities within walking distance
  // Use a logarithmic scale to model diminishing returns
  if (density <= 0) return 0;
  const normalized = Math.min(density / maxDensity, 1);
  // Logarithmic scaling similar to Walk Score's decay
  return Math.min(100, Math.log1p(normalized * 10) / Math.log1p(10) * 100);
}

/**
 * Calculate intersection density for pedestrian friendliness
 * Higher intersection density = more walkable grid pattern
 */
function calculateIntersectionDensity(
  layerData: Map<string, LayerData>,
  areaKm2: number
): number {
  const roadLayers = ['roads-primary', 'roads-residential'];
  let totalRoadLength = 0;

  for (const layerId of roadLayers) {
    const data = layerData.get(layerId);
    if (data?.stats?.totalLength) {
      totalRoadLength += data.stats.totalLength;
    }
  }

  // Estimate intersections: ~1 intersection per 200m of road on average in a grid
  // More roads = more intersections
  const estimatedIntersections = totalRoadLength / 200;
  const intersectionDensity = areaKm2 > 0 ? estimatedIntersections / areaKm2 : 0;

  return intersectionDensity;
}

/**
 * Calculate walkability proxy score using Walk Score methodology
 */
function calculateWalkabilityProxy(
  layerData: Map<string, LayerData>,
  areaKm2: number
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let totalWeightedScore = 0;
  let totalWeight = 0;
  let categoriesWithData = 0;

  // Calculate score for each Walk Score category
  for (const category of WALK_SCORE_CATEGORIES) {
    let categoryCount = 0;

    for (const layerId of category.layers) {
      const data = layerData.get(layerId);
      if (data?.clippedFeatures) {
        categoryCount += data.clippedFeatures.features.length;
      }
    }

    // Convert count to density, then to score
    const density = areaKm2 > 0 ? categoryCount / areaKm2 : 0;
    // Max density varies by category (grocery stores are less dense than restaurants)
    const maxDensity = category.maxCount * 2; // e.g., 10 groceries/km² is very high
    const categoryScore = densityToWalkScore(density, maxDensity);

    breakdown[`${category.id}_count`] = categoryCount;
    breakdown[`${category.id}_score`] = categoryScore;

    totalWeightedScore += categoryScore * category.weight;
    totalWeight += category.weight;

    if (categoryCount > 0) categoriesWithData++;
  }

  // Base amenity score (max 85 points, like Walk Score)
  const amenityScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 0.85 : 0;

  // Pedestrian friendliness bonus (up to 15 points)
  // Based on intersection density (proxy for walkable grid pattern)
  const intersectionDensity = calculateIntersectionDensity(layerData, areaKm2);
  breakdown['intersection_density'] = intersectionDensity;

  // High intersection density (>100/km²) is very walkable
  // This mimics Walk Score's pedestrian friendliness adjustment
  const pedestrianBonus = Math.min(15, (intersectionDensity / 100) * 15);
  breakdown['pedestrian_bonus'] = pedestrianBonus;

  const finalScore = Math.min(100, amenityScore + pedestrianBonus);

  // Determine confidence based on data availability
  const confidence: 'high' | 'medium' | 'low' =
    categoriesWithData >= 5 ? 'high' :
    categoriesWithData >= 3 ? 'medium' : 'low';

  breakdown['amenity_component'] = amenityScore;
  breakdown['categories_with_data'] = categoriesWithData;

  return {
    value: finalScore,
    confidence,
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
  // Layer IDs must match layerManifest.ts
  const essentialCategories = [
    { id: 'food', layers: ['poi-food-drink', 'poi-grocery'] },
    { id: 'healthcare', layers: ['poi-health'] },
    { id: 'education', layers: ['poi-education'] },
    { id: 'green_space', layers: ['parks'] },
    { id: 'transit', layers: ['transit-stops', 'rail-lines'] },
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
 * Bike Score methodology:
 * - Bike infrastructure: presence and density of bike lanes, paths, trails (50% weight)
 * - Bike amenities: bike parking, bike shops, rental stations (30% weight)
 * - Road connectivity: intersection density for cycling routes (20% weight)
 *
 * Note: Real Bike Score also considers hills (topography), which we cannot measure
 * from OSM data alone. Our proxy focuses on infrastructure quality.
 *
 * Scoring:
 * - 90-100: Biker's Paradise (daily errands do not require a car)
 * - 70-89: Very Bikeable (biking is convenient for most trips)
 * - 50-69: Bikeable (some bike infrastructure)
 * - 0-49: Minimal Bike Infrastructure
 */

// Bike Score component weights
const BIKE_SCORE_WEIGHTS = {
  infrastructure: 0.50,  // Bike lanes and paths
  amenities: 0.30,       // Bike parking, shops, rentals
  connectivity: 0.20,    // Road network connectivity
};

// Benchmark densities for bike infrastructure (per km²)
const BIKE_BENCHMARKS = {
  // km of bike lanes per km² for top bike cities (Copenhagen, Amsterdam)
  excellentLaneDensity: 5.0,   // 5 km of lanes per km²
  // Bike parking spots per km² in bike-friendly cities
  excellentParkingDensity: 50,
  // Bike shops/rentals per km²
  excellentShopDensity: 2,
};

/**
 * Calculate Bike Score using infrastructure, amenities, and connectivity
 */
function calculateBikeScore(
  layerData: Map<string, LayerData>,
  areaKm2: number
): { value: number; confidence: 'high' | 'medium' | 'low'; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};

  if (areaKm2 === 0) {
    return { value: 0, confidence: 'low', breakdown };
  }

  let hasInfrastructure = false;
  let hasAmenities = false;

  // 1. Bike Infrastructure Score (50% of total)
  // Based on bike lane/path density
  const bikeLanesData = layerData.get('bike-lanes');
  const bikeLaneLength = bikeLanesData?.stats?.totalLength || 0; // in meters
  const bikeLaneDensity = (bikeLaneLength / 1000) / areaKm2; // km per km²

  breakdown['bike_lane_length_m'] = bikeLaneLength;
  breakdown['bike_lane_density'] = bikeLaneDensity;

  // Logarithmic scoring for infrastructure (similar to Walk Score decay)
  // Max score at excellentLaneDensity, diminishing returns above
  const infrastructureScore = Math.min(
    100,
    (Math.log1p(bikeLaneDensity) / Math.log1p(BIKE_BENCHMARKS.excellentLaneDensity)) * 100
  );
  breakdown['infrastructure_score'] = infrastructureScore;

  if (bikeLaneLength > 0) hasInfrastructure = true;

  // 2. Bike Amenities Score (30% of total)
  // Combine bike parking and bike shops/rentals
  const bikeParkingData = layerData.get('poi-bike-parking');
  const bikeShopsData = layerData.get('poi-bike-shops');

  const parkingCount = bikeParkingData?.clippedFeatures?.features.length || 0;
  const shopsCount = bikeShopsData?.clippedFeatures?.features.length || 0;

  const parkingDensity = parkingCount / areaKm2;
  const shopsDensity = shopsCount / areaKm2;

  breakdown['bike_parking_count'] = parkingCount;
  breakdown['bike_shops_count'] = shopsCount;
  breakdown['parking_density'] = parkingDensity;
  breakdown['shops_density'] = shopsDensity;

  // Score parking (70% of amenities) and shops (30% of amenities)
  const parkingScore = Math.min(
    100,
    (Math.log1p(parkingDensity) / Math.log1p(BIKE_BENCHMARKS.excellentParkingDensity)) * 100
  );
  const shopsScore = Math.min(
    100,
    (Math.log1p(shopsDensity) / Math.log1p(BIKE_BENCHMARKS.excellentShopDensity)) * 100
  );

  const amenitiesScore = parkingScore * 0.7 + shopsScore * 0.3;
  breakdown['parking_score'] = parkingScore;
  breakdown['shops_score'] = shopsScore;
  breakdown['amenities_score'] = amenitiesScore;

  if (parkingCount > 0 || shopsCount > 0) hasAmenities = true;

  // 3. Road Connectivity Score (20% of total)
  // Higher intersection density = more route options for cyclists
  const intersectionDensity = calculateIntersectionDensity(layerData, areaKm2);
  breakdown['intersection_density'] = intersectionDensity;

  // Connected street grids (>100 intersections/km²) are better for cycling
  // Cul-de-sac suburbs (<50/km²) force longer, less direct routes
  const connectivityScore = Math.min(100, (intersectionDensity / 100) * 100);
  breakdown['connectivity_score'] = connectivityScore;

  // Calculate weighted final score
  const finalScore =
    infrastructureScore * BIKE_SCORE_WEIGHTS.infrastructure +
    amenitiesScore * BIKE_SCORE_WEIGHTS.amenities +
    connectivityScore * BIKE_SCORE_WEIGHTS.connectivity;

  breakdown['weighted_infrastructure'] = infrastructureScore * BIKE_SCORE_WEIGHTS.infrastructure;
  breakdown['weighted_amenities'] = amenitiesScore * BIKE_SCORE_WEIGHTS.amenities;
  breakdown['weighted_connectivity'] = connectivityScore * BIKE_SCORE_WEIGHTS.connectivity;

  // Determine confidence
  // High if we have infrastructure data and amenity data
  // Medium if we have only one type
  // Low if we have neither
  const confidence: 'high' | 'medium' | 'low' =
    hasInfrastructure && hasAmenities ? 'high' :
    hasInfrastructure || hasAmenities ? 'medium' : 'low';

  return {
    value: Math.min(100, finalScore),
    confidence,
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

  // Bike Score
  const bikeScore = calculateBikeScore(layerData, areaKm2);
  metrics.push({
    metricId: 'bike_score',
    value: bikeScore.value,
    confidence: bikeScore.confidence,
    breakdown: bikeScore.breakdown,
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
  // Thresholds based on metric type (must match interpretation text in definitions)
  const thresholds: Record<DerivedMetricType, { low: number; high: number }> = {
    diversity_index: { low: 30, high: 60 },      // Normalized 0-100 scale
    green_ratio: { low: 10, high: 20 },          // < 10% low, 10-20% medium, > 20% high
    street_connectivity: { low: 50, high: 100 }, // < 50 low, 50-100 medium, > 100 high
    building_density: { low: 20, high: 40 },     // < 20% low, 20-40% medium, > 40% high
    transit_coverage: { low: 25, high: 50 },     // < 25 low, 25-50 medium, > 50 high
    mixed_use_score: { low: 30, high: 60 },      // < 30 low, 30-60 medium, > 60 high
    walkability_proxy: { low: 50, high: 70 },    // < 50 low, 50-70 medium, > 70 high
    bike_score: { low: 50, high: 70 },           // < 50 low, 50-70 medium, > 70 high
    fifteen_min_score: { low: 50, high: 80 },    // < 50% low, 50-80% medium, > 80% high
  };

  const t = thresholds[metricId];
  if (!t) return 'medium';

  if (value < t.low) return 'low';
  if (value >= t.high) return 'high';
  return 'medium';
}

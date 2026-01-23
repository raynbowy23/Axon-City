/**
 * Metric Definitions with Methodology
 * Provides transparency and academic credibility for all metrics
 */

export interface InterpretationRange {
  min: number;
  max: number;
  label: string;
  description: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  shortName: string;
  formula: string;
  formulaLatex?: string;
  description: string;
  interpretation: InterpretationRange[];
  citation?: {
    author: string;
    year: number;
    title: string;
    source?: string;
  };
  unit: string;
  higherMeans: string;
}

export const metricDefinitions: Record<string, MetricDefinition> = {
  poiCount: {
    id: 'poiCount',
    name: 'POI Count',
    shortName: 'Count',
    formula: 'n',
    description: 'Total number of points of interest within the selected area.',
    interpretation: [
      { min: 0, max: 10, label: 'Very Low', description: 'Minimal amenities present' },
      { min: 10, max: 50, label: 'Low', description: 'Limited amenities' },
      { min: 50, max: 150, label: 'Moderate', description: 'Typical suburban density' },
      { min: 150, max: 500, label: 'High', description: 'Urban-level amenities' },
      { min: 500, max: Infinity, label: 'Very High', description: 'Dense urban core' },
    ],
    unit: 'count',
    higherMeans: 'More amenities available in the area',
  },

  poiDensity: {
    id: 'poiDensity',
    name: 'POI Density',
    shortName: 'Density',
    formula: 'count / area (km²)',
    description: 'Number of points of interest per square kilometer. Normalizes for area size, enabling fair comparison between different-sized areas.',
    interpretation: [
      { min: 0, max: 25, label: 'Very Low', description: 'Rural or industrial area' },
      { min: 25, max: 75, label: 'Low', description: 'Low-density suburban' },
      { min: 75, max: 200, label: 'Moderate', description: 'Suburban or mixed-use' },
      { min: 200, max: 500, label: 'High', description: 'Urban neighborhood' },
      { min: 500, max: Infinity, label: 'Very High', description: 'Dense urban core or commercial district' },
    ],
    unit: 'per km²',
    higherMeans: 'More concentrated amenities; typically indicates higher walkability',
  },

  diversityIndex: {
    id: 'diversityIndex',
    name: 'Diversity Index (Shannon)',
    shortName: 'Diversity',
    formula: 'H = -Σ(pᵢ × ln(pᵢ))',
    formulaLatex: 'H = -\\sum_{i=1}^{n} p_i \\ln(p_i)',
    description: 'Shannon Diversity Index measures how evenly POIs are distributed across categories. A higher value indicates a more balanced mix of amenity types, while a lower value suggests dominance by one or two categories.',
    interpretation: [
      { min: 0, max: 0.5, label: 'Very Low', description: 'Dominated by 1-2 categories; monofunctional area' },
      { min: 0.5, max: 1.0, label: 'Low', description: 'Limited variety; few category types' },
      { min: 1.0, max: 1.5, label: 'Moderate', description: 'Some variety; typical residential area' },
      { min: 1.5, max: 2.0, label: 'High', description: 'Good mix; mixed-use neighborhood' },
      { min: 2.0, max: Infinity, label: 'Very High', description: 'Exceptional diversity; vibrant urban area' },
    ],
    citation: {
      author: 'Shannon, C.E.',
      year: 1948,
      title: 'A Mathematical Theory of Communication',
      source: 'Bell System Technical Journal, 27(3), 379-423',
    },
    unit: 'index',
    higherMeans: 'More balanced mix of amenity types; typically indicates mixed-use character',
  },

  categoryShare: {
    id: 'categoryShare',
    name: 'Category Share',
    shortName: 'Share',
    formula: '(category count / total count) × 100',
    description: 'Percentage of total POIs belonging to a specific category.',
    interpretation: [
      { min: 0, max: 5, label: 'Minimal', description: 'Category barely present' },
      { min: 5, max: 15, label: 'Minor', description: 'Secondary presence' },
      { min: 15, max: 30, label: 'Notable', description: 'Significant presence' },
      { min: 30, max: 50, label: 'Major', description: 'Dominant category' },
      { min: 50, max: 100, label: 'Dominant', description: 'Area defined by this category' },
    ],
    unit: '%',
    higherMeans: 'Category is more prevalent in the area\'s amenity mix',
  },

  coverageScore: {
    id: 'coverageScore',
    name: 'Data Coverage Score',
    shortName: 'Coverage',
    formula: '(categories with data / total categories) × 100',
    description: 'Indicates the completeness of OpenStreetMap data for this area. A lower score may indicate data gaps rather than actual absence of amenities.',
    interpretation: [
      { min: 0, max: 50, label: 'Limited', description: 'Significant data gaps likely; interpret with caution' },
      { min: 50, max: 70, label: 'Partial', description: 'Some categories may be undermapped' },
      { min: 70, max: 90, label: 'Good', description: 'Most categories represented' },
      { min: 90, max: 100, label: 'Excellent', description: 'Comprehensive coverage' },
    ],
    unit: '%',
    higherMeans: 'More complete data; higher confidence in results',
  },

  areaSize: {
    id: 'areaSize',
    name: 'Area Size',
    shortName: 'Area',
    formula: 'Geodesic area calculation',
    description: 'Total area of the selected polygon in square kilometers.',
    interpretation: [
      { min: 0, max: 0.1, label: 'Very Small', description: 'Block-level analysis' },
      { min: 0.1, max: 0.5, label: 'Small', description: 'Neighborhood pocket' },
      { min: 0.5, max: 2, label: 'Medium', description: 'Typical neighborhood' },
      { min: 2, max: 10, label: 'Large', description: 'District-level' },
      { min: 10, max: Infinity, label: 'Very Large', description: 'City-scale analysis' },
    ],
    unit: 'km²',
    higherMeans: 'Larger analysis area',
  },
};

/**
 * Get interpretation for a metric value
 */
export function getInterpretation(
  metricId: string,
  value: number
): InterpretationRange | null {
  const definition = metricDefinitions[metricId];
  if (!definition) return null;

  for (const range of definition.interpretation) {
    if (value >= range.min && value < range.max) {
      return range;
    }
  }

  // Return last range if value exceeds all ranges
  return definition.interpretation[definition.interpretation.length - 1] || null;
}

/**
 * Generate interpretation text for a metric value
 */
export function interpretMetricValue(
  metricId: string,
  value: number
): string {
  const definition = metricDefinitions[metricId];
  if (!definition) return '';

  const range = getInterpretation(metricId, value);
  if (!range) return '';

  return `${range.label}: ${range.description}`;
}

/**
 * Get citation text for a metric
 */
export function getCitationText(metricId: string): string | null {
  const definition = metricDefinitions[metricId];
  if (!definition?.citation) return null;

  const { author, year, title, source } = definition.citation;
  let text = `${author} (${year}). "${title}"`;
  if (source) {
    text += `. ${source}`;
  }
  return text;
}

/**
 * Data source information
 */
export const dataSourceInfo = {
  name: 'OpenStreetMap',
  description: 'Collaborative mapping project with global coverage',
  license: 'Open Database License (ODbL)',
  attribution: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org',
  caveats: [
    'Coverage varies by region; urban areas typically have better data',
    'Data is contributed by volunteers; completeness is not guaranteed',
    'Some categories may be systematically undermapped',
    'Data reflects mapping activity, not necessarily ground truth',
  ],
};

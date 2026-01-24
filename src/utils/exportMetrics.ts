/**
 * Metrics Export Utility
 * Export POI metrics to CSV format
 */

import type { POIMetrics } from './metricsCalculator';
import { dataSourceInfo } from '../data/metricDefinitions';

interface ExportArea {
  name: string;
  metrics: POIMetrics;
}

/**
 * Generate CSV content from metrics
 */
export function generateMetricsCSV(areas: ExportArea[]): string {
  const lines: string[] = [];

  // Header comment with metadata
  lines.push('# AxonCity POI Metrics Export');
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Data Source: ${dataSourceInfo.name} (${dataSourceInfo.attribution})`);
  lines.push('# ');

  if (areas.length === 1) {
    // Single area format
    const { name, metrics } = areas[0];

    lines.push('# Summary Metrics');
    lines.push('Metric,Value,Unit');
    lines.push(`Area Name,"${name}",`);
    lines.push(`Area Size,${metrics.areaKm2.toFixed(4)},km²`);
    lines.push(`Total POIs,${metrics.totalCount},count`);
    lines.push(`POI Density,${metrics.density.toFixed(2)},per km²`);
    lines.push(`Diversity Index,${metrics.diversityIndex.toFixed(4)},Shannon index`);
    lines.push(`Diversity Level,"${metrics.diversityLabel}",`);
    lines.push(`Data Coverage,${metrics.coverageScore.toFixed(1)},%`);
    lines.push(`Coverage Level,"${metrics.coverageLabel}",`);
    lines.push(`Query Timestamp,"${metrics.timestamp}",ISO 8601`);
    lines.push('');

    lines.push('# Category Breakdown');
    lines.push('Category,Count,Density (per km²),Share (%)');
    for (const cat of metrics.categoryBreakdown) {
      lines.push(`"${cat.name}",${cat.count},${cat.density.toFixed(2)},${cat.share.toFixed(2)}`);
    }
  } else {
    // Multi-area comparison format
    lines.push('# Summary Metrics');
    const areaNames = areas.map((a) => `"${a.name}"`).join(',');
    lines.push(`Metric,${areaNames}`);

    lines.push(`Area Size (km²),${areas.map((a) => a.metrics.areaKm2.toFixed(4)).join(',')}`);
    lines.push(`Total POIs,${areas.map((a) => a.metrics.totalCount).join(',')}`);
    lines.push(`POI Density (per km²),${areas.map((a) => a.metrics.density.toFixed(2)).join(',')}`);
    lines.push(`Diversity Index,${areas.map((a) => a.metrics.diversityIndex.toFixed(4)).join(',')}`);
    lines.push(`Diversity Level,${areas.map((a) => `"${a.metrics.diversityLabel}"`).join(',')}`);
    lines.push(`Data Coverage (%),${areas.map((a) => a.metrics.coverageScore.toFixed(1)).join(',')}`);
    lines.push('');

    lines.push('# Category Breakdown by Area');
    lines.push(`Category,${areas.flatMap((a) => [`"${a.name} Count"`, `"${a.name} Density"`, `"${a.name} Share"`]).join(',')}`);

    // Get all categories from first area
    const categories = areas[0].metrics.categoryBreakdown;
    for (const cat of categories) {
      const values = areas.flatMap((a) => {
        const areaCat = a.metrics.categoryBreakdown.find((c) => c.id === cat.id);
        return [
          areaCat?.count || 0,
          (areaCat?.density || 0).toFixed(2),
          (areaCat?.share || 0).toFixed(2),
        ];
      });
      lines.push(`"${cat.name}",${values.join(',')}`);
    }
  }

  lines.push('');
  lines.push('# Methodology Notes');
  lines.push('# POI Density = Total POI Count / Area (km²)');
  lines.push('# Diversity Index = Shannon Entropy: H = -Σ(pᵢ × ln(pᵢ))');
  lines.push('# Category Share = (Category Count / Total Count) × 100%');
  lines.push('# Data Coverage = (Categories with data / Total categories) × 100%');

  return lines.join('\n');
}

/**
 * Trigger CSV download
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Export metrics for areas
 */
export function exportMetrics(areas: ExportArea[]): void {
  const csv = generateMetricsCSV(areas);
  const timestamp = new Date().toISOString().split('T')[0];
  const areaCount = areas.length;
  const filename = areaCount === 1
    ? `axoncity-metrics-${areas[0].name.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.csv`
    : `axoncity-metrics-comparison-${areaCount}areas-${timestamp}.csv`;

  downloadCSV(csv, filename);
}

/**
 * Generate methodology documentation
 */
export function generateMethodologyDoc(): string {
  return `# AxonCity Metrics Methodology

## Data Source
- **Provider:** ${dataSourceInfo.name}
- **License:** ${dataSourceInfo.license}
- **Attribution:** ${dataSourceInfo.attribution}

## Metrics Definitions

### POI Count
Total number of points of interest within the selected area.
- **Unit:** count
- **Formula:** n

### POI Density
Number of POIs per square kilometer.
- **Unit:** per km²
- **Formula:** count / area (km²)
- **Purpose:** Normalizes for area size, enabling fair comparison between different-sized areas.

### Diversity Index (Shannon)
Measures how evenly POIs are distributed across categories.
- **Unit:** index (dimensionless)
- **Formula:** H = -Σ(pᵢ × ln(pᵢ))
- **Range:** 0 to ~2.5+
- **Interpretation:**
  - 0: Single category only
  - 0-0.5: Very Low diversity
  - 0.5-1.0: Low diversity
  - 1.0-1.5: Moderate diversity
  - 1.5-2.0: High diversity
  - 2.0+: Very High diversity
- **Reference:** Shannon, C.E. (1948). "A Mathematical Theory of Communication". Bell System Technical Journal, 27(3), 379-423.

### Category Share
Percentage of total POIs belonging to a specific category.
- **Unit:** %
- **Formula:** (category count / total count) × 100

### Data Coverage Score
Indicates completeness of data across POI categories.
- **Unit:** %
- **Formula:** (categories with data / total categories) × 100
- **Note:** A lower score may indicate data gaps in OpenStreetMap rather than actual absence of amenities.

## POI Categories
1. Food & Dining (restaurants, cafes, bars, fast food)
2. Retail & Shopping (all shops)
3. Grocery & Convenience (supermarkets, grocery stores)
4. Healthcare (hospitals, clinics, pharmacies)
5. Education (schools, universities, colleges)
6. Cycling Infrastructure (bike parking, bike shops, bike lanes)
7. Public Transit (bus stops, rail stations)
8. Green Space (parks, trees)

## Data Limitations
${dataSourceInfo.caveats.map((c) => `- ${c}`).join('\n')}

## Reproducibility
This analysis can be reproduced using:
1. OpenStreetMap data via Overpass API
2. The same geographic boundaries
3. The methodology described above

Generated by AxonCity - https://axoncity.app
`;
}

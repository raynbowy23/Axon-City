/**
 * Insights Generator
 * Auto-generates observations from comparison metrics
 */

import type { ComparisonArea, Insight } from '../types';
import { calculatePOIMetrics } from './metricsCalculator';

interface AreaMetrics {
  areaId: string;
  areaName: string;
  areaKm2: number;
  metrics: ReturnType<typeof calculatePOIMetrics>;
}

/**
 * Generate insights from comparison data
 */
export function generateInsights(areas: ComparisonArea[]): Insight[] {
  if (areas.length === 0) return [];

  const insights: Insight[] = [];

  // Calculate metrics for each area
  const areasWithMetrics: AreaMetrics[] = areas.map((area) => {
    const areaM2 = area.polygon.area;
    const areaKm2 = areaM2 / 1_000_000;
    const metrics = calculatePOIMetrics(area.layerData, areaKm2);

    return {
      areaId: area.id,
      areaName: area.name,
      areaKm2,
      metrics,
    };
  });

  // Single area insights
  if (areasWithMetrics.length === 1) {
    const area = areasWithMetrics[0];

    // Density insight
    if (area.metrics.density >= 200) {
      insights.push({
        title: 'High Amenity Density',
        description: `${area.areaName} has ${Math.round(area.metrics.density)} POIs per km², suggesting a service-rich environment.`,
        confidence: 'high',
        relatedMetrics: ['density'],
        type: 'positive',
      });
    } else if (area.metrics.density < 50) {
      insights.push({
        title: 'Low Amenity Density',
        description: `${area.areaName} has limited amenities (${Math.round(area.metrics.density)} per km²). This may indicate a more residential or rural character.`,
        confidence: 'high',
        relatedMetrics: ['density'],
        type: 'caution',
      });
    }

    // Diversity insight
    if (area.metrics.diversityIndex >= 1.5) {
      insights.push({
        title: 'Diverse Amenity Mix',
        description: 'Good variety of amenity types, indicating a mixed-use character.',
        confidence: 'medium',
        relatedMetrics: ['diversityIndex'],
        type: 'positive',
      });
    }

    return insights;
  }

  // Two-area comparison insights
  if (areasWithMetrics.length === 2) {
    const [a, b] = areasWithMetrics;

    // POI Density comparison
    const densityDiff = b.metrics.density > 0
      ? ((a.metrics.density - b.metrics.density) / b.metrics.density) * 100
      : 0;

    if (Math.abs(densityDiff) > 50) {
      const higher = densityDiff > 0 ? a : b;
      const lower = densityDiff > 0 ? b : a;

      insights.push({
        title: 'Significant Density Difference',
        description: `${higher.areaName} has ${Math.abs(Math.round(densityDiff))}% higher POI density than ${lower.areaName}, suggesting a more service-rich environment.`,
        confidence: 'high',
        relatedMetrics: ['poiDensity'],
        type: 'neutral',
      });
    }

    // Coverage comparison
    const coverageDiff = a.metrics.coverageScore - b.metrics.coverageScore;

    if (Math.abs(coverageDiff) > 20) {
      const betterCoverage = coverageDiff > 0 ? a : b;
      const worseCoverage = coverageDiff > 0 ? b : a;

      insights.push({
        title: 'Data Coverage Difference',
        description: `${betterCoverage.areaName} has better data coverage than ${worseCoverage.areaName}. Results for ${worseCoverage.areaName} may be less complete.`,
        confidence: 'medium',
        relatedMetrics: ['coverage'],
        type: 'caution',
      });
    }

    // Diversity comparison
    const divDiff = a.metrics.diversityIndex - b.metrics.diversityIndex;

    if (Math.abs(divDiff) > 0.3) {
      const moreDiverse = divDiff > 0 ? a : b;
      const lessDiverse = divDiff > 0 ? b : a;

      insights.push({
        title: 'Amenity Diversity',
        description: `${moreDiverse.areaName} has a more diverse mix of amenity types compared to ${lessDiverse.areaName}.`,
        confidence: 'medium',
        relatedMetrics: ['diversityIndex'],
        type: 'neutral',
      });
    }

    // Area size caveat
    const sizeDiff = ((a.areaKm2 - b.areaKm2) / b.areaKm2) * 100;

    if (Math.abs(sizeDiff) > 100) {
      insights.push({
        title: 'Different Scale',
        description: `The areas differ significantly in size (${Math.abs(Math.round(sizeDiff))}%). Per km² metrics provide fairer comparison.`,
        confidence: 'high',
        relatedMetrics: ['areaSize'],
        type: 'caution',
      });
    }

    // Category-specific insights
    const getCategoryCount = (metrics: AreaMetrics['metrics'], categoryId: string): number => {
      const category = metrics.categoryBreakdown.find((c) => c.id === categoryId);
      return category?.count || 0;
    };

    const foodCountA = getCategoryCount(a.metrics, 'food');
    const foodCountB = getCategoryCount(b.metrics, 'food');

    if (foodCountA > 0 && foodCountB > 0) {
      const foodDensityA = foodCountA / a.areaKm2;
      const foodDensityB = foodCountB / b.areaKm2;
      const foodDiff = foodDensityB > 0 ? ((foodDensityA - foodDensityB) / foodDensityB) * 100 : 0;

      if (Math.abs(foodDiff) > 75) {
        const more = foodDiff > 0 ? a : b;
        insights.push({
          title: 'Dining Options',
          description: `${more.areaName} has significantly more food & dining options per km².`,
          confidence: 'medium',
          relatedMetrics: ['food'],
          type: 'neutral',
        });
      }
    }
  }

  // Limit to top 4 insights
  return insights.slice(0, 4);
}

/**
 * Get confidence level explanation
 */
export function getConfidenceExplanation(confidence: 'high' | 'medium' | 'low'): string {
  switch (confidence) {
    case 'high':
      return 'Based on clear quantitative differences';
    case 'medium':
      return 'Interpretation may depend on context';
    case 'low':
      return 'Limited data; interpret with caution';
  }
}

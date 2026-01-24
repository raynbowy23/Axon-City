/**
 * Data Quality Indicator Component
 * Shows data coverage score and warnings
 */

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { dataSourceInfo } from '../data/metricDefinitions';
import type { ComparisonArea, DataQuality, QualityWarning, LayerData } from '../types';

// Expected minimum counts per category for reasonable coverage
// Uses the same categories as metricsCalculator for consistency
const EXPECTED_MINIMUMS: Record<string, { layerIds: string[]; min: number; name: string }> = {
  food: { layerIds: ['poi-food-drink'], min: 3, name: 'Food & Drink' },
  shopping: { layerIds: ['poi-shopping'], min: 2, name: 'Shopping' },
  grocery: { layerIds: ['poi-grocery'], min: 1, name: 'Grocery' },
  health: { layerIds: ['poi-health'], min: 1, name: 'Healthcare' },
  education: { layerIds: ['poi-education'], min: 1, name: 'Education' },
  buildings: {
    layerIds: ['buildings-residential', 'buildings-commercial', 'buildings-industrial', 'buildings-other'],
    min: 5,
    name: 'Buildings',
  },
  parks: { layerIds: ['parks'], min: 1, name: 'Parks & Green' },
  transit: { layerIds: ['transit-stops'], min: 1, name: 'Transit' },
};

/**
 * Get feature count from layer data, preferring clipped features for areas
 */
function getFeatureCount(layerData: Map<string, LayerData>, layerIds: string[]): number {
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

interface DataQualityIndicatorProps {
  areaId?: string;
  compact?: boolean;
}

export function DataQualityIndicator({ areaId, compact = false }: DataQualityIndicatorProps) {
  const { areas, activeLayers } = useStore();

  // Calculate data quality for specified area or all areas
  const quality = useMemo((): DataQuality | null => {
    const targetAreas = areaId
      ? areas.filter((a: ComparisonArea) => a.id === areaId)
      : areas;

    if (targetAreas.length === 0) return null;

    const categoryScores: { category: string; score: number; count: number; expectedMin: number }[] = [];
    const warnings: QualityWarning[] = [];

    // Calculate coverage for each category
    Object.entries(EXPECTED_MINIMUMS).forEach(([categoryId, config]) => {
      // Check if any of the category's layers are active
      const hasActiveLayer = config.layerIds.some((lid) => activeLayers.includes(lid));

      let totalCount = 0;

      targetAreas.forEach((area: ComparisonArea) => {
        totalCount += getFeatureCount(area.layerData, config.layerIds);
      });

      const avgCount = totalCount / targetAreas.length;
      const score = Math.min(100, (avgCount / config.min) * 100);

      categoryScores.push({
        category: categoryId,
        score,
        count: Math.round(avgCount),
        expectedMin: config.min,
      });

      // Generate warnings - only for active layers with missing data
      if (hasActiveLayer && avgCount === 0) {
        warnings.push({
          type: 'missing_category',
          message: `${config.name} data not found in selected area`,
          severity: 'warning',
        });
      } else if (hasActiveLayer && avgCount < config.min * 0.5) {
        warnings.push({
          type: 'low_count',
          message: `${config.name} count is lower than typical`,
          severity: 'info',
        });
      }
    });

    // Calculate overall score based on categories that actually have data
    // This gives a meaningful "data completeness" score for the selected area
    const categoriesWithData = categoryScores.filter((c) => c.count > 0);

    // Calculate score as: weighted average of present categories
    // If no data at all, score is 0
    const overallScore =
      categoriesWithData.length > 0
        ? categoriesWithData.reduce((sum, c) => sum + c.score, 0) / categoriesWithData.length
        : 0;

    return {
      overallScore,
      categoryScores,
      warnings,
      lastUpdated: new Date(),
    };
  }, [areas, areaId, activeLayers]);

  if (!quality) return null;

  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#22c55e'; // Green
    if (score >= 70) return '#3b82f6'; // Blue
    if (score >= 50) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Partial';
    return 'Limited';
  };

  const categoriesWithData = quality.categoryScores.filter((c) => c.count > 0).length;
  const totalCategories = Object.keys(EXPECTED_MINIMUMS).length;

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: '4px',
          fontSize: '11px',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: getScoreColor(quality.overallScore),
          }}
        />
        <span style={{ color: 'rgba(255,255,255,0.7)' }}>
          {categoriesWithData}/{totalCategories} data types
        </span>
        {quality.warnings.length > 0 && (
          <span
            style={{ color: '#eab308', cursor: 'help' }}
            title={quality.warnings.map((w) => w.message).join('\n')}
          >
            ⚠
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '12px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Data Quality</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: getScoreColor(quality.overallScore),
            }}
          />
          <span style={{ color: getScoreColor(quality.overallScore), fontWeight: 500 }}>
            {getScoreLabel(quality.overallScore)} ({Math.round(quality.overallScore)}%)
          </span>
        </div>
      </div>

      {/* Source info */}
      <div
        style={{
          padding: '8px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
          marginBottom: '10px',
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', marginBottom: '4px' }}>
          Source
        </div>
        <div style={{ color: 'rgba(255,255,255,0.9)' }}>{dataSourceInfo.name}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', marginTop: '2px' }}>
          {dataSourceInfo.attribution}
        </div>
      </div>

      {/* Category scores */}
      <div style={{ marginBottom: '10px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '10px',
              textTransform: 'uppercase',
            }}
          >
            Data by Category
          </span>
          <span
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: '10px',
            }}
          >
            {categoriesWithData} of {totalCategories} types
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {quality.categoryScores
            .filter((cat) => cat.count > 0)
            .slice(0, 6)
            .map((cat) => (
            <div
              key={cat.category}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div style={{ flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
                {EXPECTED_MINIMUMS[cat.category]?.name || cat.category}
              </div>
              <div
                style={{
                  width: '60px',
                  height: '4px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, cat.score)}%`,
                    height: '100%',
                    backgroundColor: getScoreColor(cat.score),
                    borderRadius: '2px',
                  }}
                />
              </div>
              <div
                style={{
                  width: '30px',
                  textAlign: 'right',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '10px',
                }}
              >
                {cat.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {quality.warnings.length > 0 && (
        <div
          style={{
            padding: '8px',
            backgroundColor: 'rgba(234,179,8,0.1)',
            borderRadius: '4px',
            border: '1px solid rgba(234,179,8,0.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
              color: '#eab308',
              fontSize: '11px',
              fontWeight: 500,
            }}
          >
            <span>⚠</span>
            Notes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {quality.warnings.slice(0, 3).map((warning, i) => (
              <div
                key={i}
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '10px',
                }}
              >
                • {warning.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

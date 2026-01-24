/**
 * Data Quality Indicator Component
 * Shows data coverage score and warnings
 */

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { dataSourceInfo } from '../data/metricDefinitions';
import type { ComparisonArea, DataQuality, QualityWarning } from '../types';

// Expected minimum counts per category for a reasonable coverage
const EXPECTED_MINIMUMS: Record<string, number> = {
  'poi-food-drink': 5,
  'poi-shopping': 3,
  'poi-grocery': 2,
  'poi-health': 1,
  'poi-education': 1,
  buildings: 10,
  parks: 1,
};

// Category display names
const CATEGORY_NAMES: Record<string, string> = {
  'poi-food-drink': 'Food & Drink',
  'poi-shopping': 'Shopping',
  'poi-grocery': 'Grocery',
  'poi-health': 'Healthcare',
  'poi-education': 'Education',
  buildings: 'Buildings',
  parks: 'Parks',
};

interface DataQualityIndicatorProps {
  areaId?: string;
  compact?: boolean;
}

export function DataQualityIndicator({ areaId, compact = false }: DataQualityIndicatorProps) {
  const { areas } = useStore();

  // Calculate data quality for specified area or all areas
  const quality = useMemo((): DataQuality | null => {
    const targetAreas = areaId
      ? areas.filter((a: ComparisonArea) => a.id === areaId)
      : areas;

    if (targetAreas.length === 0) return null;

    const categoryScores: { category: string; score: number; count: number; expectedMin: number }[] = [];
    const warnings: QualityWarning[] = [];

    // Calculate coverage for each category
    Object.entries(EXPECTED_MINIMUMS).forEach(([layerId, expectedMin]) => {
      let totalCount = 0;

      targetAreas.forEach((area: ComparisonArea) => {
        const layerData = area.layerData.get(layerId);
        if (layerData) {
          totalCount += layerData.features.features.length;
        }
      });

      const avgCount = totalCount / targetAreas.length;
      const score = Math.min(100, (avgCount / expectedMin) * 100);

      categoryScores.push({
        category: layerId,
        score,
        count: Math.round(avgCount),
        expectedMin,
      });

      // Generate warnings
      if (avgCount === 0) {
        warnings.push({
          type: 'missing_category',
          message: `${CATEGORY_NAMES[layerId] || layerId} data not found - may be a data gap`,
          severity: 'warning',
        });
      } else if (avgCount < expectedMin * 0.5) {
        warnings.push({
          type: 'low_count',
          message: `${CATEGORY_NAMES[layerId] || layerId} count is lower than typical`,
          severity: 'info',
        });
      }
    });

    // Calculate overall score
    const overallScore =
      categoryScores.length > 0
        ? categoryScores.reduce((sum, c) => sum + c.score, 0) / categoryScores.length
        : 0;

    return {
      overallScore,
      categoryScores,
      warnings,
      lastUpdated: new Date(),
    };
  }, [areas, areaId]);

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
          Data: {getScoreLabel(quality.overallScore)}
        </span>
        {quality.warnings.length > 0 && (
          <span
            style={{ color: '#eab308', cursor: 'help' }}
            title={quality.warnings.map((w) => w.message).join('\n')}
          >
            ({quality.warnings.length} note{quality.warnings.length > 1 ? 's' : ''})
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
            color: 'rgba(255,255,255,0.5)',
            fontSize: '10px',
            marginBottom: '6px',
            textTransform: 'uppercase',
          }}
        >
          Coverage by Category
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {quality.categoryScores.slice(0, 5).map((cat) => (
            <div
              key={cat.category}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div style={{ flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
                {CATEGORY_NAMES[cat.category] || cat.category}
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

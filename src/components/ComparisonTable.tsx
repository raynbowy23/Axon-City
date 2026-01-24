/**
 * Comparison Table Component
 * Side-by-side metrics view with delta indicators
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { calculatePOIMetrics } from '../utils/metricsCalculator';
import {
  getDeltaIndicator,
  getDeltaColor,
  formatMetricValue,
  calculateDelta,
} from '../data/metricDefinitions';
import type { ComparisonArea, NormalizationMode } from '../types';

interface ComparisonTableProps {
  onExport?: () => void;
}

interface MetricRow {
  id: string;
  name: string;
  values: (number | null)[];
  unit: string;
  delta: number | null;
  tooltip?: string;
}

interface AreaMetrics {
  areaId: string;
  areaName: string;
  color: [number, number, number, number];
  areaKm2: number;
  metrics: ReturnType<typeof calculatePOIMetrics>;
}

export function ComparisonTable({ onExport }: ComparisonTableProps) {
  const { areas } = useStore();
  const [normalization, setNormalization] = useState<NormalizationMode>('per_km2');

  // Calculate metrics for each area
  const metricsData = useMemo((): AreaMetrics[] => {
    return areas.map((area: ComparisonArea): AreaMetrics => {
      const areaM2 = area.polygon.area;
      const areaKm2 = areaM2 / 1_000_000;
      const metrics = calculatePOIMetrics(area.layerData, areaKm2);

      return {
        areaId: area.id,
        areaName: area.name,
        color: area.color,
        areaKm2,
        metrics,
      };
    });
  }, [areas]);

  // Build comparison rows
  const rows = useMemo((): MetricRow[] => {
    if (metricsData.length === 0) return [];

    // Helper to get category count from breakdown
    const getCategoryCount = (metrics: ReturnType<typeof calculatePOIMetrics>, categoryId: string): number => {
      const category = metrics.categoryBreakdown.find((c) => c.id === categoryId);
      return category?.count || 0;
    };

    const baseRows: MetricRow[] = [
      {
        id: 'areaSize',
        name: 'Area',
        values: metricsData.map((d: AreaMetrics) => d.areaKm2),
        unit: 'km²',
        delta: null,
      },
      {
        id: 'poiCount',
        name: 'Total POIs',
        values: metricsData.map((d: AreaMetrics) => d.metrics.totalCount),
        unit: '',
        delta: null,
      },
      {
        id: 'poiDensity',
        name: 'POI Density',
        values: metricsData.map((d: AreaMetrics) =>
          normalization === 'raw' ? d.metrics.totalCount : d.metrics.density
        ),
        unit: normalization === 'raw' ? '' : '/km²',
        delta: null,
      },
      {
        id: 'diversityIndex',
        name: 'Diversity Index',
        values: metricsData.map((d: AreaMetrics) => d.metrics.diversityIndex),
        unit: 'index',
        delta: null,
        tooltip: 'Shannon Diversity Index: measures evenness of POI distribution across categories',
      },
      {
        id: 'coverage',
        name: 'Data Coverage',
        values: metricsData.map((d: AreaMetrics) => d.metrics.coverageScore),
        unit: '%',
        delta: null,
        tooltip: 'Percentage of expected POI categories present in the data',
      },
    ];

    // Add category-specific rows
    const categoryRows: MetricRow[] = [
      {
        id: 'food',
        name: 'Food & Dining',
        values: metricsData.map((d: AreaMetrics) => {
          const count = getCategoryCount(d.metrics, 'food');
          return normalization === 'raw' ? count : count / d.areaKm2;
        }),
        unit: normalization === 'raw' ? '' : '/km²',
        delta: null,
      },
      {
        id: 'shopping',
        name: 'Shopping',
        values: metricsData.map((d: AreaMetrics) => {
          const count = getCategoryCount(d.metrics, 'shopping');
          return normalization === 'raw' ? count : count / d.areaKm2;
        }),
        unit: normalization === 'raw' ? '' : '/km²',
        delta: null,
      },
      {
        id: 'health',
        name: 'Healthcare',
        values: metricsData.map((d: AreaMetrics) => {
          const count = getCategoryCount(d.metrics, 'health');
          return normalization === 'raw' ? count : count / d.areaKm2;
        }),
        unit: normalization === 'raw' ? '' : '/km²',
        delta: null,
      },
      {
        id: 'education',
        name: 'Education',
        values: metricsData.map((d: AreaMetrics) => {
          const count = getCategoryCount(d.metrics, 'education');
          return normalization === 'raw' ? count : count / d.areaKm2;
        }),
        unit: normalization === 'raw' ? '' : '/km²',
        delta: null,
      },
    ];

    // Calculate deltas if we have 2 areas
    const allRows = [...baseRows, ...categoryRows];

    if (metricsData.length === 2) {
      allRows.forEach((row) => {
        row.delta = calculateDelta(row.values[0], row.values[1]);
      });
    }

    return allRows;
  }, [metricsData, normalization]);

  if (areas.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
        Select areas to compare
      </div>
    );
  }

  return (
    <div style={{ fontSize: '13px' }}>
      {/* Header with normalization toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setNormalization('raw')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor:
                normalization === 'raw' ? 'rgba(74,144,217,0.3)' : 'rgba(255,255,255,0.1)',
              color: normalization === 'raw' ? '#4A90D9' : 'rgba(255,255,255,0.7)',
            }}
          >
            Raw
          </button>
          <button
            onClick={() => setNormalization('per_km2')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor:
                normalization === 'per_km2' ? 'rgba(74,144,217,0.3)' : 'rgba(255,255,255,0.1)',
              color: normalization === 'per_km2' ? '#4A90D9' : 'rgba(255,255,255,0.7)',
            }}
          >
            Per km²
          </button>
        </div>

        {onExport && (
          <button
            onClick={onExport}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              backgroundColor: 'transparent',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Export
          </button>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `1fr ${metricsData.map(() => '80px').join(' ')} ${
              metricsData.length === 2 ? '60px' : ''
            }`,
            gap: '8px',
            padding: '10px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Metric</div>
          {metricsData.map((d: AreaMetrics) => (
            <div
              key={d.areaId}
              style={{
                color: `rgb(${d.color[0]}, ${d.color[1]}, ${d.color[2]})`,
                fontSize: '11px',
                textAlign: 'right',
                fontWeight: 500,
              }}
            >
              {d.areaName}
            </div>
          ))}
          {metricsData.length === 2 && (
            <div
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: '11px',
                textAlign: 'right',
              }}
            >
              Δ
            </div>
          )}
        </div>

        {/* Table rows */}
        {rows.map((row, rowIndex) => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: `1fr ${metricsData.map(() => '80px').join(' ')} ${
                  metricsData.length === 2 ? '60px' : ''
                }`,
                gap: '8px',
                padding: '8px 12px',
                borderBottom:
                  rowIndex < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                backgroundColor: rowIndex % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}
            >
              {/* Metric name */}
              <div
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {row.name}
                {row.tooltip && (
                  <span
                    style={{
                      color: 'rgba(255,255,255,0.4)',
                      fontSize: '10px',
                      cursor: 'help',
                    }}
                    title={row.tooltip}
                  >
                    ?
                  </span>
                )}
              </div>

              {/* Values */}
              {row.values.map((value, i) => (
                <div
                  key={i}
                  style={{
                    textAlign: 'right',
                    color: 'rgba(255,255,255,0.9)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatMetricValue(value, row.unit)}
                  {row.unit && row.unit !== '/km²' && row.unit !== 'index' && row.unit !== '/100' && (
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginLeft: '2px' }}>
                      {row.unit}
                    </span>
                  )}
                </div>
              ))}

              {/* Delta */}
              {metricsData.length === 2 && (
                <div
                  style={{
                    textAlign: 'right',
                    color: row.delta !== null ? getDeltaColor(row.delta) : 'rgba(255,255,255,0.3)',
                    fontWeight: row.delta !== null && Math.abs(row.delta) > 10 ? 500 : 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '2px',
                  }}
                >
                  {row.delta !== null ? (
                    <>
                      {row.delta > 0 ? '+' : ''}
                      {Math.round(row.delta)}%
                      <span style={{ fontSize: '10px' }}>{getDeltaIndicator(row.delta)}</span>
                    </>
                  ) : (
                    '-'
                  )}
                </div>
              )}
            </div>
        ))}
      </div>

      {/* Delta legend */}
      {metricsData.length === 2 && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '8px',
            padding: '0 4px',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          <span>
            <span style={{ color: '#22c55e' }}>▲▲</span> &gt;50%
          </span>
          <span>
            <span style={{ color: '#4ade80' }}>▲</span> 10-50%
          </span>
          <span>
            <span style={{ color: '#f87171' }}>▼</span> -10 to -50%
          </span>
          <span>
            <span style={{ color: '#ef4444' }}>▼▼</span> &lt;-50%
          </span>
        </div>
      )}
    </div>
  );
}

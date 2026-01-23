/**
 * Metrics Panel Component
 * Displays POI metrics with methodology tooltips
 */

import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import {
  calculatePOIMetrics,
  formatMetricValue,
  formatDensity,
  formatPercentage,
  calculateDelta,
  getDeltaIndicator,
  type POIMetrics,
  type CategoryMetric,
} from '../utils/metricsCalculator';
import { metricDefinitions, getInterpretation, getCitationText } from '../data/metricDefinitions';
import { DataAttribution } from './DataAttribution';
import { calculatePolygonArea } from '../utils/geometryUtils';
import type { Polygon } from 'geojson';

interface MetricsPanelProps {
  isMobile?: boolean;
}

export function MetricsPanel({ isMobile = false }: MetricsPanelProps) {
  const { areas, layerData, selectionPolygon } = useStore();
  const [expandedCategories, setExpandedCategories] = useState(true);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Calculate metrics for each area
  const areaMetrics = useMemo(() => {
    if (areas.length === 0 && selectionPolygon) {
      // Single area mode (legacy)
      const areaKm2 = calculatePolygonArea(selectionPolygon.geometry as Polygon);
      return [{
        areaId: 'single',
        areaName: 'Selected Area',
        metrics: calculatePOIMetrics(layerData, areaKm2),
      }];
    }

    return areas.map((area) => {
      const areaKm2 = area.polygon.area / 1_000_000;
      return {
        areaId: area.id,
        areaName: area.name,
        metrics: calculatePOIMetrics(area.layerData.size > 0 ? area.layerData : layerData, areaKm2),
      };
    });
  }, [areas, layerData, selectionPolygon]);

  if (areaMetrics.length === 0 || areaMetrics[0].metrics.totalCount === 0) {
    return (
      <div
        style={{
          padding: '16px',
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '12px',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '8px' }}>No POI data available</div>
        <div style={{ fontSize: '10px' }}>
          Select an Analysis Preset to load POI layers
        </div>
      </div>
    );
  }

  const isComparison = areaMetrics.length > 1;
  const firstMetrics = areaMetrics[0].metrics;

  return (
    <div style={{ fontSize: isMobile ? '13px' : '12px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontWeight: '600', fontSize: isMobile ? '15px' : '14px' }}>
          POI Analysis
        </div>
      </div>

      {/* Summary Metrics */}
      <div style={{ marginBottom: '16px' }}>
        {isComparison ? (
          <ComparisonMetrics areaMetrics={areaMetrics} onTooltip={setActiveTooltip} />
        ) : (
          <SingleAreaMetrics metrics={firstMetrics} onTooltip={setActiveTooltip} />
        )}
      </div>

      {/* Category Breakdown */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setExpandedCategories(!expandedCategories)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: isMobile ? '13px' : '12px',
            fontWeight: '600',
            padding: '0',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          <span>{expandedCategories ? '▼' : '▶'}</span>
          <span>Category Breakdown</span>
        </button>

        {expandedCategories && (
          <CategoryBreakdown
            areaMetrics={areaMetrics}
            isComparison={isComparison}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Data Attribution */}
      <DataAttribution
        timestamp={firstMetrics.timestamp}
        coverageScore={firstMetrics.coverageScore}
        coverageLabel={firstMetrics.coverageLabel}
      />

      {/* Tooltip Overlay */}
      {activeTooltip && (
        <MetricTooltip
          metricId={activeTooltip}
          onClose={() => setActiveTooltip(null)}
        />
      )}
    </div>
  );
}

// Single area metrics display
function SingleAreaMetrics({
  metrics,
  onTooltip,
}: {
  metrics: POIMetrics;
  onTooltip: (id: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <MetricRow
        label="Total POIs"
        value={metrics.totalCount.toString()}
        metricId="poiCount"
        onTooltip={onTooltip}
      />
      <MetricRow
        label="Density"
        value={formatDensity(metrics.density)}
        subValue={getInterpretation('poiDensity', metrics.density)?.label}
        metricId="poiDensity"
        onTooltip={onTooltip}
      />
      <MetricRow
        label="Diversity Index"
        value={metrics.diversityIndex.toFixed(2)}
        subValue={metrics.diversityLabel}
        metricId="diversityIndex"
        onTooltip={onTooltip}
      />
      <MetricRow
        label="Area"
        value={metrics.areaKm2.toFixed(2) + ' km²'}
        metricId="areaSize"
        onTooltip={onTooltip}
      />
    </div>
  );
}

// Comparison metrics display
function ComparisonMetrics({
  areaMetrics,
  onTooltip,
}: {
  areaMetrics: { areaId: string; areaName: string; metrics: POIMetrics }[];
  onTooltip: (id: string | null) => void;
}) {
  const [a, b] = areaMetrics;
  if (!a || !b) return null;

  const rows = [
    {
      label: 'Total POIs',
      values: [a.metrics.totalCount, b.metrics.totalCount],
      format: (v: number) => v.toString(),
      metricId: 'poiCount',
    },
    {
      label: 'Density',
      values: [a.metrics.density, b.metrics.density],
      format: (v: number) => formatDensity(v),
      metricId: 'poiDensity',
    },
    {
      label: 'Diversity',
      values: [a.metrics.diversityIndex, b.metrics.diversityIndex],
      format: (v: number) => v.toFixed(2),
      metricId: 'diversityIndex',
    },
    {
      label: 'Area',
      values: [a.metrics.areaKm2, b.metrics.areaKm2],
      format: (v: number) => v.toFixed(2) + ' km²',
      metricId: 'areaSize',
    },
  ];

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 50px',
          gap: '8px',
          marginBottom: '8px',
          fontSize: '10px',
          color: 'rgba(255, 255, 255, 0.5)',
        }}
      >
        <div></div>
        <div style={{ textAlign: 'right' }}>{a.areaName}</div>
        <div style={{ textAlign: 'right' }}>{b.areaName}</div>
        <div style={{ textAlign: 'right' }}>Δ</div>
      </div>

      {/* Metric rows */}
      {rows.map((row) => {
        const delta = calculateDelta(row.values[0], row.values[1]);
        const indicator = getDeltaIndicator(delta);

        return (
          <div
            key={row.metricId}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 50px',
              gap: '8px',
              padding: '6px 0',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{row.label}</span>
              <button
                onClick={() => onTooltip(row.metricId)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  cursor: 'pointer',
                  fontSize: '10px',
                  padding: '0 2px',
                }}
              >
                ?
              </button>
            </div>
            <div style={{ textAlign: 'right', fontWeight: '500' }}>
              {row.format(row.values[0])}
            </div>
            <div style={{ textAlign: 'right', fontWeight: '500' }}>
              {row.format(row.values[1])}
            </div>
            <div
              style={{
                textAlign: 'right',
                fontSize: '10px',
                color: delta > 0 ? '#4CAF50' : delta < 0 ? '#F44336' : 'inherit',
              }}
            >
              {delta > 0 ? '+' : ''}{delta.toFixed(0)}% {indicator}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Single metric row
function MetricRow({
  label,
  value,
  subValue,
  metricId,
  onTooltip,
}: {
  label: string;
  value: string;
  subValue?: string;
  metricId: string;
  onTooltip: (id: string | null) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>{label}</span>
        <button
          onClick={() => onTooltip(metricId)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            fontSize: '10px',
            padding: '0 2px',
          }}
        >
          ?
        </button>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: '600' }}>{value}</div>
        {subValue && (
          <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}

// Category breakdown
function CategoryBreakdown({
  areaMetrics,
  isComparison,
  isMobile,
}: {
  areaMetrics: { areaId: string; areaName: string; metrics: POIMetrics }[];
  isComparison: boolean;
  isMobile: boolean;
}) {
  const categories = areaMetrics[0].metrics.categoryBreakdown;
  const maxCount = Math.max(
    ...areaMetrics.flatMap((am) => am.metrics.categoryBreakdown.map((c) => c.count))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {categories.map((category) => {
        const allCounts = areaMetrics.map(
          (am) => am.metrics.categoryBreakdown.find((c) => c.id === category.id)?.count || 0
        );

        return (
          <div key={category.id}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    backgroundColor: `rgb(${category.color.join(',')})`,
                  }}
                />
                <span style={{ fontSize: isMobile ? '12px' : '11px' }}>
                  {category.name}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>
                {isComparison
                  ? allCounts.join(' / ')
                  : `${category.count} (${formatPercentage(category.share)})`}
              </div>
            </div>

            {/* Bar visualization */}
            <div
              style={{
                display: 'flex',
                gap: '2px',
                height: '6px',
              }}
            >
              {allCounts.map((count, idx) => (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: maxCount > 0 ? `${(count / maxCount) * 100}%` : '0%',
                      backgroundColor: `rgb(${category.color.join(',')})`,
                      opacity: 0.8,
                      borderRadius: '2px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Metric tooltip
function MetricTooltip({
  metricId,
  onClose,
}: {
  metricId: string;
  onClose: () => void;
}) {
  const definition = metricDefinitions[metricId];
  if (!definition) return null;

  const citation = getCitationText(metricId);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '400px',
          margin: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px' }}>{definition.name}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)', marginBottom: '16px' }}>
          {definition.description}
        </p>

        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
        >
          <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '10px', marginBottom: '4px' }}>
            Formula
          </div>
          {definition.formula}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '11px', marginBottom: '8px' }}>
            Interpretation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {definition.interpretation.map((range, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '4px',
                }}
              >
                <span style={{ fontWeight: '500' }}>{range.label}</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                  {range.min === 0 && range.max === Infinity
                    ? 'Any value'
                    : range.max === Infinity
                    ? `≥ ${range.min}`
                    : `${range.min} - ${range.max}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)' }}>
          <strong>Higher values mean:</strong> {definition.higherMeans}
        </div>

        {citation && (
          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            <strong>Reference:</strong> {citation}
          </div>
        )}
      </div>
    </div>
  );
}

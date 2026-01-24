/**
 * Comparison Guidance Component
 * Shows auto-generated insights and interpretation help
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { generateInsights } from '../utils/insightsGenerator';
import { dataSourceInfo } from '../data/metricDefinitions';
import type { Insight } from '../types';

interface ComparisonGuidanceProps {
  collapsed?: boolean;
}

export function ComparisonGuidance({ collapsed = false }: ComparisonGuidanceProps) {
  const { areas } = useStore();
  const [isExpanded, setIsExpanded] = useState(!collapsed);
  const [showLimitations, setShowLimitations] = useState(false);

  const insights = useMemo(() => generateInsights(areas), [areas]);

  if (areas.length === 0) return null;

  const getTypeIcon = (type: Insight['type']): string => {
    switch (type) {
      case 'positive':
        return '✓';
      case 'caution':
        return '⚠';
      default:
        return '→';
    }
  };

  const getTypeColor = (type: Insight['type']): string => {
    switch (type) {
      case 'positive':
        return '#22c55e';
      case 'caution':
        return '#eab308';
      default:
        return '#3b82f6';
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        style={{
          width: '100%',
          padding: '10px 12px',
          backgroundColor: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: '8px',
          color: '#3b82f6',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>View Analysis Insights ({insights.length})</span>
        <span>↓</span>
      </button>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(59,130,246,0.1)',
        }}
      >
        <span style={{ color: '#3b82f6', fontWeight: 500, fontSize: '12px' }}>
          Analysis Insights
        </span>
        <button
          onClick={() => setIsExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            padding: '2px',
            fontSize: '14px',
          }}
        >
          ×
        </button>
      </div>

      {/* Insights */}
      <div style={{ padding: '12px' }}>
        {insights.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {insights.map((insight, i) => (
              <div
                key={i}
                style={{
                  padding: '10px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${getTypeColor(insight.type)}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ color: getTypeColor(insight.type), fontSize: '12px' }}>
                    {getTypeIcon(insight.type)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500, fontSize: '12px' }}>
                    {insight.title}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '9px',
                      color: 'rgba(255,255,255,0.4)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {insight.confidence}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: '11px',
                    lineHeight: 1.4,
                  }}
                >
                  {insight.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '16px',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '12px',
            }}
          >
            Add areas to see comparison insights
          </div>
        )}

        {/* Limitations toggle */}
        <button
          onClick={() => setShowLimitations(!showLimitations)}
          style={{
            width: '100%',
            marginTop: '12px',
            padding: '8px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: 'none',
            borderRadius: '4px',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Limitations & Methodology</span>
          <span>{showLimitations ? '↑' : '↓'}</span>
        </button>

        {showLimitations && (
          <div
            style={{
              marginTop: '8px',
              padding: '10px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: '6px',
              fontSize: '11px',
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
              <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Data Source:</strong>{' '}
              {dataSourceInfo.name}
            </div>

            <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
              {dataSourceInfo.attribution}
            </div>

            <div
              style={{
                color: 'rgba(234,179,8,0.9)',
                fontSize: '10px',
                marginBottom: '6px',
                fontWeight: 500,
              }}
            >
              ⚠ Important Caveats:
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: '16px',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '10px',
                lineHeight: 1.5,
              }}
            >
              {dataSourceInfo.caveats.map((caveat, i) => (
                <li key={i} style={{ marginBottom: '2px' }}>
                  {caveat}
                </li>
              ))}
            </ul>

            <div
              style={{
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '10px',
              }}
            >
              Insights use conservative language and should be interpreted in context. This tool
              provides indicators, not definitive assessments.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

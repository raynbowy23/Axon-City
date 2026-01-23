/**
 * Data Attribution Component
 * Shows OSM credit, timestamp, and data quality information
 */

import { useState } from 'react';
import { dataSourceInfo } from '../data/metricDefinitions';

interface DataAttributionProps {
  timestamp?: string;
  coverageScore?: number;
  coverageLabel?: string;
  compact?: boolean;
}

export function DataAttribution({
  timestamp,
  coverageScore,
  coverageLabel,
  compact = false,
}: DataAttributionProps) {
  const [showCaveats, setShowCaveats] = useState(false);

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCoverageColor = (score: number) => {
    if (score >= 90) return '#4CAF50'; // Green
    if (score >= 70) return '#2196F3'; // Blue
    if (score >= 50) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  if (compact) {
    return (
      <div
        style={{
          fontSize: '10px',
          color: 'rgba(255, 255, 255, 0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <span>{dataSourceInfo.attribution}</span>
        {timestamp && (
          <span>• {formatTimestamp(timestamp)}</span>
        )}
        {coverageScore !== undefined && (
          <span
            style={{
              color: getCoverageColor(coverageScore),
            }}
          >
            • {coverageScore.toFixed(0)}% coverage
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '6px',
        padding: '10px 12px',
        fontSize: '11px',
      }}
    >
      {/* Source */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)' }}>
          Data Source
        </div>
        <a
          href={dataSourceInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#4A90D9',
            textDecoration: 'none',
            fontSize: '10px',
          }}
        >
          {dataSourceInfo.name} ↗
        </a>
      </div>

      {/* Attribution */}
      <div
        style={{
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: '8px',
        }}
      >
        {dataSourceInfo.attribution}
      </div>

      {/* Timestamp */}
      {timestamp && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: 'rgba(255, 255, 255, 0.5)',
            marginBottom: '8px',
          }}
        >
          <span>Queried:</span>
          <span>{formatTimestamp(timestamp)}</span>
        </div>
      )}

      {/* Coverage Score */}
      {coverageScore !== undefined && (
        <div style={{ marginBottom: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px',
            }}
          >
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
              Data Coverage:
            </span>
            <span
              style={{
                color: getCoverageColor(coverageScore),
                fontWeight: '600',
              }}
            >
              {coverageScore.toFixed(0)}% ({coverageLabel})
            </span>
          </div>
          <div
            style={{
              height: '4px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${coverageScore}%`,
                backgroundColor: getCoverageColor(coverageScore),
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Caveats Toggle */}
      <button
        onClick={() => setShowCaveats(!showCaveats)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.5)',
          cursor: 'pointer',
          fontSize: '10px',
          padding: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>{showCaveats ? '▼' : '▶'}</span>
        <span>Data Limitations</span>
      </button>

      {/* Caveats List */}
      {showCaveats && (
        <ul
          style={{
            margin: '8px 0 0 0',
            paddingLeft: '16px',
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: '10px',
            lineHeight: '1.5',
          }}
        >
          {dataSourceInfo.caveats.map((caveat, index) => (
            <li key={index} style={{ marginBottom: '4px' }}>
              {caveat}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

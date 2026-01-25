/**
 * Export Dialog Component
 * Modal for selecting export format and options
 */

import { useState, useMemo } from 'react';
import type { ComparisonArea, Polygon } from '../types';
import { exportPDFReport } from '../utils/pdfExport';
import { exportMetrics } from '../utils/exportMetrics';
import { exportSnapshot, defaultSnapshotOptions } from '../utils/snapshotExport';
import { calculatePOIMetrics } from '../utils/metricsCalculator';
import { calculateDerivedMetrics } from '../utils/externalIndices';
import { downloadGeoJSON, downloadAreaBoundaries, getExportStats } from '../utils/geoJsonExport';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  areas: ComparisonArea[];
  activeLayers: string[];
}

type ExportFormat = 'pdf' | 'image' | 'csv' | 'geojson';

interface ExportOptions {
  includeMap: boolean;
  includeMetrics: boolean;
  includeInsights: boolean;
  includeMethodology: boolean;
}

interface GeoJSONOptions {
  includeAreaBoundaries: boolean;
  includePOIs: boolean;
  includeBuildings: boolean;
  includeMethodology: boolean;
}

export function ExportDialog({ isOpen, onClose, areas, activeLayers }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    includeMap: true,
    includeMetrics: true,
    includeInsights: true,
    includeMethodology: true,
  });
  const [geoJsonOptions, setGeoJsonOptions] = useState<GeoJSONOptions>({
    includeAreaBoundaries: true,
    includePOIs: true,
    includeBuildings: true,
    includeMethodology: true,
  });

  // Calculate export stats for GeoJSON
  const exportStats = useMemo(() => {
    if (format !== 'geojson') return null;
    return getExportStats(areas, activeLayers);
  }, [format, areas, activeLayers]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);

    try {
      switch (format) {
        case 'pdf':
          await exportPDFReport(areas, activeLayers, options);
          break;
        case 'image':
          await exportSnapshot(
            defaultSnapshotOptions,
            {
              areas,
              activeLayers,
              timestamp: new Date().toLocaleString(),
            }
          );
          break;
        case 'csv': {
          const metricsData = areas.map((area) => {
            const areaKm2 = area.polygon.area / 1_000_000;
            return {
              name: area.name,
              metrics: calculatePOIMetrics(area.layerData, areaKm2),
              derivedMetrics: calculateDerivedMetrics(
                area.layerData,
                areaKm2,
                area.polygon.geometry as Polygon
              ),
            };
          });
          exportMetrics(metricsData);
          break;
        }
        case 'geojson':
          downloadGeoJSON(areas, activeLayers, geoJsonOptions);
          break;
      }
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportBoundariesOnly = () => {
    downloadAreaBoundaries(areas);
  };

  const formatOptions: { value: ExportFormat; label: string; description: string; icon: string }[] = [
    {
      value: 'pdf',
      label: 'PDF Report',
      description: 'Professional report with map, metrics, and insights',
      icon: '📄',
    },
    {
      value: 'image',
      label: 'Map Image',
      description: 'PNG snapshot of the current map view',
      icon: '🖼️',
    },
    {
      value: 'csv',
      label: 'CSV Metrics',
      description: 'Summary metrics for spreadsheets',
      icon: '📊',
    },
    {
      value: 'geojson',
      label: 'GeoJSON',
      description: 'Full spatial data for GIS software',
      icon: '🗺️',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '12px',
          padding: '24px',
          width: '440px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          WebkitOverflowScrolling: 'touch',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: 'white',
            }}
          >
            Export Data
          </h2>
          <button
            onClick={onClose}
            onTouchEnd={(e) => {
              e.preventDefault();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '8px',
              touchAction: 'manipulation',
            }}
          >
            ×
          </button>
        </div>

        {/* Area info */}
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.5)',
              marginBottom: '4px',
            }}
          >
            Exporting {areas.length} area{areas.length > 1 ? 's' : ''}:
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {areas.map((area) => (
              <span
                key={area.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'white',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: `rgb(${area.color.join(',')})`,
                  }}
                />
                {area.name}
              </span>
            ))}
          </div>
        </div>

        {/* Format selection */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: '10px',
            }}
          >
            Export Format
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {formatOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setFormat(opt.value);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 8px',
                  backgroundColor:
                    format === opt.value
                      ? 'rgba(74, 144, 217, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                  border:
                    format === opt.value
                      ? '1px solid rgba(74, 144, 217, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                  touchAction: 'manipulation',
                }}
              >
                <span style={{ fontSize: '24px' }}>{opt.icon}</span>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: 'white',
                  }}
                >
                  {opt.label}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    lineHeight: 1.3,
                  }}
                >
                  {opt.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* PDF Options */}
        {format === 'pdf' && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '10px',
              }}
            >
              Include in Report
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { key: 'includeMap', label: 'Map Snapshot' },
                { key: 'includeMetrics', label: 'Metrics Table' },
                { key: 'includeInsights', label: 'Key Insights' },
                { key: 'includeMethodology', label: 'Methodology' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'white',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={options[opt.key as keyof ExportOptions]}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        [opt.key]: e.target.checked,
                      }))
                    }
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer',
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* GeoJSON Options */}
        {format === 'geojson' && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: 'rgba(255, 255, 255, 0.7)',
                marginBottom: '10px',
              }}
            >
              Include in Export
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { key: 'includeAreaBoundaries', label: 'Area Boundaries' },
                { key: 'includePOIs', label: 'Points of Interest' },
                { key: 'includeBuildings', label: 'Buildings & Infrastructure' },
                { key: 'includeMethodology', label: 'Methodology Documentation (.md)' },
              ].map((opt) => (
                <label
                  key={opt.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'white',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={geoJsonOptions[opt.key as keyof GeoJSONOptions]}
                    onChange={(e) =>
                      setGeoJsonOptions((prev) => ({
                        ...prev,
                        [opt.key]: e.target.checked,
                      }))
                    }
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer',
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {/* Export stats */}
            {exportStats && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(74, 144, 217, 0.1)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.7)',
                }}
              >
                <div style={{ marginBottom: '4px' }}>
                  <strong style={{ color: 'white' }}>{exportStats.totalFeatures.toLocaleString()}</strong> features will be exported
                </div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>
                  Includes all visible layers across {areas.length} area{areas.length > 1 ? 's' : ''}
                </div>
              </div>
            )}

            {/* Quick export boundaries only */}
            <button
              onClick={handleExportBoundariesOnly}
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '10px',
                backgroundColor: 'transparent',
                border: '1px dashed rgba(255, 255, 255, 0.3)',
                borderRadius: '6px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }}
            >
              Quick: Export Boundaries Only
            </button>
          </div>
        )}

        {/* Export button */}
        <button
          onClick={handleExport}
          onTouchEnd={(e) => {
            if (!isExporting) {
              e.preventDefault();
              handleExport();
            }
          }}
          disabled={isExporting}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: isExporting
              ? 'rgba(74, 144, 217, 0.3)'
              : 'rgba(74, 144, 217, 0.8)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isExporting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            touchAction: 'manipulation',
          }}
        >
          {isExporting ? (
            <>
              <span
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              Generating...
            </>
          ) : (
            <>
              Export {format === 'geojson' ? 'GeoJSON' : format.toUpperCase()}
            </>
          )}
        </button>

        {/* Format info */}
        {format === 'geojson' && (
          <div
            style={{
              marginTop: '12px',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.5)',
              textAlign: 'center',
              lineHeight: 1.4,
            }}
          >
            GeoJSON files can be opened in QGIS, ArcGIS, Mapbox Studio, and other GIS tools.
            {geoJsonOptions.includeMethodology && ' Methodology file included for reproducibility.'}
          </div>
        )}

        {/* CSS for spinner animation */}
        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    </div>
  );
}

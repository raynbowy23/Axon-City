/**
 * Export Dialog Component
 * Modal for selecting export format and options
 */

import { useState } from 'react';
import type { ComparisonArea } from '../types';
import { exportPDFReport } from '../utils/pdfExport';
import { exportMetrics } from '../utils/exportMetrics';
import { exportSnapshot, defaultSnapshotOptions } from '../utils/snapshotExport';
import { calculatePOIMetrics } from '../utils/metricsCalculator';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  areas: ComparisonArea[];
  activeLayers: string[];
}

type ExportFormat = 'pdf' | 'image' | 'csv';

interface ExportOptions {
  includeMap: boolean;
  includeMetrics: boolean;
  includeInsights: boolean;
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
        case 'csv':
          const metricsData = areas.map((area) => {
            const areaKm2 = area.polygon.area / 1_000_000;
            return {
              name: area.name,
              metrics: calculatePOIMetrics(area.layerData, areaKm2),
            };
          });
          exportMetrics(metricsData);
          break;
      }
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
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
      label: 'CSV Data',
      description: 'Raw metrics data for spreadsheets',
      icon: '📊',
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
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '12px',
          padding: '24px',
          width: '400px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
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
            Export Report
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {formatOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
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
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '24px' }}>{opt.icon}</span>
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'white',
                    }}
                  >
                    {opt.label}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'rgba(255, 255, 255, 0.5)',
                    }}
                  >
                    {opt.description}
                  </div>
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

        {/* Export button */}
        <button
          onClick={handleExport}
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
              Export {format.toUpperCase()}
            </>
          )}
        </button>

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

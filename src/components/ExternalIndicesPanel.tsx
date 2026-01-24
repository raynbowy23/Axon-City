import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import {
  calculateDerivedMetrics,
  DERIVED_METRIC_DEFINITIONS,
  importIndexFromCSV,
  parseCSV,
  formatMetricValue,
  getMetricInterpretation,
  getMetricDefinition,
} from '../utils/externalIndices';
import { calculatePolygonArea } from '../utils/geometryUtils';
import type { DerivedMetricType, IndexImportConfig, Polygon } from '../types';

interface ExternalIndicesPanelProps {
  isMobile?: boolean;
}

export function ExternalIndicesPanel({ isMobile = false }: ExternalIndicesPanelProps) {
  const {
    isIndexPanelOpen,
    setIndexPanelOpen,
    selectionPolygon,
    layerData,
    externalIndices,
    addExternalIndex,
    removeExternalIndex,
    derivedMetrics,
    setDerivedMetrics,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'derived' | 'external'>('derived');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importConfig, setImportConfig] = useState<Partial<IndexImportConfig>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate derived metrics when selection or layer data changes
  useEffect(() => {
    if (selectionPolygon && layerData.size > 0) {
      const areaKm2 = calculatePolygonArea(selectionPolygon.geometry as Polygon);
      const metrics = calculateDerivedMetrics(layerData, areaKm2, selectionPolygon.geometry as Polygon);
      setDerivedMetrics(selectionPolygon.id, metrics);
    }
  }, [selectionPolygon, layerData, setDerivedMetrics]);

  const currentMetrics = selectionPolygon ? derivedMetrics.get(selectionPolygon.id) : undefined;

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImportError(null);

    try {
      const { headers } = await parseCSV(file);
      setCsvHeaders(headers);
      setImportConfig({
        file,
        name: file.name.replace(/\.(csv|txt)$/i, ''),
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to parse CSV');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importConfig.file || !importConfig.name || !importConfig.valueColumn) {
      setImportError('Please fill in required fields');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const index = await importIndexFromCSV(importConfig as IndexImportConfig);
      addExternalIndex(index);

      // Reset import state
      setSelectedFile(null);
      setCsvHeaders([]);
      setImportConfig({});
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import index');
    } finally {
      setIsImporting(false);
    }
  }, [importConfig, addExternalIndex]);

  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high':
        return '#4CAF50';
      case 'medium':
        return '#FFC107';
      case 'low':
        return '#FF5722';
    }
  };

  const getInterpretationColor = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low':
        return '#FF5722';
      case 'medium':
        return '#FFC107';
      case 'high':
        return '#4CAF50';
    }
  };

  if (!isIndexPanelOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobile ? 'auto' : '60px',
        bottom: isMobile ? '80px' : 'auto',
        right: isMobile ? '10px' : '320px',
        width: isMobile ? 'calc(100% - 20px)' : '340px',
        maxHeight: isMobile ? '60vh' : 'calc(100vh - 120px)',
        backgroundColor: 'rgba(20, 20, 25, 0.95)',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'white' }}>
          Urban Metrics & Indices
        </h3>
        <button
          onClick={() => setIndexPanelOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
          }}
        >
          x
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <button
          onClick={() => setActiveTab('derived')}
          style={{
            flex: 1,
            padding: '12px',
            backgroundColor: activeTab === 'derived' ? 'rgba(74, 144, 217, 0.2)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'derived' ? '2px solid #4A90D9' : '2px solid transparent',
            color: activeTab === 'derived' ? '#4A90D9' : 'rgba(255, 255, 255, 0.6)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
          }}
        >
          Derived Metrics
        </button>
        <button
          onClick={() => setActiveTab('external')}
          style={{
            flex: 1,
            padding: '12px',
            backgroundColor: activeTab === 'external' ? 'rgba(74, 144, 217, 0.2)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'external' ? '2px solid #4A90D9' : '2px solid transparent',
            color: activeTab === 'external' ? '#4A90D9' : 'rgba(255, 255, 255, 0.6)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
          }}
        >
          External Indices
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}
      >
        {activeTab === 'derived' && (
          <div>
            {!selectionPolygon ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.5)',
                  padding: '24px',
                  fontSize: '13px',
                }}
              >
                Draw a selection area to see derived metrics
              </div>
            ) : !currentMetrics || currentMetrics.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.5)',
                  padding: '24px',
                  fontSize: '13px',
                }}
              >
                Loading metrics...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {currentMetrics.map((metric) => {
                  const definition = getMetricDefinition(metric.metricId);
                  const interpretation = getMetricInterpretation(metric.value, metric.metricId);

                  return (
                    <div
                      key={metric.metricId}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '12px',
                        borderLeft: `3px solid ${getInterpretationColor(interpretation)}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '8px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: 'white' }}>
                            {definition?.name || metric.metricId}
                          </div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: 'rgba(255, 255, 255, 0.5)',
                              marginTop: '2px',
                            }}
                          >
                            {definition?.description}
                          </div>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: getConfidenceColor(metric.confidence),
                              color: 'white',
                            }}
                          >
                            {metric.confidence}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '24px',
                            fontWeight: '700',
                            color: getInterpretationColor(interpretation),
                          }}
                        >
                          {formatMetricValue(metric.value, metric.metricId)}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            textTransform: 'capitalize',
                          }}
                        >
                          ({interpretation})
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div
                        style={{
                          marginTop: '8px',
                          height: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(metric.value, 100)}%`,
                            height: '100%',
                            backgroundColor: getInterpretationColor(interpretation),
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Walk Score Disclaimer */}
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: 'rgba(74, 144, 217, 0.1)',
                borderRadius: '8px',
                borderLeft: '3px solid #4A90D9',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  lineHeight: '1.5',
                }}
              >
                <strong style={{ color: 'white' }}>Disclaimer:</strong> Walk Score, Transit Score, and Bike Score
                metrics shown here are <em>proxy calculations</em> based on publicly available methodology
                descriptions. They are not official Walk Score&reg; values. For official scores and API access,
                visit{' '}
                <a
                  href="https://www.walkscore.com/professional/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#4A90D9',
                    textDecoration: 'underline',
                  }}
                >
                  walkscore.com/professional
                </a>
                .
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.5)',
                  marginTop: '8px',
                }}
              >
                Walk Score&reg;, Transit Score&reg;, and Bike Score&reg; are registered trademarks of Walk Score.
              </div>
            </div>

            {/* Metric Definitions */}
            <details
              style={{
                marginTop: '16px',
                color: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                }}
              >
                Metric Definitions & Formulas
              </summary>
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  lineHeight: '1.6',
                }}
              >
                {DERIVED_METRIC_DEFINITIONS.map((def) => (
                  <div
                    key={def.id}
                    style={{
                      padding: '8px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <strong>{def.name}</strong>
                    <div style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                      Formula: <code style={{ color: '#4A90D9' }}>{def.formula}</code>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {activeTab === 'external' && (
          <div>
            {/* Import Section */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: '500', color: 'white', marginBottom: '12px' }}>
                Import Index from CSV
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              {!selectedFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    padding: '24px 16px',
                    backgroundColor: 'rgba(74, 144, 217, 0.1)',
                    border: '2px dashed rgba(74, 144, 217, 0.3)',
                    borderRadius: '8px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textAlign: 'center',
                  }}
                >
                  Drop CSV file here or click to browse
                  <br />
                  <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                    Supported: .csv, .txt
                  </span>
                </button>
              ) : (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                      {selectedFile.name}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setCsvHeaders([]);
                        setImportConfig({});
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.5)',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      x
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          marginBottom: '4px',
                        }}
                      >
                        Index Name *
                      </label>
                      <input
                        type="text"
                        value={importConfig.name || ''}
                        onChange={(e) => setImportConfig({ ...importConfig, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          marginBottom: '4px',
                        }}
                      >
                        Value Column *
                      </label>
                      <select
                        value={importConfig.valueColumn || ''}
                        onChange={(e) =>
                          setImportConfig({ ...importConfig, valueColumn: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px',
                        }}
                      >
                        <option value="">Select column...</option>
                        {csvHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          marginBottom: '4px',
                        }}
                      >
                        Area/ID Column (optional)
                      </label>
                      <select
                        value={importConfig.areaColumn || ''}
                        onChange={(e) =>
                          setImportConfig({ ...importConfig, areaColumn: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px',
                        }}
                      >
                        <option value="">None</option>
                        {csvHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: 'rgba(255, 255, 255, 0.5)',
                          marginBottom: '4px',
                        }}
                      >
                        Unit (optional)
                      </label>
                      <input
                        type="text"
                        value={importConfig.unit || ''}
                        onChange={(e) => setImportConfig({ ...importConfig, unit: e.target.value })}
                        placeholder="e.g., %, per km2, score"
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </div>

                  {importError && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '8px',
                        backgroundColor: 'rgba(255, 82, 82, 0.1)',
                        borderRadius: '4px',
                        color: '#FF5252',
                        fontSize: '11px',
                      }}
                    >
                      {importError}
                    </div>
                  )}

                  <button
                    onClick={handleImport}
                    disabled={isImporting || !importConfig.valueColumn}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      padding: '10px',
                      backgroundColor:
                        isImporting || !importConfig.valueColumn ? '#444' : '#4A90D9',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: isImporting || !importConfig.valueColumn ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}
                  >
                    {isImporting ? 'Importing...' : 'Import Index'}
                  </button>
                </div>
              )}
            </div>

            {/* Imported Indices */}
            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '8px',
                }}
              >
                Imported Indices ({externalIndices.length})
              </div>

              {externalIndices.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'rgba(255, 255, 255, 0.4)',
                    padding: '24px',
                    fontSize: '12px',
                  }}
                >
                  No external indices imported yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {externalIndices.map((index) => (
                    <div
                      key={index.id}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: 'white' }}>
                            {index.name}
                          </div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: 'rgba(255, 255, 255, 0.5)',
                              marginTop: '2px',
                            }}
                          >
                            {index.source}
                          </div>
                        </div>
                        <button
                          onClick={() => removeExternalIndex(index.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.4)',
                            cursor: 'pointer',
                            fontSize: '14px',
                          }}
                        >
                          x
                        </button>
                      </div>

                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          color: 'rgba(255, 255, 255, 0.6)',
                        }}
                      >
                        <span>Range: {index.min.toFixed(1)} - {index.max.toFixed(1)}</span>
                        {index.unit && <span> {index.unit}</span>}
                        <span style={{ marginLeft: '12px' }}>
                          {index.values.size} values
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Example CSV Format */}
            <details
              style={{
                marginTop: '16px',
                color: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                }}
              >
                CSV Format Examples
              </summary>
              <div
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                }}
              >
                <div style={{ marginBottom: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  With area names:
                </div>
                <pre style={{ margin: 0, color: '#4A90D9' }}>
                  {`area_name,walk_score,transit_score
Downtown,85,72
Midtown,62,45
Suburbs,43,28`}
                </pre>

                <div style={{ marginTop: '12px', marginBottom: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  With coordinates:
                </div>
                <pre style={{ margin: 0, color: '#4A90D9' }}>
                  {`lat,lon,air_quality_index
43.073,−89.401,42
43.089,−89.382,38`}
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

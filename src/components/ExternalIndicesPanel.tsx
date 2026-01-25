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
import type { DerivedMetricType, IndexImportConfig, Polygon, DerivedMetricValue, ComparisonArea } from '../types';

interface ExternalIndicesPanelProps {
  isMobile?: boolean;
}

export function ExternalIndicesPanel({ isMobile = false }: ExternalIndicesPanelProps) {
  const {
    isIndexPanelOpen,
    setIndexPanelOpen,
    areas,
    layerData,
    externalIndices,
    addExternalIndex,
    removeExternalIndex,
    derivedMetrics,
    setDerivedMetrics,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'derived' | 'external'>('derived');
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('compare');
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [areaOrder, setAreaOrder] = useState<string[]>([]); // Custom order of area IDs
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importConfig, setImportConfig] = useState<Partial<IndexImportConfig>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate derived metrics for all areas when layer data changes
  useEffect(() => {
    for (const area of areas) {
      if (area.layerData.size > 0) {
        const areaKm2 = calculatePolygonArea(area.polygon.geometry as Polygon);
        const metrics = calculateDerivedMetrics(area.layerData, areaKm2, area.polygon.geometry as Polygon);
        setDerivedMetrics(area.id, metrics);
      }
    }
  }, [areas, setDerivedMetrics]);

  // Auto-select first area if none selected
  useEffect(() => {
    if (areas.length > 0 && !selectedAreaId) {
      setSelectedAreaId(areas[0].id);
    } else if (areas.length === 0) {
      setSelectedAreaId(null);
    } else if (selectedAreaId && !areas.find(a => a.id === selectedAreaId)) {
      setSelectedAreaId(areas[0]?.id || null);
    }
  }, [areas, selectedAreaId]);

  // Sync areaOrder with areas (add new, remove deleted)
  useEffect(() => {
    const currentIds = areas.map(a => a.id);
    const newOrder = areaOrder.filter(id => currentIds.includes(id));
    const addedIds = currentIds.filter(id => !areaOrder.includes(id));
    if (addedIds.length > 0 || newOrder.length !== areaOrder.length) {
      setAreaOrder([...newOrder, ...addedIds]);
    }
  }, [areas, areaOrder]);

  // Move area up or down in the order
  const moveArea = useCallback((areaId: string, direction: 'up' | 'down') => {
    setAreaOrder(prevOrder => {
      const index = prevOrder.indexOf(areaId);
      if (index === -1) return prevOrder;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prevOrder.length) return prevOrder;

      const newOrder = [...prevOrder];
      [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
      return newOrder;
    });
  }, []);

  // Get metrics for all areas, sorted by custom order
  const areaMetrics: { area: ComparisonArea; metrics: DerivedMetricValue[] }[] = areas
    .filter(area => derivedMetrics.has(area.id))
    .map(area => ({ area, metrics: derivedMetrics.get(area.id) || [] }))
    .sort((a, b) => {
      const indexA = areaOrder.indexOf(a.area.id);
      const indexB = areaOrder.indexOf(b.area.id);
      return indexA - indexB;
    });

  // Get selected area for single view
  const selectedAreaData = areaMetrics.find(am => am.area.id === selectedAreaId);

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

  // Get progress bar percentage normalized to the metric's scale
  // This makes the progress bar visually match the interpretation (low/medium/high)
  const getProgressPercent = (value: number, metricId: DerivedMetricType): number => {
    // Define the max value for each metric (value at which bar should be full)
    const maxValues: Partial<Record<DerivedMetricType, number>> = {
      diversity_index: 100,
      green_ratio: 30,           // 30% green space is exceptional
      street_connectivity: 150,  // 150 intersections/km² is very high
      building_density: 60,      // 60% building coverage is very dense
      transit_coverage: 100,
      mixed_use_score: 100,
      walkability_proxy: 100,
      bike_score: 100,
      fifteen_min_score: 100,
    };

    const max = maxValues[metricId] || 100;
    return Math.min((value / max) * 100, 100);
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
            {areas.length === 0 ? (
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
            ) : areaMetrics.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  color: 'rgba(255, 255, 255, 0.5)',
                  padding: '24px',
                  fontSize: '13px',
                }}
              >
                Loading metrics... (Fetch data for areas first)
              </div>
            ) : (
              <>
                {/* View mode toggle - only show when multiple areas */}
                {areaMetrics.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px',
                      padding: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => setViewMode('single')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: '500',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: viewMode === 'single' ? '#4A90D9' : 'rgba(255, 255, 255, 0.1)',
                          color: viewMode === 'single' ? 'white' : 'rgba(255, 255, 255, 0.6)',
                        }}
                      >
                        Single
                      </button>
                      <button
                        onClick={() => setViewMode('compare')}
                        style={{
                          padding: '6px 12px',
                          fontSize: '11px',
                          fontWeight: '500',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: viewMode === 'compare' ? '#4A90D9' : 'rgba(255, 255, 255, 0.1)',
                          color: viewMode === 'compare' ? 'white' : 'rgba(255, 255, 255, 0.6)',
                        }}
                      >
                        Compare
                      </button>
                    </div>

                    {/* Area selector for single view */}
                    {viewMode === 'single' && (
                      <select
                        value={selectedAreaId || ''}
                        onChange={(e) => setSelectedAreaId(e.target.value)}
                        style={{
                          padding: '6px 8px',
                          fontSize: '11px',
                          backgroundColor: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '4px',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        {areaMetrics.map(({ area }) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Single area view */}
                {(areaMetrics.length === 1 || viewMode === 'single') && selectedAreaData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {areaMetrics.length === 1 && (
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: '500',
                          color: `rgba(${selectedAreaData.area.color.slice(0, 3).join(',')}, 1)`,
                          marginBottom: '4px',
                        }}
                      >
                        {selectedAreaData.area.name}
                      </div>
                    )}
                    {selectedAreaData.metrics.map((metric) => {
                      const definition = getMetricDefinition(metric.metricId);
                      const interpretation = getMetricInterpretation(metric.value, metric.metricId);

                      // Build tooltip showing required layers and their availability
                      const requiredLayers = definition?.requiredLayers || [];
                      const availableLayers = requiredLayers.filter(layerId => {
                        const data = selectedAreaData.area.layerData.get(layerId);
                        return data?.clippedFeatures && data.clippedFeatures.features.length > 0;
                      });
                      const layerStatusList = requiredLayers.map(layerId => {
                        const hasData = availableLayers.includes(layerId);
                        return `${hasData ? '✓' : '✗'} ${layerId}`;
                      }).join('\n');
                      const dataTooltip = `Data availability (${availableLayers.length}/${requiredLayers.length} layers):\n${layerStatusList}`;

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
                                cursor: 'help',
                              }}
                              title={dataTooltip}
                            >
                              <span
                                style={{
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                  color: 'rgba(255, 255, 255, 0.6)',
                                  border: '1px solid rgba(255, 255, 255, 0.2)',
                                }}
                              >
                                {availableLayers.length}/{requiredLayers.length}
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
                                color: getInterpretationColor(interpretation),
                                textTransform: 'capitalize',
                              }}
                            >
                              ({interpretation})
                            </span>
                          </div>

                          {/* Progress bar - normalized to metric's scale */}
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
                                width: `${getProgressPercent(metric.value, metric.metricId)}%`,
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
                ) : (
                  // Multi-area comparison view
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Area legend with reorder controls */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                        Area Order (use arrows to reorder)
                      </div>
                      {areaMetrics.map(({ area }, index) => (
                        <div
                          key={area.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 8px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '4px',
                          }}
                        >
                          {/* Reorder buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              onClick={() => moveArea(area.id, 'up')}
                              disabled={index === 0}
                              style={{
                                width: '16px',
                                height: '12px',
                                padding: 0,
                                border: 'none',
                                borderRadius: '2px',
                                backgroundColor: index === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                                color: index === 0 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                                cursor: index === 0 ? 'default' : 'pointer',
                                fontSize: '8px',
                                lineHeight: 1,
                              }}
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveArea(area.id, 'down')}
                              disabled={index === areaMetrics.length - 1}
                              style={{
                                width: '16px',
                                height: '12px',
                                padding: 0,
                                border: 'none',
                                borderRadius: '2px',
                                backgroundColor: index === areaMetrics.length - 1 ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                                color: index === areaMetrics.length - 1 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                                cursor: index === areaMetrics.length - 1 ? 'default' : 'pointer',
                                fontSize: '8px',
                                lineHeight: 1,
                              }}
                            >
                              ▼
                            </button>
                          </div>

                          {/* Area color indicator */}
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '3px',
                              backgroundColor: `rgba(${area.color.slice(0, 3).join(',')}, 1)`,
                              flexShrink: 0,
                            }}
                          />

                          {/* Area name */}
                          <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)', flex: 1 }}>
                            {area.name}
                          </span>

                          {/* Position indicator */}
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                            #{index + 1}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Comparison table */}
                    {DERIVED_METRIC_DEFINITIONS.map((definition) => {
                      const metricValues = areaMetrics.map(({ area, metrics }) => {
                        const metric = metrics.find(m => m.metricId === definition.id);
                        return { area, metric };
                      });

                      // Find best/worst for highlighting
                      const values = metricValues
                        .filter(v => v.metric)
                        .map(v => v.metric!.value);
                      const maxValue = Math.max(...values);
                      const minValue = Math.min(...values);

                      return (
                        <div
                          key={definition.id}
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '8px',
                            padding: '12px',
                          }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: '500', color: 'white', marginBottom: '8px' }}>
                            {definition.name}
                          </div>

                          {/* Values for each area */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {metricValues.map(({ area, metric }) => {
                              if (!metric) return null;
                              const interpretation = getMetricInterpretation(metric.value, metric.metricId);
                              const isBest = values.length > 1 && metric.value === maxValue;
                              const isWorst = values.length > 1 && metric.value === minValue && minValue !== maxValue;

                              return (
                                <div
                                  key={area.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                  }}
                                >
                                  {/* Area color indicator */}
                                  <div
                                    style={{
                                      width: '4px',
                                      height: '24px',
                                      borderRadius: '2px',
                                      backgroundColor: `rgba(${area.color.slice(0, 3).join(',')}, 1)`,
                                      flexShrink: 0,
                                    }}
                                  />

                                  {/* Progress bar with value */}
                                  <div style={{ flex: 1, position: 'relative' }}>
                                    <div
                                      style={{
                                        height: '24px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: `${getProgressPercent(metric.value, metric.metricId)}%`,
                                          height: '100%',
                                          backgroundColor: `rgba(${area.color.slice(0, 3).join(',')}, 0.6)`,
                                          transition: 'width 0.3s ease',
                                        }}
                                      />
                                    </div>
                                    <div
                                      style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '8px',
                                        transform: 'translateY(-50%)',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        color: 'white',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                      }}
                                    >
                                      {formatMetricValue(metric.value, metric.metricId)}
                                      {isBest && <span style={{ marginLeft: '4px', color: '#4CAF50' }}>▲</span>}
                                      {isWorst && <span style={{ marginLeft: '4px', color: '#FF5722' }}>▼</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Delta indicator */}
                          {values.length >= 2 && (
                            <div
                              style={{
                                marginTop: '8px',
                                padding: '6px 8px',
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '4px',
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.6)',
                              }}
                            >
                              {(() => {
                                const range = maxValue - minValue;
                                const baselineValue = metricValues[0]?.metric?.value || 0;
                                const baselineArea = metricValues[0]?.area;
                                const bestArea = metricValues.find(v => v.metric?.value === maxValue)?.area;
                                const worstArea = metricValues.find(v => v.metric?.value === minValue)?.area;
                                const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {/* Range */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Range:</span>
                                      <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                        {range.toFixed(1)} ({minValue > 0 ? ((range / minValue) * 100).toFixed(0) : '—'}%)
                                      </span>
                                    </div>

                                    {/* Average */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Average:</span>
                                      <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                        {avgValue.toFixed(1)}
                                      </span>
                                    </div>

                                    {/* Comparison to baseline (first area) */}
                                    {values.length === 2 && baselineValue > 0 && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>vs {baselineArea?.name}:</span>
                                        <span
                                          style={{
                                            color: metricValues[1]?.metric?.value! > baselineValue
                                              ? '#4CAF50'
                                              : metricValues[1]?.metric?.value! < baselineValue
                                                ? '#FF5722'
                                                : 'rgba(255, 255, 255, 0.8)',
                                          }}
                                        >
                                          {metricValues[1]?.metric?.value! > baselineValue ? '+' : ''}
                                          {((metricValues[1]?.metric?.value! - baselineValue) / baselineValue * 100).toFixed(1)}%
                                        </span>
                                      </div>
                                    )}

                                    {/* Best/Worst for 3+ areas */}
                                    {values.length > 2 && bestArea && worstArea && (
                                      <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Best:</span>
                                          <span style={{ color: '#4CAF50' }}>
                                            {bestArea.name} ({maxValue.toFixed(1)})
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span>Lowest:</span>
                                          <span style={{ color: '#FF5722' }}>
                                            {worstArea.name} ({minValue.toFixed(1)})
                                          </span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
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

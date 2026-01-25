import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { getLayerById, getGroupById } from '../data/layerManifest';
import { MetricsPanel } from './MetricsPanel';
import { ComparisonTable } from './ComparisonTable';
import { ComparisonGuidance } from './ComparisonGuidance';
import { ExportDialog } from './ExportDialog';
import { exportMetrics, type ExportArea } from '../utils/exportMetrics';
import { calculatePOIMetrics } from '../utils/metricsCalculator';
import { calculatePolygonArea } from '../utils/geometryUtils';
import { calculateDerivedMetrics } from '../utils/externalIndices';
import type { LayerStats, LayerGroup, AnyLayerConfig, Polygon, ComparisonArea } from '../types';

// Size constraints
const MIN_WIDTH = 280;
const MAX_WIDTH = 800; // Increased for comparison mode
const MIN_HEIGHT = 150;
const DEFAULT_WIDTH = 360;
const COMPARISON_WIDTH = 500; // Default width when in comparison mode

// Get default height capped at half viewport
function getDefaultHeight(): number {
  const halfViewport = Math.floor(window.innerHeight / 2);
  return Math.min(280, halfViewport - 100); // 100px buffer for bottom offset
}

// Get max height capped at half viewport
function getMaxHeight(): number {
  const halfViewport = Math.floor(window.innerHeight / 2);
  return Math.min(400, halfViewport);
}

// Top controls area height (logo + area selector + buttons + margin)
const TOP_CONTROLS_HEIGHT = 200;

// LocalStorage key
const STORAGE_KEY = 'axoncity-stats-panel-size';

interface PanelSize {
  width: number;
  height: number;
}

interface StatsPanelProps {
  isMobile?: boolean;
}

function loadSavedSize(): PanelSize {
  const maxHeight = getMaxHeight();
  const defaultHeight = getDefaultHeight();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width || DEFAULT_WIDTH)),
        height: Math.min(maxHeight, Math.max(MIN_HEIGHT, parsed.height || defaultHeight)),
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { width: DEFAULT_WIDTH, height: defaultHeight };
}

function saveSize(size: PanelSize): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage errors
  }
}

export function StatsPanel({ isMobile = false }: StatsPanelProps) {
  const { layerData, activeLayers, selectionPolygon, isLoading, loadingMessage, setExtractedViewOpen, isExtractedViewOpen, customLayers, areas, activeAreaId } = useStore();

  // Get the active area's layer data, falling back to global layerData
  const activeArea = areas.find((a: ComparisonArea) => a.id === activeAreaId);
  const activeLayerData = useMemo(
    () => activeArea?.layerData || layerData,
    [activeArea?.layerData, layerData]
  );

  // Panel size state
  const [size, setSize] = useState<PanelSize>(loadSavedSize);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'right' | 'top' | 'corner' | null>(null);

  // View mode - layer stats or analysis (metrics/comparison)
  const [viewMode, setViewMode] = useState<'layers' | 'analysis'>('layers');

  // Sort strategy for analysis comparison view
  const [sortStrategy, setSortStrategy] = useState<'manual' | 'name' | 'size'>('manual');
  const [areaOrder, setAreaOrder] = useState<string[]>([]);

  // Export dialog state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);

  // Comparison mode for layers view - show all areas side by side
  const [isLayerComparisonMode, setIsLayerComparisonMode] = useState(false);
  const canCompare = areas.length >= 2;

  // Track actual viewport height for iPad compatibility
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  useEffect(() => {
    const updateHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, []);

  // Constrain size when viewport changes to ensure max height is never exceeded
  useEffect(() => {
    const maxHeight = getMaxHeight();
    if (size.height > maxHeight) {
      const newSize = { ...size, height: maxHeight };
      setSize(newSize);
      saveSize(newSize);
    }
  }, [viewportHeight, size.height]);

  // Compute effective area order (keeps existing order, adds new areas at end)
  const effectiveAreaOrder = useMemo(() => {
    const currentIds = areas.map((a: ComparisonArea) => a.id);
    // Keep existing order for areas that still exist
    const existingOrder = areaOrder.filter((id) => currentIds.includes(id));
    // Add any new areas that aren't in the order
    const missing = currentIds.filter((id: string) => !existingOrder.includes(id));
    return [...existingOrder, ...missing];
  }, [areas, areaOrder]);

  // Compute sorted areas based on strategy
  const sortedAreas = useMemo(() => {
    if (sortStrategy === 'name') {
      return [...areas].sort((a: ComparisonArea, b: ComparisonArea) =>
        a.name.localeCompare(b.name)
      );
    }
    if (sortStrategy === 'size') {
      return [...areas].sort((a: ComparisonArea, b: ComparisonArea) =>
        b.polygon.area - a.polygon.area // Largest first
      );
    }
    // Manual order
    return effectiveAreaOrder
      .map((id) => areas.find((a: ComparisonArea) => a.id === id))
      .filter((a): a is ComparisonArea => a !== undefined);
  }, [areas, sortStrategy, effectiveAreaOrder]);

  // Move area up/down in manual order
  const moveArea = useCallback((areaId: string, direction: 'up' | 'down') => {
    // Use effectiveAreaOrder as the base for swapping
    const currentOrder = [...effectiveAreaOrder];
    const idx = currentOrder.indexOf(areaId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= currentOrder.length) return;
    [currentOrder[idx], currentOrder[newIdx]] = [currentOrder[newIdx], currentOrder[idx]];
    setAreaOrder(currentOrder);
    setSortStrategy('manual');
  }, [effectiveAreaOrder]);
  const panelRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef<{ x: number; y: number; width: number; height: number }>({ x: 0, y: 0, width: 0, height: 0 });

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeDirection) return;

    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = startPosRef.current.y - e.clientY; // Inverted for top resize

    let newWidth = startPosRef.current.width;
    let newHeight = startPosRef.current.height;

    if (resizeDirection === 'right' || resizeDirection === 'corner') {
      newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startPosRef.current.width + deltaX));
    }

    if (resizeDirection === 'top' || resizeDirection === 'corner') {
      newHeight = Math.min(getMaxHeight(), Math.max(MIN_HEIGHT, startPosRef.current.height + deltaY));
    }

    setSize({ width: newWidth, height: newHeight });
  }, [isResizing, resizeDirection]);

  // Handle mouse up to stop resize
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      setResizeDirection(null);
      saveSize(size);
    }
  }, [isResizing, size]);

  // Add/remove global mouse listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = resizeDirection === 'corner' ? 'nesw-resize' : resizeDirection === 'right' ? 'ew-resize' : 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp, resizeDirection]);

  // Start resize
  const startResize = useCallback((e: React.MouseEvent, direction: 'right' | 'top' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  }, [size]);

  // Helper to get layer config (manifest or custom)
  const getLayerConfig = useCallback((layerId: string): AnyLayerConfig | undefined => {
    const manifestLayer = getLayerById(layerId);
    if (manifestLayer) return manifestLayer;
    return customLayers.find((l: AnyLayerConfig) => l.id === layerId);
  }, [customLayers]);

  // Group stats by layer group
  const groupedStats = useMemo(() => {
    const groups = new Map<
      LayerGroup,
      { layerId: string; name: string; stats: LayerStats | undefined; isCustom?: boolean; fillColor?: [number, number, number, number] }[]
    >();

    for (const layerId of activeLayers) {
      const layer = getLayerConfig(layerId);
      if (!layer) continue;

      // Use active area's layer data for stats
      const data = activeLayerData.get(layerId);
      const stats = data?.stats;
      const isCustom = 'isCustom' in layer && layer.isCustom;

      if (!groups.has(layer.group)) {
        groups.set(layer.group, []);
      }
      groups.get(layer.group)!.push({
        layerId,
        name: layer.name,
        stats,
        isCustom,
        fillColor: layer.style.fillColor,
      });
    }

    return groups;
  }, [activeLayerData, activeLayers, getLayerConfig]);

  const hasStats = Array.from(groupedStats.values()).some((layers) =>
    layers.some((l) => l.stats)
  );

  // Comparison data - stats for all areas grouped by layer
  const comparisonData = useMemo(() => {
    if (!canCompare) return null;

    const result: {
      groupId: LayerGroup;
      groupName: string;
      groupColor: [number, number, number];
      layers: {
        layerId: string;
        layerName: string;
        fillColor?: [number, number, number, number];
        areaStats: { areaId: string; areaName: string; areaColor: [number, number, number, number]; stats: LayerStats | undefined; areaSize: number }[];
      }[];
    }[] = [];

    // Get all layer groups that have data in any area
    const groupsWithData = new Set<LayerGroup>();
    for (const layerId of activeLayers) {
      const layer = getLayerConfig(layerId);
      if (!layer) continue;
      for (const area of areas) {
        if (area.layerData.get(layerId)?.stats) {
          groupsWithData.add(layer.group);
          break;
        }
      }
    }

    for (const groupId of groupsWithData) {
      const group = getGroupById(groupId);
      if (!group) continue;

      const layersInGroup = activeLayers
        .map((layerId: string) => getLayerConfig(layerId))
        .filter((layer: AnyLayerConfig | undefined): layer is AnyLayerConfig => layer !== undefined && layer.group === groupId);

      const layersWithAnyStats = layersInGroup.filter((layer: AnyLayerConfig) =>
        areas.some((area: ComparisonArea) => area.layerData.get(layer.id)?.stats)
      );

      if (layersWithAnyStats.length === 0) continue;

      result.push({
        groupId,
        groupName: group.name,
        groupColor: group.color,
        layers: layersWithAnyStats.map((layer: AnyLayerConfig) => ({
          layerId: layer.id,
          layerName: layer.name,
          fillColor: layer.style.fillColor,
          areaStats: areas.map((area: ComparisonArea) => ({
            areaId: area.id,
            areaName: area.name,
            areaColor: area.color,
            stats: area.layerData.get(layer.id)?.stats,
            areaSize: area.polygon.area,
          })),
        })),
      });
    }

    return result;
  }, [areas, activeLayers, getLayerConfig, canCompare]);

  // Toggle layer comparison mode and adjust panel width
  const toggleLayerComparisonMode = useCallback(() => {
    setIsLayerComparisonMode((prev) => {
      const newMode = !prev;
      if (newMode && size.width < COMPARISON_WIDTH) {
        setSize((s) => ({ ...s, width: COMPARISON_WIDTH }));
      }
      return newMode;
    });
  }, [size.width]);

  // Resize handle styles
  const resizeHandleStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: 'transparent',
  };

  const rightHandleStyle: React.CSSProperties = {
    ...resizeHandleStyle,
    right: -4,
    top: 0,
    width: 8,
    height: '100%',
    cursor: 'ew-resize',
  };

  const topHandleStyle: React.CSSProperties = {
    ...resizeHandleStyle,
    top: -4,
    left: 0,
    width: '100%',
    height: 8,
    cursor: 'ns-resize',
  };

  const cornerHandleStyle: React.CSSProperties = {
    ...resizeHandleStyle,
    top: -6,
    right: -6,
    width: 14,
    height: 14,
    cursor: 'nesw-resize',
    borderRadius: '2px',
  };

  // Mobile layout - rendered inside BottomSheet
  if (isMobile) {
    if (!selectionPolygon && !isLoading) {
      return (
        <div style={{ color: 'white', padding: '16px', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '14px' }}>
            Draw a selection area to see layer statistics
          </p>
        </div>
      );
    }

    return (
      <div style={{ color: 'white', fontSize: '14px' }}>
        {selectionPolygon && (
          <div
            style={{
              padding: '12px',
              backgroundColor: 'rgba(74, 144, 217, 0.2)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '14px',
            }}
          >
            Area: {formatArea(selectionPolygon.area)}
          </div>
        )}

        <button
          onClick={() => setExtractedViewOpen(!isExtractedViewOpen)}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: isExtractedViewOpen ? '#4A90D9' : 'rgba(74, 144, 217, 0.3)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: '500',
            marginBottom: '16px',
            minHeight: '48px',
          }}
        >
          {isExtractedViewOpen ? 'Hide 3D View' : 'Open 3D View'}
        </button>

        {isLoading && (
          <div
            style={{
              padding: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <div style={{ marginBottom: '8px' }}>Loading data...</div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>{loadingMessage}</div>
            <div
              style={{
                marginTop: '12px',
                height: '4px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  backgroundColor: '#4A90D9',
                  animation: 'loading 1.5s ease-in-out infinite',
                  width: '30%',
                }}
              />
            </div>
          </div>
        )}

        {hasStats && (
          <div>
            {Array.from(groupedStats.entries()).map(([groupId, layers]) => {
              const group = getGroupById(groupId);
              if (!group) return null;

              const layersWithStats = layers.filter((l) => l.stats);
              if (layersWithStats.length === 0) return null;

              return (
                <div key={groupId} style={{ marginBottom: '20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '12px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '3px',
                        backgroundColor: `rgb(${group.color.join(',')})`,
                      }}
                    />
                    <span style={{ fontWeight: '600', fontSize: '14px' }}>
                      {group.name}
                    </span>
                  </div>

                  {layersWithStats.map(({ layerId, name, stats, isCustom, fillColor }) => (
                    <LayerStatsRow
                      key={layerId}
                      layerId={layerId}
                      name={name}
                      stats={stats!}
                      isCustom={isCustom}
                      fillColor={fillColor}
                      isMobile
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Bottom offset to avoid overlapping with map controls (buttons ~45px + 10px bottom margin + extra spacing)
  const BOTTOM_OFFSET = 65;

  // Desktop layout
  if (!selectionPolygon && !isLoading) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: `${BOTTOM_OFFSET}px`,
          left: '10px',
          zIndex: 1000,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: 'white',
          padding: '16px',
          borderRadius: '8px',
          maxWidth: '320px',
          fontSize: '13px',
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
          Statistics
        </h3>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '12px' }}>
          Draw a selection area to see layer statistics
        </p>
      </div>
    );
  }

  // Cap max height at half viewport height
  const maxPanelHeight = Math.min(
    viewportHeight - BOTTOM_OFFSET - TOP_CONTROLS_HEIGHT,
    Math.floor(viewportHeight / 2)
  );

  return (
    <div
      ref={panelRef}
      className="panel-stats"
      style={{
        position: 'absolute',
        bottom: `${BOTTOM_OFFSET}px`,
        left: '10px',
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        width: size.width,
        height: Math.min(size.height, maxPanelHeight),
        minHeight: MIN_HEIGHT,
        maxHeight: maxPanelHeight,
        overflowY: 'auto',
        fontSize: '13px',
        boxSizing: 'border-box',
      }}
    >
      {/* Resize handles */}
      <div
        style={rightHandleStyle}
        onMouseDown={(e) => startResize(e, 'right')}
      />
      <div
        style={topHandleStyle}
        onMouseDown={(e) => startResize(e, 'top')}
      />
      <div
        style={cornerHandleStyle}
        onMouseDown={(e) => startResize(e, 'corner')}
      >
        {/* Corner indicator */}
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 8,
            height: 8,
            borderTop: '2px solid rgba(255,255,255,0.4)',
            borderRight: '2px solid rgba(255,255,255,0.4)',
            borderTopRightRadius: '2px',
          }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '14px' }}>
            {viewMode === 'analysis' ? 'Analysis' : isLayerComparisonMode ? 'Area Comparison' : 'Stats'}
          </h3>
          {!isLayerComparisonMode && activeArea && viewMode === 'layers' && (
            <div
              style={{
                fontSize: '11px',
                color: `rgba(${activeArea.color.slice(0, 3).join(',')}, 1)`,
                marginTop: '2px',
                fontWeight: '500',
              }}
            >
              {activeArea.name}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* View mode toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setViewMode('layers')}
              style={{
                padding: '3px 6px',
                backgroundColor: viewMode === 'layers' ? '#4A90D9' : 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '9px',
                fontWeight: '500',
              }}
              title="Layer statistics"
            >
              Layers
            </button>
            <button
              onClick={() => setViewMode('analysis')}
              style={{
                padding: '3px 6px',
                backgroundColor: viewMode === 'analysis' ? '#4A90D9' : 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '9px',
                fontWeight: '500',
              }}
              title="POI metrics and comparison"
            >
              Analysis
            </button>
          </div>
          {canCompare && viewMode === 'layers' && (
            <button
              onClick={toggleLayerComparisonMode}
              style={{
                padding: '3px 6px',
                backgroundColor: isLayerComparisonMode ? '#22C55E' : 'rgba(34, 197, 94, 0.3)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '9px',
                fontWeight: '500',
                whiteSpace: 'nowrap',
              }}
              title={isLayerComparisonMode ? 'Show single area' : 'Compare all areas'}
            >
              {isLayerComparisonMode ? 'Single' : 'Compare'}
            </button>
          )}
          <button
            onClick={() => setExtractedViewOpen(!isExtractedViewOpen)}
            style={{
              padding: '3px 6px',
              backgroundColor: isExtractedViewOpen ? '#4A90D9' : 'rgba(74, 144, 217, 0.3)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '9px',
              fontWeight: '500',
            }}
            title="Open extracted 3D view of selection"
          >
            3D
          </button>
          {areas.length > 0 && (
            <button
              onClick={() => setIsExportDialogOpen(true)}
              style={{
                padding: '3px 6px',
                backgroundColor: 'rgba(75, 192, 192, 0.3)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '9px',
                fontWeight: '500',
              }}
              title="Export report"
            >
              Export
            </button>
          )}
        </div>
      </div>

      {/* Area size - single mode shows active area, comparison mode shows all */}
      {!isLayerComparisonMode && selectionPolygon && (
        <div
          style={{
            padding: '8px',
            backgroundColor: 'rgba(74, 144, 217, 0.2)',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '12px',
          }}
        >
          Area: {formatArea(selectionPolygon.area)}
        </div>
      )}

      {isLoading && (
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            marginBottom: '12px',
          }}
        >
          <div style={{ marginBottom: '8px' }}>Loading data...</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>{loadingMessage}</div>
          <div
            style={{
              marginTop: '8px',
              height: '4px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                backgroundColor: '#4A90D9',
                animation: 'loading 1.5s ease-in-out infinite',
                width: '30%',
              }}
            />
          </div>
        </div>
      )}

      {/* Analysis View - Metrics for single area, Comparison for multiple */}
      {viewMode === 'analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Show ComparisonTable for multiple areas, MetricsPanel for single */}
          {canCompare ? (
            <>
              {/* Sort strategy and area reorder controls */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
              }}>
                {/* Sort strategy buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Sort:</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['manual', 'name', 'size'] as const).map((strategy) => (
                      <button
                        key={strategy}
                        onClick={() => setSortStrategy(strategy)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: sortStrategy === strategy ? '#4A90D9' : 'rgba(255,255,255,0.1)',
                          color: sortStrategy === strategy ? 'white' : 'rgba(255,255,255,0.7)',
                        }}
                      >
                        {strategy === 'manual' ? 'Manual' : strategy === 'name' ? 'Name' : 'Size'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Area reorder list (manual mode) */}
                {sortStrategy === 'manual' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {sortedAreas.map((area, idx) => (
                      <div
                        key={area.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 6px',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderRadius: '4px',
                          borderLeft: `3px solid rgba(${area.color.slice(0, 3).join(',')}, 0.8)`,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <button
                            onClick={() => moveArea(area.id, 'up')}
                            disabled={idx === 0}
                            style={{
                              padding: '0 4px',
                              fontSize: '8px',
                              lineHeight: '10px',
                              border: 'none',
                              borderRadius: '2px',
                              cursor: idx === 0 ? 'not-allowed' : 'pointer',
                              backgroundColor: idx === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
                              color: idx === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)',
                            }}
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveArea(area.id, 'down')}
                            disabled={idx === sortedAreas.length - 1}
                            style={{
                              padding: '0 4px',
                              fontSize: '8px',
                              lineHeight: '10px',
                              border: 'none',
                              borderRadius: '2px',
                              cursor: idx === sortedAreas.length - 1 ? 'not-allowed' : 'pointer',
                              backgroundColor: idx === sortedAreas.length - 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
                              color: idx === sortedAreas.length - 1 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)',
                            }}
                          >
                            ▼
                          </button>
                        </div>
                        <span style={{
                          fontSize: '11px',
                          color: `rgba(${area.color.slice(0, 3).join(',')}, 1)`,
                          fontWeight: '500',
                        }}>
                          {area.name}
                        </span>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                          {formatAreaCompact(area.polygon.area)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <ComparisonTable
                sortedAreas={sortedAreas}
                onExport={() => {
                  const exportAreas = areas.map((area: ComparisonArea) => {
                    const areaKm2 = area.polygon.area / 1_000_000;
                    const areaLayerData = area.layerData.size > 0 ? area.layerData : layerData;
                    return {
                      name: area.name,
                      metrics: calculatePOIMetrics(areaLayerData, areaKm2),
                      derivedMetrics: calculateDerivedMetrics(
                        areaLayerData,
                        areaKm2,
                        area.polygon.geometry as Polygon
                      ),
                    };
                  });
                  if (exportAreas.length > 0) {
                    exportMetrics(exportAreas);
                  }
                }}
              />
              <ComparisonGuidance collapsed />
            </>
          ) : (
            <>
              <MetricsPanel />
              {/* Export Button */}
              <button
                onClick={() => {
                  let exportAreas: ExportArea[];
                  if (areas.length > 0) {
                    exportAreas = areas.map((area: ComparisonArea) => {
                      const areaKm2 = area.polygon.area / 1_000_000;
                      const areaLayerData = area.layerData.size > 0 ? area.layerData : layerData;
                      return {
                        name: area.name,
                        metrics: calculatePOIMetrics(areaLayerData, areaKm2),
                        derivedMetrics: calculateDerivedMetrics(
                          areaLayerData,
                          areaKm2,
                          area.polygon.geometry as Polygon
                        ),
                      };
                    });
                  } else if (selectionPolygon) {
                    const areaKm2 = calculatePolygonArea(selectionPolygon.geometry as Polygon);
                    exportAreas = [{
                      name: 'Selected Area',
                      metrics: calculatePOIMetrics(layerData, areaKm2),
                      derivedMetrics: calculateDerivedMetrics(
                        layerData,
                        areaKm2,
                        selectionPolygon.geometry as Polygon
                      ),
                    }];
                  } else {
                    exportAreas = [];
                  }
                  if (exportAreas.length > 0) {
                    exportMetrics(exportAreas);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'rgba(75, 192, 192, 0.3)',
                  border: '1px solid rgba(75, 192, 192, 0.5)',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>Export CSV</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Comparison Mode View */}
      {viewMode === 'layers' && isLayerComparisonMode && comparisonData && (
        <div>
          {/* Area size comparison header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `100px repeat(${areas.length}, 1fr)`,
              gap: '8px',
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: '600' }}>Area Size</div>
            {areas.map((area: ComparisonArea) => (
              <div
                key={area.id}
                style={{
                  fontSize: '10px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    color: `rgba(${area.color.slice(0, 3).join(',')}, 1)`,
                    fontWeight: '600',
                    marginBottom: '2px',
                  }}
                >
                  {area.name}
                </div>
                <div style={{ opacity: 0.8 }}>{formatArea(area.polygon.area)}</div>
              </div>
            ))}
          </div>

          {/* Layer stats comparison */}
          {comparisonData.map(({ groupId, groupName, groupColor, layers }) => (
            <div key={groupId} style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  paddingBottom: '4px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: `rgb(${groupColor.join(',')})`,
                  }}
                />
                <span style={{ fontWeight: '600', fontSize: '12px' }}>{groupName}</span>
              </div>

              {layers.map(({ layerId, layerName, areaStats }) => (
                <ComparisonRow
                  key={layerId}
                  layerName={layerName}
                  areaStats={areaStats}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Single Area View */}
      {viewMode === 'layers' && !isLayerComparisonMode && hasStats && (
        <div>
          {Array.from(groupedStats.entries()).map(([groupId, layers]) => {
            const group = getGroupById(groupId);
            if (!group) return null;

            const layersWithStats = layers.filter((l) => l.stats);
            if (layersWithStats.length === 0) return null;

            return (
              <div key={groupId} style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    paddingBottom: '4px',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '2px',
                      backgroundColor: `rgb(${group.color.join(',')})`,
                    }}
                  />
                  <span style={{ fontWeight: '600', fontSize: '12px' }}>
                    {group.name}
                  </span>
                </div>

                {layersWithStats.map(({ layerId, name, stats, isCustom, fillColor }) => (
                  <LayerStatsRow
                    key={layerId}
                    layerId={layerId}
                    name={name}
                    stats={stats!}
                    isCustom={isCustom}
                    fillColor={fillColor}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        areas={areas}
        activeLayers={activeLayers}
      />
    </div>
  );
}

function LayerStatsRow({
  layerId,
  name,
  stats,
  isCustom,
  fillColor,
  isMobile = false,
}: {
  layerId: string;
  name: string;
  stats: LayerStats;
  isCustom?: boolean;
  fillColor?: [number, number, number, number];
  isMobile?: boolean;
}) {
  const layer = getLayerById(layerId);
  const color = fillColor || layer?.style.fillColor || [180, 180, 180, 200];

  return (
    <div
      style={{
        padding: isMobile ? '12px' : '8px',
        marginBottom: isMobile ? '8px' : '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: isMobile ? '8px' : '4px',
        borderLeft: `4px solid rgba(${color.slice(0, 3).join(',')}, 0.8)`,
      }}
    >
      <div style={{ fontWeight: '500', marginBottom: '6px', fontSize: isMobile ? '14px' : '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {name}
        {isCustom && (
          <span
            style={{
              fontSize: isMobile ? '10px' : '9px',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              padding: '2px 6px',
              borderRadius: '4px',
              opacity: 0.7,
            }}
          >
            Custom
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: isMobile ? '8px' : '4px',
          fontSize: isMobile ? '13px' : '11px',
          opacity: 0.8,
        }}
      >
        {stats.count !== undefined && (
          <StatItem label="Count" value={stats.count.toLocaleString()} />
        )}
        {stats.density !== undefined && (
          <StatItem
            label="Density"
            value={`${stats.density.toFixed(1)}/km²`}
          />
        )}
        {stats.totalLength !== undefined && (
          <StatItem label="Length" value={formatLength(stats.totalLength)} />
        )}
        {stats.totalArea !== undefined && (
          <StatItem label="Area" value={formatAreaM2(stats.totalArea)} />
        )}
        {stats.areaShare !== undefined && (
          <StatItem label="Coverage" value={`${stats.areaShare.toFixed(1)}%`} />
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ opacity: 0.6 }}>{label}:</span>{' '}
      <span style={{ fontWeight: '500' }}>{value}</span>
    </div>
  );
}

// Comparison row for multi-area view
function ComparisonRow({
  layerName,
  areaStats,
}: {
  layerName: string;
  areaStats: {
    areaId: string;
    areaName: string;
    areaColor: [number, number, number, number];
    stats: LayerStats | undefined;
    areaSize: number;
  }[];
}) {
  // Find max values for highlighting
  const counts = areaStats.map((a) => a.stats?.count ?? 0);
  const maxCount = Math.max(...counts);
  const densities = areaStats.map((a) => a.stats?.density ?? 0);
  const maxDensity = Math.max(...densities);

  return (
    <div
      style={{
        padding: '8px',
        marginBottom: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '4px',
      }}
    >
      <div style={{ fontWeight: '500', marginBottom: '8px', fontSize: '11px' }}>
        {layerName}
      </div>

      {/* Stats comparison grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `70px repeat(${areaStats.length}, 1fr)`,
          gap: '4px',
          fontSize: '10px',
        }}
      >
        {/* Count row */}
        <div style={{ opacity: 0.6, alignSelf: 'center' }}>Count</div>
        {areaStats.map((area) => {
          const count = area.stats?.count ?? 0;
          const isMax = count === maxCount && maxCount > 0;
          return (
            <div
              key={`${area.areaId}-count`}
              style={{
                textAlign: 'center',
                padding: '4px',
                backgroundColor: isMax ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                borderRadius: '3px',
                borderLeft: `3px solid rgba(${area.areaColor.slice(0, 3).join(',')}, 0.8)`,
              }}
            >
              <span style={{ fontWeight: isMax ? '600' : '400' }}>
                {area.stats?.count?.toLocaleString() ?? '-'}
              </span>
            </div>
          );
        })}

        {/* Density row */}
        <div style={{ opacity: 0.6, alignSelf: 'center' }}>Density</div>
        {areaStats.map((area) => {
          const density = area.stats?.density ?? 0;
          const isMax = density === maxDensity && maxDensity > 0;
          return (
            <div
              key={`${area.areaId}-density`}
              style={{
                textAlign: 'center',
                padding: '4px',
                backgroundColor: isMax ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                borderRadius: '3px',
                borderLeft: `3px solid rgba(${area.areaColor.slice(0, 3).join(',')}, 0.8)`,
              }}
            >
              <span style={{ fontWeight: isMax ? '600' : '400' }}>
                {area.stats?.density !== undefined ? `${area.stats.density.toFixed(1)}/km²` : '-'}
              </span>
            </div>
          );
        })}

        {/* Length row (if applicable) */}
        {areaStats.some((a) => a.stats?.totalLength !== undefined) && (
          <>
            <div style={{ opacity: 0.6, alignSelf: 'center' }}>Length</div>
            {areaStats.map((area) => {
              const lengths = areaStats.map((a) => a.stats?.totalLength ?? 0);
              const maxLength = Math.max(...lengths);
              const length = area.stats?.totalLength ?? 0;
              const isMax = length === maxLength && maxLength > 0;
              return (
                <div
                  key={`${area.areaId}-length`}
                  style={{
                    textAlign: 'center',
                    padding: '4px',
                    backgroundColor: isMax ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '3px',
                    borderLeft: `3px solid rgba(${area.areaColor.slice(0, 3).join(',')}, 0.8)`,
                  }}
                >
                  <span style={{ fontWeight: isMax ? '600' : '400' }}>
                    {area.stats?.totalLength !== undefined
                      ? formatLengthShort(area.stats.totalLength)
                      : '-'}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* Coverage row (if applicable) */}
        {areaStats.some((a) => a.stats?.areaShare !== undefined) && (
          <>
            <div style={{ opacity: 0.6, alignSelf: 'center' }}>Coverage</div>
            {areaStats.map((area) => {
              const coverages = areaStats.map((a) => a.stats?.areaShare ?? 0);
              const maxCoverage = Math.max(...coverages);
              const coverage = area.stats?.areaShare ?? 0;
              const isMax = coverage === maxCoverage && maxCoverage > 0;
              return (
                <div
                  key={`${area.areaId}-coverage`}
                  style={{
                    textAlign: 'center',
                    padding: '4px',
                    backgroundColor: isMax ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '3px',
                    borderLeft: `3px solid rgba(${area.areaColor.slice(0, 3).join(',')}, 0.8)`,
                  }}
                >
                  <span style={{ fontWeight: isMax ? '600' : '400' }}>
                    {area.stats?.areaShare !== undefined ? `${area.stats.areaShare.toFixed(1)}%` : '-'}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// Short format for comparison view
function formatLengthShort(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(0)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatArea(areaM2: number): string {
  const areaKm2 = areaM2 / 1_000_000;
  const areaHa = areaKm2 * 100;
  const areaAcres = areaM2 * 0.000247105; // 1 m² = 0.000247105 acres
  const areaSqFt = areaM2 * 10.7639;

  if (areaKm2 < 0.01) {
    return `${areaM2.toFixed(0)} m² (${areaSqFt.toFixed(0)} sq ft)`;
  }
  if (areaKm2 < 1) {
    return `${areaHa.toFixed(2)} ha (${areaAcres.toFixed(2)} acres)`;
  }
  return `${areaKm2.toFixed(2)} km² (${areaAcres.toFixed(0)} acres)`;
}

function formatAreaM2(areaM2: number): string {
  const areaSqFt = areaM2 * 10.7639;
  const areaAcres = areaM2 * 0.000247105;

  if (areaM2 < 1000) {
    return `${areaM2.toFixed(0)} m² (${areaSqFt.toFixed(0)} sq ft)`;
  }
  if (areaM2 < 10000) {
    return `${(areaM2 / 1000).toFixed(1)}k m² (${areaAcres.toFixed(2)} acres)`;
  }
  return `${(areaM2 / 1_000_000).toFixed(3)} km² (${areaAcres.toFixed(1)} acres)`;
}

function formatLength(meters: number): string {
  const feet = meters * 3.28084;
  const miles = meters * 0.000621371;

  if (meters < 1000) {
    return `${meters.toFixed(0)} m (${feet.toFixed(0)} ft)`;
  }
  return `${(meters / 1000).toFixed(2)} km (${miles.toFixed(2)} mi)`;
}

// Compact area format for reorder list
function formatAreaCompact(areaM2: number): string {
  const areaKm2 = areaM2 / 1_000_000;
  const areaHa = areaKm2 * 100;

  if (areaKm2 < 0.01) {
    return `${areaM2.toFixed(0)} m²`;
  }
  if (areaKm2 < 1) {
    return `${areaHa.toFixed(1)} ha`;
  }
  return `${areaKm2.toFixed(2)} km²`;
}

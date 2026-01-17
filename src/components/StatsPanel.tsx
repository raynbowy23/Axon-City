import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { getLayerById, getGroupById } from '../data/layerManifest';
import type { LayerStats, LayerGroup } from '../types';

// Size constraints
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 800;
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 400;

// LocalStorage key
const STORAGE_KEY = 'axoncity-stats-panel-size';

interface PanelSize {
  width: number;
  height: number;
}

function loadSavedSize(): PanelSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width || DEFAULT_WIDTH)),
        height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed.height || DEFAULT_HEIGHT)),
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

function saveSize(size: PanelSize): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Ignore storage errors
  }
}

export function StatsPanel() {
  const { layerData, activeLayers, selectionPolygon, isLoading, loadingMessage, setExtractedViewOpen, isExtractedViewOpen } = useStore();

  // Panel size state
  const [size, setSize] = useState<PanelSize>(loadSavedSize);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<'right' | 'top' | 'corner' | null>(null);
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
      newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startPosRef.current.height + deltaY));
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

  // Group stats by layer group
  const groupedStats = useMemo(() => {
    const groups = new Map<
      LayerGroup,
      { layerId: string; name: string; stats: LayerStats | undefined }[]
    >();

    for (const layerId of activeLayers) {
      const layer = getLayerById(layerId);
      if (!layer) continue;

      const data = layerData.get(layerId);
      const stats = data?.stats;

      if (!groups.has(layer.group)) {
        groups.set(layer.group, []);
      }
      groups.get(layer.group)!.push({
        layerId,
        name: layer.name,
        stats,
      });
    }

    return groups;
  }, [layerData, activeLayers]);

  const hasStats = Array.from(groupedStats.values()).some((layers) =>
    layers.some((l) => l.stats)
  );

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

  if (!selectionPolygon && !isLoading) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
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

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        width: size.width,
        height: size.height,
        maxHeight: `calc(100vh - 40px)`,
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>
          Selection Statistics
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setExtractedViewOpen(!isExtractedViewOpen)}
            style={{
              padding: '4px 10px',
              backgroundColor: isExtractedViewOpen ? '#4A90D9' : 'rgba(74, 144, 217, 0.3)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500',
            }}
            title="Open extracted 3D view of selection"
          >
            {isExtractedViewOpen ? 'Hide 3D' : 'Extract 3D'}
          </button>
          <span style={{ fontSize: '10px', opacity: 0.5 }}>
            {size.width}×{size.height}
          </span>
        </div>
      </div>

      {selectionPolygon && (
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

      {hasStats && (
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

                {layersWithStats.map(({ layerId, name, stats }) => (
                  <LayerStatsRow key={layerId} layerId={layerId} name={name} stats={stats!} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LayerStatsRow({
  layerId,
  name,
  stats,
}: {
  layerId: string;
  name: string;
  stats: LayerStats;
}) {
  const layer = getLayerById(layerId);
  if (!layer) return null;

  return (
    <div
      style={{
        padding: '8px',
        marginBottom: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '4px',
        borderLeft: `3px solid rgba(${layer.style.fillColor.slice(0, 3).join(',')}, 0.8)`,
      }}
    >
      <div style={{ fontWeight: '500', marginBottom: '4px', fontSize: '12px' }}>
        {name}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '4px',
          fontSize: '11px',
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

function formatArea(areaM2: number): string {
  const areaKm2 = areaM2 / 1_000_000;
  if (areaKm2 < 0.01) {
    return `${areaM2.toFixed(0)} m²`;
  }
  if (areaKm2 < 1) {
    return `${(areaKm2 * 100).toFixed(2)} ha`;
  }
  return `${areaKm2.toFixed(2)} km²`;
}

function formatAreaM2(areaM2: number): string {
  if (areaM2 < 1000) {
    return `${areaM2.toFixed(0)} m²`;
  }
  if (areaM2 < 10000) {
    return `${(areaM2 / 1000).toFixed(1)}k m²`;
  }
  return `${(areaM2 / 1_000_000).toFixed(3)} km²`;
}

function formatLength(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(0)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

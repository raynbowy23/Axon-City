import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { getLayerById, getGroupById } from '../data/layerManifest';
import type { LayerStats, LayerGroup } from '../types';

export function StatsPanel() {
  const { layerData, activeLayers, selectionPolygon, isLoading, loadingMessage } = useStore();

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

  if (!selectionPolygon && !isLoading) {
    return (
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
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
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        maxWidth: '360px',
        maxHeight: '50vh',
        overflowY: 'auto',
        fontSize: '13px',
      }}
    >
      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
        Selection Statistics
      </h3>

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

/**
 * Growth panel (novelty track N4 — Time Machine, v0).
 *
 * "Show growth since 2010" → fetches the area's ohsome history and renders a
 * sparkline + delta per metric ("+537 buildings, +55 km of streets"). Honest
 * by construction: labeled "as mapped in OSM" because the series reflect
 * mapping activity as well as real-world change.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { fetchGrowthSeries, type GrowthData } from '../utils/ohsomeFetcher';
import { Sparkline } from './Sparkline';
import type { Polygon, MultiPolygon } from 'geojson';

interface GrowthPanelProps {
  isMobile?: boolean;
}

function geometryBbox(geometry: Polygon | MultiPolygon): [number, number, number, number] | null {
  const positions: number[][] =
    geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of positions) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : null;
}

function formatDelta(delta: number, unit: string): string {
  const sign = delta > 0 ? '+' : '';
  const n = unit ? delta.toFixed(1) : String(Math.round(delta));
  return `${sign}${n}${unit ? ` ${unit}` : ''}`;
}

export function GrowthPanel({ isMobile = false }: GrowthPanelProps) {
  const areas = useStore((s) => s.areas);
  const activeAreaId = useStore((s) => s.activeAreaId);
  const selectionPolygon = useStore((s) => s.selectionPolygon);

  const geometry = useMemo<Polygon | MultiPolygon | null>(() => {
    const active = areas.find((a) => a.id === activeAreaId);
    return (active?.polygon.geometry ?? selectionPolygon?.geometry ?? null) as Polygon | MultiPolygon | null;
  }, [areas, activeAreaId, selectionPolygon]);

  const bbox = useMemo(() => (geometry ? geometryBbox(geometry) : null), [geometry]);
  const bboxKey = bbox ? bbox.join(',') : null;

  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset when the area changes.
  useEffect(() => {
    setGrowth(null);
    setError(null);
  }, [bboxKey]);

  const load = useCallback(async () => {
    if (!bbox) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGrowthSeries(bbox, ac.signal);
      if (ac.signal.aborted) return;
      if (data.metrics.length === 0) setError('No OSM history available for this area.');
      else setGrowth(data);
    } catch {
      if (!ac.signal.aborted) setError("Couldn't reach the ohsome history service.");
    } finally {
      if (abortRef.current === ac) setLoading(false);
    }
  }, [bbox]);

  if (!bbox) return null;

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>⏳ Growth</span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>as mapped in OSM</span>
      </div>

      {!growth && (
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 10px',
            backgroundColor: loading ? 'rgba(255,255,255,0.08)' : 'rgba(120,200,255,0.15)',
            border: '1px solid rgba(120,200,255,0.4)',
            borderRadius: '6px',
            color: loading ? 'rgba(255,255,255,0.6)' : 'rgb(150,210,255)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {loading && (
            <span style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          )}
          {loading ? 'Loading history…' : 'Show growth since 2010'}
        </button>
      )}

      {error && <div style={{ fontSize: '11px', color: 'rgba(255,200,100,0.8)' }}>{error}</div>}

      {growth && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {growth.metrics.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', width: isMobile ? '78px' : '88px', flexShrink: 0 }}>
                {m.label}
              </span>
              <Sparkline values={m.series.map((p) => p.value)} width={isMobile ? 90 : 110} height={26} />
              <span
                style={{
                  fontSize: '12px',
                  marginLeft: 'auto',
                  flexShrink: 0,
                  color: m.delta > 0 ? 'rgb(120,220,150)' : 'rgba(255,255,255,0.6)',
                  fontWeight: 600,
                }}
              >
                {formatDelta(m.delta, m.unit)}
              </span>
            </div>
          ))}
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
            {growth.startYear}–{growth.endYear}. Reflects OSM <em>mapping activity</em> as well as real-world
            change — a bulk import can look like a sudden boom.
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

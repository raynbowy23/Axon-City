/**
 * City DNA section (novelty track N2) for the stats panel.
 *
 * Reads the store like MetricsPanel and renders the DNA glyph plus a legend:
 * a single area shows a labelled glyph + trait chips; multiple areas overlay
 * their glyphs with per-area colors for an instant visual diff.
 */

import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';
import { computeCityDna, DNA_DIMENSIONS, type CityDna } from '../utils/cityDna';
import { missingDnaLayers, fetchAreaLayers } from '../utils/cityDnaFetch';
import { DnaGlyph, type DnaGlyphVector } from './DnaGlyph';
import type { Polygon } from 'geojson';
import type { ComparisonArea } from '../types';

interface CityDnaSectionProps {
  isMobile?: boolean;
}

interface AreaDna {
  id: string;
  name: string;
  color: [number, number, number];
  dna: CityDna;
}

const DEFAULT_COLOR: [number, number, number] = [74, 144, 217];

export function CityDnaSection({ isMobile = false }: CityDnaSectionProps) {
  const { areas, layerData, selectionPolygon } = useStore();
  const updateAreaLayerData = useStore((s) => s.updateAreaLayerData);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // DNA layers missing across the comparison areas (legacy single-area mode
  // back-fills via the app's own auto-fetch, so we only offer this for areas).
  const missingCount = useMemo(() => {
    const ids = new Set<string>();
    for (const a of areas) missingDnaLayers(a).forEach((id) => ids.add(id));
    return ids.size;
  }, [areas]);

  const loadMissingLayers = useCallback(async () => {
    setLoadingLayers(true);
    try {
      for (const area of areas) {
        const missing = missingDnaLayers(area);
        if (missing.length === 0) continue;
        const fetched = await fetchAreaLayers(area, missing);
        for (const [layerId, data] of fetched) {
          updateAreaLayerData(area.id, layerId, data);
        }
      }
    } catch (err) {
      console.error('Failed to load DNA layers:', err);
    } finally {
      setLoadingLayers(false);
    }
  }, [areas, updateAreaLayerData]);

  const areaDnas = useMemo<AreaDna[]>(() => {
    // Legacy single-area mode (no comparison areas yet).
    if (areas.length === 0 && selectionPolygon) {
      const areaKm2 = calculatePolygonArea(selectionPolygon.geometry as Polygon);
      return [
        {
          id: 'single',
          name: 'Selected Area',
          color: DEFAULT_COLOR,
          dna: computeCityDna(layerData, areaKm2, selectionPolygon.geometry as Polygon),
        },
      ];
    }

    return areas.map((area: ComparisonArea) => {
      const areaKm2 = area.polygon.area / 1_000_000;
      const ld = area.layerData.size > 0 ? area.layerData : layerData;
      return {
        id: area.id,
        name: area.name,
        color: area.color.slice(0, 3) as [number, number, number],
        dna: computeCityDna(ld, areaKm2, area.polygon.geometry as Polygon),
      };
    });
  }, [areas, layerData, selectionPolygon]);

  // Nothing meaningful to show yet.
  if (areaDnas.length === 0) return null;
  const hasSignal = areaDnas.some((a) => a.dna.vector.some((v) => v > 0.01));
  if (!hasSignal) return null;

  const vectors: DnaGlyphVector[] = areaDnas.map((a) => ({
    values: a.dna.vector,
    color: a.color,
    label: a.name,
  }));

  const glyphSize = isMobile ? 200 : 230;

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
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'white' }}>City DNA</span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>spatial signature</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DnaGlyph vectors={vectors} size={glyphSize} showLabels interactive onExpand={() => setExpanded(true)} />
      </div>
      <div style={{ textAlign: 'center', fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
        hover a spoke for values · click to expand
      </div>

      {/* Legend / traits */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {areaDnas.map((a) => {
          const missing = DNA_DIMENSIONS.filter((_, i) => !a.dna.available[i]).map((d) => d.short);
          return (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: `rgb(${a.color.join(',')})`,
                  }}
                />
                <span style={{ fontSize: '12px', color: 'white', flexShrink: 0 }}>{a.name}</span>
                {a.dna.traits.length > 0 && (
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
                    {a.dna.traits.join(' · ')}
                  </span>
                )}
              </div>
              {missing.length > 0 && (
                <span style={{ fontSize: '10px', color: 'rgba(255,200,100,0.7)', paddingLeft: '18px' }}>
                  ⚠ not loaded: {missing.join(', ')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Complete the DNA layer set for comparison areas on demand. */}
      {areas.length > 0 && missingCount > 0 && (
        <button
          onClick={loadMissingLayers}
          disabled={loadingLayers}
          style={{
            padding: '8px 10px',
            backgroundColor: loadingLayers ? 'rgba(255,255,255,0.08)' : 'rgba(255,200,100,0.15)',
            border: '1px solid rgba(255,200,100,0.4)',
            borderRadius: '6px',
            color: loadingLayers ? 'rgba(255,255,255,0.6)' : 'rgb(255,210,130)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: loadingLayers ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {loadingLayers && (
            <span
              style={{
                width: '12px',
                height: '12px',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          )}
          {loadingLayers
            ? 'Loading layers…'
            : `Load ${missingCount} missing layer${missingCount > 1 ? 's' : ''} for full DNA`}
        </button>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Dev-only calibration readout (stripped from production builds) */}
      {import.meta.env.DEV && (
        <details style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
          <summary style={{ cursor: 'pointer' }}>DNA debug values</summary>
          {areaDnas.map((a) => (
            <div key={a.id} style={{ marginTop: '6px' }}>
              <div style={{ color: `rgb(${a.color.join(',')})`, fontWeight: 600 }}>{a.name}</div>
              <pre style={{ margin: '2px 0', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace' }}>
                {DNA_DIMENSIONS.map((d, i) => `${d.short.padEnd(9)} ${a.dna.vector[i].toFixed(2)}`).join('\n')}
                {'\n— inputs —\n'}
                {Object.entries(a.dna.debug)
                  .map(([k, v]) => `${k.padEnd(26)} ${v}`)
                  .join('\n')}
              </pre>
            </div>
          ))}
        </details>
      )}

      {/* Expanded popup: large glyph + per-dimension breakdown */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: '12px',
              padding: '24px',
              width: '560px',
              maxWidth: '94vw',
              maxHeight: '92vh',
              overflowY: 'auto',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>City DNA</span>
              <button
                onClick={() => setExpanded(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DnaGlyph vectors={vectors} size={360} showLabels interactive />
            </div>

            {/* Per-dimension breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {DNA_DIMENSIONS.map((dim, i) => (
                <div key={dim.id}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', marginBottom: '4px' }}>
                    {dim.label}
                  </div>
                  {areaDnas.map((a) => {
                    const val = a.dna.vector[i] ?? 0;
                    const unavailable = !a.dna.available[i];
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', width: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {a.name}
                        </span>
                        <div style={{ flex: 1, height: '8px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                          {!unavailable && (
                            <div style={{ width: `${Math.round(val * 100)}%`, height: '100%', backgroundColor: `rgb(${a.color.join(',')})`, borderRadius: '4px' }} />
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: unavailable ? 'rgba(255,200,100,0.7)' : 'white', width: '38px', textAlign: 'right', flexShrink: 0 }}>
                          {unavailable ? 'n/a' : Math.round(val * 100)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

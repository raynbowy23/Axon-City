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
import { computeCityDna, DNA_DIMENSIONS, DNA_LAYER_IDS, type CityDna } from '../utils/cityDna';
import { missingDnaLayers, fetchAreaLayers } from '../utils/cityDnaFetch';
import { normalizeDnaPercentile, corpusReady, mostSimilar, type SimilarityMatch, type CorpusEntry } from '../utils/dnaNormalize';
import { composeDnaCard, type DnaCardVector } from '../utils/dnaCardComposer';
import { loadPosterFonts } from '../utils/posterFonts';
import { posterToBlob, downloadPoster } from '../utils/posterComposer';
import { trackEvent } from '../utils/analytics';
import { DnaGlyph, type DnaGlyphVector } from './DnaGlyph';
import type { Polygon } from 'geojson';
import { MAX_COMPARISON_AREAS, type ComparisonArea, type SelectionPolygon } from '../types';

interface CityDnaSectionProps {
  isMobile?: boolean;
}

interface AreaDna {
  id: string;
  name: string;
  color: [number, number, number];
  dna: CityDna;
  similar: SimilarityMatch[];
}

const DEFAULT_COLOR: [number, number, number] = [74, 144, 217];

export function CityDnaSection({ isMobile = false }: CityDnaSectionProps) {
  const { areas, layerData, selectionPolygon } = useStore();
  const updateAreaLayerData = useStore((s) => s.updateAreaLayerData);
  const [loadingLayers, setLoadingLayers] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [exportingCard, setExportingCard] = useState(false);
  const [comparingName, setComparingName] = useState<string | null>(null);
  const [compareNote, setCompareNote] = useState<string | null>(null);

  // Fly the map to a corpus neighborhood's bbox (the similarity curiosity loop).
  const flyTo = useCallback((bbox: [number, number, number, number]) => {
    const [w, s, e, n] = bbox;
    const span = Math.max(e - w, n - s) || 0.01;
    const zoom = Math.max(11, Math.min(16, Math.log2(360 / span) - 1.2));
    const cur = useStore.getState().viewState;
    useStore.getState().setViewState({ ...cur, longitude: (w + e) / 2, latitude: (s + n) / 2, zoom });
    setExpanded(false);
  }, []);

  // Fly to a corpus neighborhood AND add it as a named comparison area, then
  // fetch its DNA layers (one batched request, often cached) so it joins the
  // glyph + metrics side by side.
  const compareWith = useCallback(async (entry: CorpusEntry) => {
    flyTo(entry.bbox);
    const store = useStore.getState();
    if (store.areas.length >= MAX_COMPARISON_AREAS) {
      setCompareNote(`Max ${MAX_COMPARISON_AREAS} areas — remove one to compare with ${entry.name}.`);
      setTimeout(() => setCompareNote(null), 4000);
      return;
    }

    const [w, s, e, n] = entry.bbox;
    const geometry: Polygon = { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
    const polygon: SelectionPolygon = {
      id: `corpus-${entry.name}-${Date.now()}`,
      geometry,
      area: calculatePolygonArea(geometry) * 1_000_000, // m²
      shapeType: 'rectangle',
    };

    const newId = store.addArea(polygon);
    if (!newId) return;
    store.renameArea(newId, `${entry.name}, ${entry.city}`);

    setComparingName(entry.name);
    try {
      const area = useStore.getState().areas.find((a) => a.id === newId);
      if (area) {
        const fetched = await fetchAreaLayers(area, DNA_LAYER_IDS);
        for (const [layerId, data] of fetched) useStore.getState().updateAreaLayerData(newId, layerId, data);
      }
    } catch (err) {
      console.error('Failed to load comparison area:', err);
    } finally {
      setComparingName(null);
    }
  }, [flyTo]);

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
    // Use corpus percentile normalization once the corpus is populated; else
    // fall back to the provisional fixed scales.
    const normalize = corpusReady ? normalizeDnaPercentile : undefined;
    const withSimilarity = (dna: CityDna): SimilarityMatch[] =>
      corpusReady ? mostSimilar(dna.vector, 3) : [];

    // Legacy single-area mode (no comparison areas yet).
    if (areas.length === 0 && selectionPolygon) {
      const areaKm2 = calculatePolygonArea(selectionPolygon.geometry as Polygon);
      const dna = computeCityDna(layerData, areaKm2, selectionPolygon.geometry as Polygon, normalize);
      return [{ id: 'single', name: 'Selected Area', color: DEFAULT_COLOR, dna, similar: withSimilarity(dna) }];
    }

    return areas.map((area: ComparisonArea) => {
      const areaKm2 = area.polygon.area / 1_000_000;
      const ld = area.layerData.size > 0 ? area.layerData : layerData;
      const dna = computeCityDna(ld, areaKm2, area.polygon.geometry as Polygon, normalize);
      return {
        id: area.id,
        name: area.name,
        color: area.color.slice(0, 3) as [number, number, number],
        dna,
        similar: withSimilarity(dna),
      };
    });
  }, [areas, layerData, selectionPolygon]);

  // Compose + download a square DNA share card.
  const handleDownloadCard = useCallback(async () => {
    if (areaDnas.length === 0) return;
    setExportingCard(true);
    try {
      await loadPosterFonts();
      const cardVectors: DnaCardVector[] = areaDnas.map((a) => ({
        values: a.dna.vector,
        color: a.color,
        label: a.name,
      }));
      const primary = areaDnas[0];
      const top = primary.similar[0];
      const canvas = composeDnaCard({
        title: areaDnas.length === 1 ? primary.name : 'City DNA',
        vectors: cardVectors,
        traitLine: primary.dna.traits.join(' · ') || undefined,
        similarLine: top ? `Most like ${top.entry.name}, ${top.entry.city} (${Math.round(top.similarity * 100)}%)` : undefined,
      });
      const blob = await posterToBlob(canvas);
      if (blob) {
        const slug = (areaDnas.length === 1 ? primary.name : 'city-dna')
          .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'city-dna';
        downloadPoster(blob, `axoncity-dna-${slug}.png`);
        trackEvent('export', { format: 'dna_card', areas: areaDnas.length });
      }
    } catch (err) {
      console.error('DNA card export failed:', err);
    } finally {
      setExportingCard(false);
    }
  }, [areaDnas]);

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
      {comparingName && (
        <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(120,180,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Loading {comparingName}…
        </div>
      )}
      {compareNote && (
        <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,200,100,0.8)' }}>{compareNote}</div>
      )}

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
              {a.similar.length > 0 && (
                <button
                  onClick={() => compareWith(a.similar[0].entry)}
                  disabled={comparingName !== null}
                  title={`Fly to ${a.similar[0].entry.name} and add as comparison`}
                  style={{
                    alignSelf: 'flex-start',
                    marginLeft: '18px',
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: comparingName ? 'wait' : 'pointer',
                    fontSize: '11px',
                    color: 'rgba(120,180,255,0.85)',
                    textAlign: 'left',
                  }}
                >
                  ≈ {a.similar[0].entry.name}, {a.similar[0].entry.city}{' '}
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                    ({Math.round(a.similar[0].similarity * 100)}%) · compare +
                  </span>
                </button>
              )}
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

            {/* Most similar corpus neighborhoods */}
            {areaDnas.some((a) => a.similar.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {areaDnas.map((a) =>
                  a.similar.length === 0 ? null : (
                    <div key={a.id} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                      <span style={{ color: `rgb(${a.color.join(',')})`, fontWeight: 600 }}>{a.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}> is most like: </span>
                      {a.similar.map((m, mi) => (
                        <span key={m.entry.name}>
                          {mi > 0 && ', '}
                          <button
                            onClick={() => compareWith(m.entry)}
                            disabled={comparingName !== null}
                            title={`Fly to ${m.entry.name}, ${m.entry.city} and add as comparison`}
                            style={{
                              padding: 0,
                              background: 'none',
                              border: 'none',
                              cursor: comparingName ? 'wait' : 'pointer',
                              fontSize: '12px',
                              color: 'rgba(120,180,255,0.9)',
                            }}
                          >
                            {m.entry.name} ({Math.round(m.similarity * 100)}%)
                          </button>
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

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

            {/* Share card */}
            <button
              onClick={handleDownloadCard}
              disabled={exportingCard}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: exportingCard ? 'rgba(74,144,217,0.3)' : 'rgba(74,144,217,0.85)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: exportingCard ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {exportingCard && (
                <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
              {exportingCard ? 'Exporting…' : '🧬 Download DNA Card (PNG)'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

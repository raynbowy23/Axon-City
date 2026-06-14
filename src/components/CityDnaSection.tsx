/**
 * City DNA section (novelty track N2) for the stats panel.
 *
 * Reads the store like MetricsPanel and renders the DNA glyph plus a legend:
 * a single area shows a labelled glyph + trait chips; multiple areas overlay
 * their glyphs with per-area colors for an instant visual diff.
 */

import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { calculatePolygonArea } from '../utils/geometryUtils';
import { computeCityDna, type CityDna } from '../utils/cityDna';
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
        <DnaGlyph vectors={vectors} size={glyphSize} showLabels />
      </div>

      {/* Legend / traits */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {areaDnas.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        ))}
      </div>
    </div>
  );
}

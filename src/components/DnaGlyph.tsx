/**
 * City DNA glyph (novelty track N2).
 *
 * A radial/radar chart of an area's DNA vector — one spoke per dimension,
 * a filled polygon for the profile. Renders one or several vectors overlaid
 * (per-area colors) so two places can be diffed at a glance. Sized for the
 * stats panel now; reused at larger size for the share card later.
 */

import { memo } from 'react';
import { DNA_DIMENSIONS } from '../utils/cityDna';

export interface DnaGlyphVector {
  values: number[]; // 0–1 per DNA_DIMENSIONS, same order
  color: [number, number, number];
  label?: string;
}

interface DnaGlyphProps {
  vectors: DnaGlyphVector[];
  size?: number;
  showLabels?: boolean;
}

const N = DNA_DIMENSIONS.length;
const RINGS = [0.25, 0.5, 0.75, 1];

/** Angle (radians) for dimension i — first spoke points up. */
function angleFor(i: number): number {
  return -Math.PI / 2 + (i / N) * Math.PI * 2;
}

function pointAt(cx: number, cy: number, radius: number, i: number): [number, number] {
  const a = angleFor(i);
  return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

function polygonPoints(cx: number, cy: number, radii: number[]): string {
  return radii.map((r, i) => pointAt(cx, cy, r, i).join(',')).join(' ');
}

export const DnaGlyph = memo(function DnaGlyph({
  vectors,
  size = 200,
  showLabels = false,
}: DnaGlyphProps) {
  const pad = showLabels ? 46 : 8;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - pad;

  const gridColor = 'rgba(255,255,255,0.12)';
  const spokeColor = 'rgba(255,255,255,0.16)';
  const labelColor = 'rgba(255,255,255,0.55)';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="City DNA glyph">
      {/* Concentric grid rings */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygonPoints(cx, cy, DNA_DIMENSIONS.map(() => R * ring))}
          fill="none"
          stroke={gridColor}
          strokeWidth={1}
        />
      ))}

      {/* Spokes */}
      {DNA_DIMENSIONS.map((dim, i) => {
        const [x, y] = pointAt(cx, cy, R, i);
        return <line key={dim.id} x1={cx} y1={cy} x2={x} y2={y} stroke={spokeColor} strokeWidth={1} />;
      })}

      {/* Vector polygons (drawn back-to-front so the first stays readable) */}
      {vectors.map((v, vi) => {
        const [r, g, b] = v.color;
        const radii = DNA_DIMENSIONS.map((_, i) => R * Math.max(0, Math.min(1, v.values[i] ?? 0)));
        const fillAlpha = vectors.length > 1 ? 0.16 : 0.22;
        return (
          <g key={vi}>
            <polygon
              points={polygonPoints(cx, cy, radii)}
              fill={`rgba(${r},${g},${b},${fillAlpha})`}
              stroke={`rgb(${r},${g},${b})`}
              strokeWidth={1.75}
              strokeLinejoin="round"
            />
            {radii.map((rad, i) => {
              const [px, py] = pointAt(cx, cy, rad, i);
              return <circle key={i} cx={px} cy={py} r={2} fill={`rgb(${r},${g},${b})`} />;
            })}
          </g>
        );
      })}

      {/* Dimension labels */}
      {showLabels &&
        DNA_DIMENSIONS.map((dim, i) => {
          const [lx, ly] = pointAt(cx, cy, R + 14, i);
          const a = angleFor(i);
          const cos = Math.cos(a);
          const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
          return (
            <text
              key={dim.id}
              x={lx}
              y={ly}
              fill={labelColor}
              fontSize={10}
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {dim.short}
            </text>
          );
        })}
    </svg>
  );
});

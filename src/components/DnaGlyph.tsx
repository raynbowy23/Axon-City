/**
 * City DNA glyph (novelty track N2).
 *
 * A radial/radar chart of an area's DNA vector — one spoke per dimension,
 * a filled polygon for the profile. Renders one or several vectors overlaid
 * (per-area colors) so two places can be diffed at a glance.
 *
 * When `interactive`, hovering a dimension's slice shows a tooltip with that
 * dimension's value(s), and clicking calls `onExpand` (used to pop a larger
 * view). Sized for the stats panel now; reused larger for the popup/share card.
 */

import { memo, useState } from 'react';
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
  interactive?: boolean;
  onExpand?: () => void;
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

/** Pie-wedge path centered on dimension i — used as a hover hit target. */
function wedgePath(cx: number, cy: number, r: number, i: number): string {
  const step = (Math.PI * 2) / N;
  const a0 = angleFor(i) - step / 2;
  const a1 = angleFor(i) + step / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}

export const DnaGlyph = memo(function DnaGlyph({
  vectors,
  size = 200,
  showLabels = false,
  interactive = false,
  onExpand,
}: DnaGlyphProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const pad = showLabels ? 46 : 8;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - pad;

  const gridColor = 'rgba(255,255,255,0.12)';
  const spokeColor = 'rgba(255,255,255,0.16)';
  const labelColor = 'rgba(255,255,255,0.55)';

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        cursor: interactive && onExpand ? 'pointer' : 'default',
      }}
      onMouseMove={interactive ? handleMove : undefined}
      onMouseLeave={() => {
        setHovered(null);
        setCursor(null);
      }}
      onClick={onExpand}
      title={interactive && onExpand ? 'Click to expand' : undefined}
    >
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

        {/* Spokes (highlight the hovered one) */}
        {DNA_DIMENSIONS.map((dim, i) => {
          const [x, y] = pointAt(cx, cy, R, i);
          return (
            <line
              key={dim.id}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={hovered === i ? 'rgba(255,255,255,0.5)' : spokeColor}
              strokeWidth={hovered === i ? 1.5 : 1}
            />
          );
        })}

        {/* Vector polygons */}
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
                return <circle key={i} cx={px} cy={py} r={hovered === i ? 3.5 : 2} fill={`rgb(${r},${g},${b})`} />;
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
                fill={hovered === i ? 'white' : labelColor}
                fontSize={10}
                fontWeight={hovered === i ? 700 : 400}
                fontFamily="system-ui, -apple-system, sans-serif"
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {dim.short}
              </text>
            );
          })}

        {/* Transparent hover hit targets (one wedge per dimension) */}
        {interactive &&
          DNA_DIMENSIONS.map((dim, i) => (
            <path
              key={`hit-${dim.id}`}
              d={wedgePath(cx, cy, R, i)}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
            />
          ))}
      </svg>

      {/* Hover tooltip */}
      {interactive && hovered !== null && cursor && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(cursor.x + 12, size - 8),
            top: cursor.y + 12,
            transform: cursor.x > size * 0.6 ? 'translateX(-100%)' : undefined,
            backgroundColor: 'rgba(10,10,20,0.95)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px',
            padding: '6px 8px',
            pointerEvents: 'none',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'white', marginBottom: '3px' }}>
            {DNA_DIMENSIONS[hovered].label}
          </div>
          {vectors.map((v, vi) => (
            <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: `rgb(${v.color.join(',')})`,
                  flexShrink: 0,
                }}
              />
              {v.label && <span style={{ color: 'rgba(255,255,255,0.7)' }}>{v.label}</span>}
              <span style={{ color: 'white', fontWeight: 600, marginLeft: 'auto' }}>
                {Math.round((v.values[hovered] ?? 0) * 100)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

import type { LayerStyle } from '../types';

/**
 * Poster themes (novelty track N1).
 *
 * A theme restyles the exploded view per layer GROUP — posters read as
 * art prints because they use a few cohesive colors, not the 20+ layer
 * colors of the analysis view. Themes are pure data; `themeLayerConfig`
 * applies them to any layer config before rendering.
 */

export interface PosterThemeStyle {
  fill: [number, number, number, number];
  stroke: [number, number, number, number];
}

/**
 * Typography colors for the poster composer (CSS color strings). Posters
 * are typeset on a 2D canvas; these decide how the title, subtitle, metric
 * strip, and accent rules read against the theme background.
 */
export interface PosterTypography {
  title: string;
  subtitle: string;
  metricValue: string;
  metricLabel: string;
  /** Thin rules / dividers between the view and the type. */
  accent: string;
}

export interface PosterTheme {
  id: string;
  name: string;
  description: string;
  /** Scene background behind the exploded view (CSS color) */
  background: string;
  /** Accent for the selection base plate and other chrome inside the scene */
  frame: [number, number, number];
  /** Per layer-group style; falls back to `defaultStyle` */
  groups: Partial<Record<string, PosterThemeStyle>>;
  defaultStyle: PosterThemeStyle;
  /** Group platform plates: alphas applied to the group's themed stroke */
  platform: { fillAlpha: number; strokeAlpha: number };
  /** Type colors used when composing the exported poster. */
  typography: PosterTypography;
}

const blueprintInk: [number, number, number] = [232, 242, 255];
const monoInk: [number, number, number] = [32, 29, 26];

export const posterThemes: PosterTheme[] = [
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'White linework on cyanotype blue — architectural drawing energy',
    background: '#102A56',
    frame: blueprintInk,
    groups: {},
    defaultStyle: {
      fill: [...blueprintInk, 30],
      stroke: [...blueprintInk, 255],
    },
    platform: { fillAlpha: 14, strokeAlpha: 120 },
    typography: {
      title: 'rgb(232, 242, 255)',
      subtitle: 'rgba(232, 242, 255, 0.62)',
      metricValue: 'rgb(232, 242, 255)',
      metricLabel: 'rgba(232, 242, 255, 0.55)',
      accent: 'rgba(232, 242, 255, 0.38)',
    },
  },
  {
    id: 'neon-noir',
    name: 'Neon Noir',
    description: 'Saturated layer glows over near-black — the city at 2am',
    background: '#0B0B14',
    frame: [220, 230, 255],
    groups: {
      environment: { fill: [57, 255, 173, 45], stroke: [57, 255, 173, 255] },
      usage: { fill: [255, 64, 160, 45], stroke: [255, 64, 160, 255] },
      infrastructure: { fill: [64, 220, 255, 45], stroke: [64, 220, 255, 255] },
      access: { fill: [255, 230, 64, 45], stroke: [255, 230, 64, 255] },
      traffic: { fill: [255, 80, 80, 45], stroke: [255, 80, 80, 255] },
      amenities: { fill: [255, 150, 50, 45], stroke: [255, 150, 50, 255] },
      custom: { fill: [190, 110, 255, 45], stroke: [190, 110, 255, 255] },
    },
    defaultStyle: {
      fill: [190, 110, 255, 45],
      stroke: [190, 110, 255, 255],
    },
    platform: { fillAlpha: 18, strokeAlpha: 110 },
    typography: {
      title: 'rgb(236, 240, 255)',
      subtitle: 'rgba(236, 240, 255, 0.58)',
      metricValue: 'rgb(64, 220, 255)',
      metricLabel: 'rgba(236, 240, 255, 0.5)',
      accent: 'rgba(255, 64, 160, 0.7)',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Ink on warm paper — woodblock print restraint',
    background: '#F4EFE6',
    frame: monoInk,
    groups: {},
    defaultStyle: {
      fill: [...monoInk, 26],
      stroke: [...monoInk, 255],
    },
    platform: { fillAlpha: 10, strokeAlpha: 80 },
    typography: {
      title: 'rgb(32, 29, 26)',
      subtitle: 'rgba(32, 29, 26, 0.6)',
      metricValue: 'rgb(32, 29, 26)',
      metricLabel: 'rgba(32, 29, 26, 0.55)',
      accent: 'rgba(32, 29, 26, 0.32)',
    },
  },
];

export function getPosterTheme(id: string | null): PosterTheme | null {
  if (!id) return null;
  return posterThemes.find((t) => t.id === id) ?? null;
}

/** Resolve the themed style for a layer group. */
export function themeGroupStyle(theme: PosterTheme, groupId: string): PosterThemeStyle {
  return theme.groups[groupId] ?? theme.defaultStyle;
}

/**
 * Return a copy of a layer config with the theme's group style applied.
 * Geometry-affecting properties (extrusion, stroke width) are preserved.
 * Point layers render with their fill color, so they get the opaque
 * stroke instead of the translucent fill — dots must stay visible.
 */
export function themeLayerConfig<T extends { group?: string; geometryType?: string; style: LayerStyle }>(
  config: T,
  theme: PosterTheme
): T {
  const groupId = typeof config.group === 'string' ? config.group : 'custom';
  const themed = themeGroupStyle(theme, groupId);
  const fill = config.geometryType === 'point' ? themed.stroke : themed.fill;
  return {
    ...config,
    style: {
      ...config.style,
      fillColor: [...fill] as [number, number, number, number],
      strokeColor: [...themed.stroke] as [number, number, number, number],
    },
  };
}

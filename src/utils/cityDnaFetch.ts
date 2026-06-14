/**
 * City DNA layer completeness (novelty track N2).
 *
 * DNA is only meaningful when an area has the full DNA layer set. The app's
 * auto-fetch only back-fills the active area, so pre-existing comparison areas
 * can miss layers (e.g. roads → Streets reads 0). This fetches just the missing
 * DNA layers for a given area, on demand, reusing the normal fetch/clip/stats
 * pipeline.
 */

import type { Polygon } from 'geojson';
import type { ComparisonArea, LayerData, LayerConfig } from '../types';
import { layerManifest } from '../data/layerManifest';
import { fetchMultipleLayers, getBboxFromPolygon } from './osmFetcher';
import { clipFeaturesToPolygon, calculatePolygonArea, calculateLayerStats } from './geometryUtils';
import { DNA_LAYER_IDS } from './cityDna';

/** DNA layers not yet present in an area's layerData. */
export function missingDnaLayers(area: ComparisonArea): string[] {
  return DNA_LAYER_IDS.filter((id) => !area.layerData.has(id));
}

/**
 * Fetch, clip, and stat the given layers for one area's polygon.
 * Returns layerId → LayerData for the layers successfully fetched.
 */
export async function fetchAreaLayers(
  area: ComparisonArea,
  layerIds: string[],
  signal?: AbortSignal
): Promise<Map<string, LayerData>> {
  const out = new Map<string, LayerData>();

  const configs = layerIds
    .map((id) => layerManifest.layers.find((l) => l.id === id))
    .filter((l): l is LayerConfig => l !== undefined);
  if (configs.length === 0) return out;

  const polygon = area.polygon.geometry as Polygon;
  const bbox = getBboxFromPolygon(polygon, 0.001);
  const areaKm2 = calculatePolygonArea(polygon);

  const results = await fetchMultipleLayers(configs, bbox, undefined, signal);

  for (const cfg of configs) {
    const features = results.get(cfg.id);
    if (!features) continue;
    const clippedFeatures = clipFeaturesToPolygon(features, polygon, cfg.geometryType);
    const stats = calculateLayerStats(clippedFeatures, cfg, areaKm2);
    out.set(cfg.id, { layerId: cfg.id, features, clippedFeatures, stats });
  }

  return out;
}

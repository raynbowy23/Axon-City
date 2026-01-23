import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString, MultiLineString, Point, Geometry } from 'geojson';

// Map style options
export type MapStyleType = 'dark' | 'light' | 'satellite';

export interface MapStyleOption {
  id: MapStyleType;
  name: string;
  url: string;
  icon: 'moon' | 'sun' | 'satellite';
}

// Map language options
export type MapLanguage = 'local' | 'en';

// Favorite location
export interface FavoriteLocation {
  id: string;
  longitude: number;
  latitude: number;
  zoom: number;
  name: string;
}

// Layer categories matching the poster aesthetic
export type LayerGroup =
  | 'infrastructure'
  | 'access'
  | 'usage'
  | 'traffic'
  | 'environment'
  | 'amenities'
  | 'custom';

export type GeometryType = 'polygon' | 'line' | 'point';

export type StatsRecipe =
  | 'count'
  | 'density'
  | 'length'
  | 'area'
  | 'area_share';

export interface LayerStyle {
  fillColor: [number, number, number, number];
  strokeColor: [number, number, number, number];
  strokeWidth: number;
  extruded?: boolean;
  extrusionHeight?: number;
}

export interface LayerConfig {
  id: string;
  name: string;
  group: LayerGroup;
  geometryType: GeometryType;
  priority: number; // Higher = rendered on top
  osmQuery: string; // Overpass API query fragment
  style: LayerStyle;
  statsRecipes: StatsRecipe[];
  visible: boolean;
  description?: string;
}

export interface LayerManifest {
  groups: {
    id: LayerGroup;
    name: string;
    priority: number;
    color: [number, number, number];
  }[];
  layers: LayerConfig[];
}

export interface LayerData {
  layerId: string;
  features: FeatureCollection;
  clippedFeatures?: FeatureCollection;
  stats?: LayerStats;
}

export interface LayerStats {
  count: number;
  density?: number; // per km²
  totalLength?: number; // in meters
  totalArea?: number; // in m²
  areaShare?: number; // percentage
}

export interface SelectionPolygon {
  id: string;
  geometry: Polygon | MultiPolygon;
  area: number; // in m²
}

// Colors for comparison areas (colorblind-friendly, distinct)
export const AREA_COLORS: [number, number, number, number][] = [
  [59, 130, 246, 200],   // Blue
  [249, 115, 22, 200],   // Orange
  [34, 197, 94, 200],    // Green
  [168, 85, 247, 200],   // Purple
];

export const AREA_NAMES = ['Area A', 'Area B', 'Area C', 'Area D'] as const;

export const MAX_COMPARISON_AREAS = 4;

// A comparison area represents one geographic region being analyzed
export interface ComparisonArea {
  id: string;
  name: string;
  color: [number, number, number, number];
  polygon: SelectionPolygon;
  layerData: Map<string, LayerData>;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  maxPitch?: number;
  minPitch?: number;
}

export interface ExplodedViewConfig {
  enabled: boolean;
  layerSpacing: number; // vertical distance between layer groups in meters
  intraGroupRatio: number; // ratio of layerSpacing for spacing between layers in same group
  baseElevation: number;
  animationDuration: number;
}

// Story preset for one-click urban analysis perspectives
export interface StoryPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  activeLayers: string[];
  camera: { pitch: number; bearing: number };
  explodedView: { enabled: boolean; layerSpacing?: number; intraGroupRatio?: number };
}

export interface LayerOrderConfig {
  groupOrder: LayerGroup[];
  layerOrderByGroup: Record<LayerGroup, string[]>;
  isCustomOrder: boolean;
}

// Custom layer extends LayerConfig but without osmQuery (user-uploaded data)
export interface CustomLayerConfig extends Omit<LayerConfig, 'osmQuery'> {
  isCustom: true;
  sourceType: 'geojson' | 'csv';
  fileName: string;
}

// Union type for all layers
export type AnyLayerConfig = LayerConfig | CustomLayerConfig;

// Helper type guard to check if a layer is custom
export function isCustomLayer(layer: AnyLayerConfig): layer is CustomLayerConfig {
  return 'isCustom' in layer && layer.isCustom === true;
}

// Selected feature with color for visual differentiation
export interface SelectedFeature {
  id: string | number;
  feature: Feature;
  layerId: string;
  color: [number, number, number, number]; // Unique color for this selection
}

export interface AppState {
  // Map view
  viewState: ViewState;
  setViewState: (viewState: ViewState) => void;

  // Map style
  mapStyle: MapStyleType;
  setMapStyle: (style: MapStyleType) => void;

  // Map language
  mapLanguage: MapLanguage;
  setMapLanguage: (language: MapLanguage) => void;

  // Favorite locations
  favoriteLocations: FavoriteLocation[];
  addFavoriteLocation: (location: Omit<FavoriteLocation, 'id'>) => void;
  removeFavoriteLocation: (id: string) => void;
  clearFavoriteLocations: () => void;

  // Comparison areas (multi-area selection)
  areas: ComparisonArea[];
  activeAreaId: string | null;
  addArea: (polygon: SelectionPolygon) => string | null; // returns area id or null if max reached
  updateAreaPolygon: (areaId: string, polygon: SelectionPolygon) => void;
  updateAreaLayerData: (areaId: string, layerId: string, data: LayerData) => void;
  removeArea: (areaId: string) => void;
  setActiveAreaId: (areaId: string | null) => void;
  renameArea: (areaId: string, name: string) => void;
  clearAreas: () => void;
  getActiveArea: () => ComparisonArea | null;

  // Selection (legacy - bridges to active area)
  selectionPolygon: SelectionPolygon | null;
  setSelectionPolygon: (polygon: SelectionPolygon | null) => void;
  isDrawing: boolean;
  setIsDrawing: (isDrawing: boolean) => void;
  drawingPoints: [number, number][];
  setDrawingPoints: (points: [number, number][]) => void;
  addDrawingPoint: (point: [number, number]) => void;

  // Polygon editing
  editableVertices: [number, number][];
  setEditableVertices: (vertices: [number, number][]) => void;
  updateVertex: (index: number, position: [number, number]) => void;
  addVertex: (afterIndex: number, position: [number, number]) => void;
  removeVertex: (index: number) => void;
  draggingVertexIndex: number | null;
  setDraggingVertexIndex: (index: number | null) => void;

  // Layers
  layerData: Map<string, LayerData>;
  setLayerData: (layerId: string, data: LayerData) => void;
  clearLayerData: () => void;
  clearManifestLayerData: () => void;

  // Active layers (selected by user)
  activeLayers: string[];
  setActiveLayers: (layers: string[]) => void;
  toggleLayer: (layerId: string) => void;

  // Exploded view
  explodedView: ExplodedViewConfig;
  setExplodedView: (config: Partial<ExplodedViewConfig>) => void;

  // Layer ordering
  layerOrder: LayerOrderConfig;
  setGroupOrder: (groupOrder: LayerGroup[]) => void;
  setLayerOrderInGroup: (groupId: LayerGroup, layerIds: string[]) => void;
  resetLayerOrder: () => void;

  // UI state
  hoveredLayerId: string | null;
  setHoveredLayerId: (layerId: string | null) => void;
  isolatedLayerId: string | null;
  setIsolatedLayerId: (layerId: string | null) => void;

  // Feature selection (for comparing features within same layer)
  selectedFeatures: SelectedFeature[];
  addSelectedFeature: (feature: Feature, layerId: string) => void;
  removeSelectedFeature: (id: string | number) => void;
  clearSelectedFeatures: () => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  loadingMessage: string;
  setLoadingMessage: (message: string) => void;

  // Extracted view
  isExtractedViewOpen: boolean;
  setExtractedViewOpen: (isOpen: boolean) => void;
  selectionLocationName: string | null;
  setSelectionLocationName: (name: string | null) => void;

  // Custom layers (user-uploaded data)
  customLayers: CustomLayerConfig[];
  addCustomLayer: (layer: CustomLayerConfig, features: FeatureCollection) => void;
  removeCustomLayer: (layerId: string) => void;
  clearCustomLayers: () => void;

  // Data input panel
  isDataInputOpen: boolean;
  setDataInputOpen: (isOpen: boolean) => void;

  // Story presets
  activeStoryId: string | null;
  previousStoryState: {
    activeLayers: string[];
    explodedView: ExplodedViewConfig;
  } | null;
  applyStory: (storyId: string) => void;
  clearStory: () => void;
}

// Shareable state for URL encoding
export interface ShareableState {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  areas: EncodedArea[];
  presetId?: string;
  activeLayers?: string[];
  explodedView: boolean;
  mapStyle?: MapStyleType;
}

export interface EncodedArea {
  name: string;
  coordinates: number[][]; // Flattened [lng, lat, lng, lat, ...]
}

// Snapshot export options
export interface SnapshotOptions {
  width: number;
  height: number;
  includeLegend: boolean;
  includeMetrics: boolean;
  includeAttribution: boolean;
  format: 'png' | 'jpeg';
  quality: number; // 0-1 for jpeg
}

// Re-export GeoJSON types for convenience
export type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  LineString,
  MultiLineString,
  Point,
  Geometry,
};

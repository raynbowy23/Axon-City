import type { Feature, FeatureCollection, Polygon, MultiPolygon, LineString, MultiLineString, Point } from 'geojson';

// Layer categories matching the poster aesthetic
export type LayerGroup =
  | 'infrastructure'
  | 'access'
  | 'usage'
  | 'safety'
  | 'environment';

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
  layerSpacing: number; // vertical distance between layers in meters
  baseElevation: number;
  animationDuration: number;
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

  // Selection
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
  draggingVertexIndex: number | null;
  setDraggingVertexIndex: (index: number | null) => void;

  // Layers
  layerData: Map<string, LayerData>;
  setLayerData: (layerId: string, data: LayerData) => void;
  clearLayerData: () => void;

  // Active layers (selected by user)
  activeLayers: string[];
  setActiveLayers: (layers: string[]) => void;
  toggleLayer: (layerId: string) => void;

  // Exploded view
  explodedView: ExplodedViewConfig;
  setExplodedView: (config: Partial<ExplodedViewConfig>) => void;

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
};

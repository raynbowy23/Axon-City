import { create } from 'zustand';
import type { AppState, ViewState, LayerData, ExplodedViewConfig, SelectedFeature, Feature, LayerGroup, LayerOrderConfig } from '../types';
import { layerManifest } from '../data/layerManifest';

// Distinct colors for selected features (colorblind-friendly palette)
const SELECTION_COLORS: [number, number, number, number][] = [
  [255, 99, 71, 255],   // Tomato red
  [50, 205, 50, 255],   // Lime green
  [255, 215, 0, 255],   // Gold
  [138, 43, 226, 255],  // Blue violet
  [0, 191, 255, 255],   // Deep sky blue
  [255, 105, 180, 255], // Hot pink
  [255, 165, 0, 255],   // Orange
  [0, 255, 127, 255],   // Spring green
];

// Default view centered on Seattle (you can change this to any city)
const defaultViewState: ViewState = {
  longitude: -122.3321,
  latitude: 47.6062,
  zoom: 14,
  pitch: 45,
  bearing: 0,
  maxPitch: 89,
  minPitch: 0,
};

const defaultExplodedView: ExplodedViewConfig = {
  enabled: false,
  layerSpacing: 100, // meters between groups (increased for better separation)
  baseElevation: 0,
  animationDuration: 500,
};

// Helper to derive default layer order from manifest
function getDefaultLayerOrder(): LayerOrderConfig {
  const groupOrder = layerManifest.groups.map(g => g.id) as LayerGroup[];
  const layerOrderByGroup: Record<LayerGroup, string[]> = {} as Record<LayerGroup, string[]>;

  for (const group of layerManifest.groups) {
    const groupLayers = layerManifest.layers
      .filter(l => l.group === group.id)
      .sort((a, b) => a.priority - b.priority)
      .map(l => l.id);
    layerOrderByGroup[group.id as LayerGroup] = groupLayers;
  }

  return {
    groupOrder,
    layerOrderByGroup,
    isCustomOrder: false,
  };
}

const defaultLayerOrder = getDefaultLayerOrder();

export const useStore = create<AppState>((set) => ({
  // Map view
  viewState: defaultViewState,
  setViewState: (viewState) => set({ viewState }),

  // Selection
  selectionPolygon: null,
  setSelectionPolygon: (polygon) => set({ selectionPolygon: polygon }),
  isDrawing: false,
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  drawingPoints: [],
  setDrawingPoints: (points) => set({ drawingPoints: points }),
  addDrawingPoint: (point) => set((state) => ({ drawingPoints: [...state.drawingPoints, point] })),

  // Polygon editing
  editableVertices: [],
  setEditableVertices: (vertices) => set({ editableVertices: vertices }),
  updateVertex: (index, position) => set((state) => {
    const newVertices = [...state.editableVertices];
    newVertices[index] = position;
    return { editableVertices: newVertices };
  }),
  addVertex: (afterIndex, position) => set((state) => {
    const newVertices = [...state.editableVertices];
    newVertices.splice(afterIndex + 1, 0, position);
    return { editableVertices: newVertices };
  }),
  removeVertex: (index) => set((state) => {
    // Don't remove if we have 3 or fewer vertices (minimum for a polygon)
    if (state.editableVertices.length <= 3) return state;
    const newVertices = state.editableVertices.filter((_, i) => i !== index);
    return { editableVertices: newVertices };
  }),
  draggingVertexIndex: null,
  setDraggingVertexIndex: (index) => set({ draggingVertexIndex: index }),

  // Layer data
  layerData: new Map<string, LayerData>(),
  setLayerData: (layerId, data) =>
    set((state) => {
      const newMap = new Map(state.layerData);
      newMap.set(layerId, data);
      return { layerData: newMap };
    }),
  clearLayerData: () => set({ layerData: new Map() }),

  // Active layers
  activeLayers: [
    'buildings',
    'roads-primary',
    'roads-residential',
    'transit-stops',
    'parks',
    'traffic-signals',
  ],
  setActiveLayers: (layers) => set({ activeLayers: layers }),
  toggleLayer: (layerId) =>
    set((state) => {
      const newLayers = state.activeLayers.includes(layerId)
        ? state.activeLayers.filter((id) => id !== layerId)
        : [...state.activeLayers, layerId];
      return { activeLayers: newLayers };
    }),

  // Exploded view
  explodedView: defaultExplodedView,
  setExplodedView: (config) =>
    set((state) => ({
      explodedView: { ...state.explodedView, ...config },
    })),

  // Layer ordering
  layerOrder: defaultLayerOrder,
  setGroupOrder: (groupOrder) =>
    set((state) => ({
      layerOrder: {
        ...state.layerOrder,
        groupOrder,
        isCustomOrder: true,
      },
    })),
  setLayerOrderInGroup: (groupId, layerIds) =>
    set((state) => ({
      layerOrder: {
        ...state.layerOrder,
        layerOrderByGroup: {
          ...state.layerOrder.layerOrderByGroup,
          [groupId]: layerIds,
        },
        isCustomOrder: true,
      },
    })),
  resetLayerOrder: () =>
    set({ layerOrder: getDefaultLayerOrder() }),

  // UI state
  hoveredLayerId: null,
  setHoveredLayerId: (layerId) => set({ hoveredLayerId: layerId }),
  isolatedLayerId: null,
  setIsolatedLayerId: (layerId) => set({ isolatedLayerId: layerId }),

  // Feature selection
  selectedFeatures: [],
  addSelectedFeature: (feature: Feature, layerId: string) =>
    set((state) => {
      const featureId = feature.id ?? feature.properties?.id ?? `${layerId}-${Date.now()}`;

      // Check if already selected - if so, remove it (toggle behavior)
      const existingIndex = state.selectedFeatures.findIndex(
        (sf) => sf.id === featureId && sf.layerId === layerId
      );

      if (existingIndex !== -1) {
        // Remove the feature (deselect)
        return {
          selectedFeatures: state.selectedFeatures.filter((_, i) => i !== existingIndex),
        };
      }

      // Add new selection with unique color
      const colorIndex = state.selectedFeatures.length % SELECTION_COLORS.length;
      const newSelection: SelectedFeature = {
        id: featureId,
        feature,
        layerId,
        color: SELECTION_COLORS[colorIndex],
      };

      return {
        selectedFeatures: [...state.selectedFeatures, newSelection],
      };
    }),
  removeSelectedFeature: (id: string | number) =>
    set((state) => ({
      selectedFeatures: state.selectedFeatures.filter((sf) => sf.id !== id),
    })),
  clearSelectedFeatures: () => set({ selectedFeatures: [] }),

  // Loading
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  loadingMessage: '',
  setLoadingMessage: (message) => set({ loadingMessage: message }),

  // Extracted view
  isExtractedViewOpen: false,
  setExtractedViewOpen: (isOpen) => set({ isExtractedViewOpen: isOpen }),
}));

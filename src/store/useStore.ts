import { create } from 'zustand';
import type { AppState, ViewState, LayerData, ExplodedViewConfig, SelectedFeature, Feature, LayerGroup, LayerOrderConfig, CustomLayerConfig, FeatureCollection } from '../types';
import { layerManifest } from '../data/layerManifest';

// LocalStorage keys
const STORAGE_KEYS = {
  VIEW_STATE: 'axoncity-viewstate',
} as const;

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

// Default view centered on Madison, WI
const defaultViewState: ViewState = {
  longitude: -89.4012,
  latitude: 43.0731,
  zoom: 14,
  pitch: 45,
  bearing: 0,
  maxPitch: 89,
  minPitch: 0,
};

// Load viewState from localStorage or return default
function getInitialViewState(): ViewState {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.VIEW_STATE);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that essential properties exist
      if (
        typeof parsed.longitude === 'number' &&
        typeof parsed.latitude === 'number' &&
        typeof parsed.zoom === 'number'
      ) {
        return {
          ...defaultViewState,
          ...parsed,
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load viewState from localStorage:', e);
  }
  return defaultViewState;
}

// Save viewState to localStorage
function saveViewState(viewState: ViewState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIEW_STATE, JSON.stringify(viewState));
  } catch (e) {
    console.warn('Failed to save viewState to localStorage:', e);
  }
}

const defaultExplodedView: ExplodedViewConfig = {
  enabled: false,
  layerSpacing: 100, // meters between groups (increased for better separation)
  intraGroupRatio: 0.3, // 30% of layerSpacing for layers within same group
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
  // Map view (loaded from localStorage or default to Madison, WI)
  viewState: getInitialViewState(),
  setViewState: (viewState) => {
    saveViewState(viewState);
    set({ viewState });
  },

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
  clearManifestLayerData: () =>
    set((state) => {
      // Only clear non-custom layer data (preserve custom layers)
      const customLayerIds = new Set(state.customLayers.map((l) => l.id));
      const newMap = new Map<string, LayerData>();
      for (const [layerId, data] of state.layerData.entries()) {
        if (customLayerIds.has(layerId)) {
          newMap.set(layerId, data);
        }
      }
      return { layerData: newMap };
    }),

  // Active layers
  activeLayers: [
    'buildings-residential',
    'buildings-commercial',
    'buildings-industrial',
    'buildings-other',
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

  // Custom layers (user-uploaded data)
  customLayers: [],
  addCustomLayer: (layer: CustomLayerConfig, features: FeatureCollection) =>
    set((state) => {
      // Add layer to customLayers
      const newCustomLayers = [...state.customLayers, layer];

      // Add to active layers
      const newActiveLayers = [...state.activeLayers, layer.id];

      // Store features in layerData
      const newLayerData = new Map(state.layerData);
      newLayerData.set(layer.id, {
        layerId: layer.id,
        features,
      });

      return {
        customLayers: newCustomLayers,
        activeLayers: newActiveLayers,
        layerData: newLayerData,
      };
    }),
  removeCustomLayer: (layerId: string) =>
    set((state) => {
      // Remove from customLayers
      const newCustomLayers = state.customLayers.filter((l) => l.id !== layerId);

      // Remove from active layers
      const newActiveLayers = state.activeLayers.filter((id) => id !== layerId);

      // Remove from layerData
      const newLayerData = new Map(state.layerData);
      newLayerData.delete(layerId);

      return {
        customLayers: newCustomLayers,
        activeLayers: newActiveLayers,
        layerData: newLayerData,
      };
    }),
  clearCustomLayers: () =>
    set((state) => {
      // Get all custom layer IDs
      const customLayerIds = new Set(state.customLayers.map((l) => l.id));

      // Remove from active layers
      const newActiveLayers = state.activeLayers.filter((id) => !customLayerIds.has(id));

      // Remove from layerData
      const newLayerData = new Map(state.layerData);
      for (const id of customLayerIds) {
        newLayerData.delete(id);
      }

      return {
        customLayers: [],
        activeLayers: newActiveLayers,
        layerData: newLayerData,
      };
    }),

  // Data input panel
  isDataInputOpen: false,
  setDataInputOpen: (isOpen) => set({ isDataInputOpen: isOpen }),
}));

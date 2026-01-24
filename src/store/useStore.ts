import { create } from 'zustand';
import type { AppState, ViewState, LayerData, ExplodedViewConfig, SelectedFeature, Feature, LayerGroup, LayerOrderConfig, CustomLayerConfig, FeatureCollection, MapStyleType, MapLanguage, FavoriteLocation, ComparisonArea, SelectionPolygon, LayerStyleOverride } from '../types';
import { AREA_COLORS, AREA_NAMES, MAX_COMPARISON_AREAS } from '../types';
import { layerManifest } from '../data/layerManifest';
import { getStoryById } from '../data/storyPresets';

// LocalStorage keys
const STORAGE_KEYS = {
  VIEW_STATE: 'axoncity-viewstate',
  MAP_STYLE: 'axoncity-mapstyle',
  MAP_LANGUAGE: 'axoncity-maplanguage',
  FAVORITE_LOCATIONS: 'axoncity-favorites',
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

// Load mapStyle from localStorage or return default
function getInitialMapStyle(): MapStyleType {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MAP_STYLE);
    if (stored && ['dark', 'light', 'satellite'].includes(stored)) {
      return stored as MapStyleType;
    }
  } catch (e) {
    console.warn('Failed to load mapStyle from localStorage:', e);
  }
  return 'dark';
}

// Save mapStyle to localStorage
function saveMapStyle(style: MapStyleType): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MAP_STYLE, style);
  } catch (e) {
    console.warn('Failed to save mapStyle to localStorage:', e);
  }
}

// Load mapLanguage from localStorage or return default
function getInitialMapLanguage(): MapLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.MAP_LANGUAGE);
    if (stored && ['local', 'en'].includes(stored)) {
      return stored as MapLanguage;
    }
  } catch (e) {
    console.warn('Failed to load mapLanguage from localStorage:', e);
  }
  return 'local';
}

// Save mapLanguage to localStorage
function saveMapLanguage(language: MapLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MAP_LANGUAGE, language);
  } catch (e) {
    console.warn('Failed to save mapLanguage to localStorage:', e);
  }
}

// Load favoriteLocations from localStorage or return empty array
function getInitialFavoriteLocations(): FavoriteLocation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FAVORITE_LOCATIONS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (loc: FavoriteLocation) =>
            typeof loc.id === 'string' &&
            typeof loc.longitude === 'number' &&
            typeof loc.latitude === 'number' &&
            typeof loc.zoom === 'number' &&
            typeof loc.name === 'string'
        );
      }
    }
  } catch (e) {
    console.warn('Failed to load favoriteLocations from localStorage:', e);
  }
  return [];
}

// Save favoriteLocations to localStorage
function saveFavoriteLocations(locations: FavoriteLocation[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITE_LOCATIONS, JSON.stringify(locations));
  } catch (e) {
    console.warn('Failed to save favoriteLocations to localStorage:', e);
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

  // Map style (loaded from localStorage or default to dark)
  mapStyle: getInitialMapStyle(),
  setMapStyle: (style) => {
    saveMapStyle(style);
    set({ mapStyle: style });
  },

  // Map language (loaded from localStorage or default to local)
  mapLanguage: getInitialMapLanguage(),
  setMapLanguage: (language) => {
    saveMapLanguage(language);
    set({ mapLanguage: language });
  },

  // Favorite locations (loaded from localStorage)
  favoriteLocations: getInitialFavoriteLocations(),
  addFavoriteLocation: (location) => {
    set((state) => {
      const newLocation: FavoriteLocation = {
        ...location,
        id: `fav-${Date.now()}`,
      };
      const newLocations = [...state.favoriteLocations, newLocation];
      saveFavoriteLocations(newLocations);
      return { favoriteLocations: newLocations };
    });
  },
  removeFavoriteLocation: (id) => {
    set((state) => {
      const newLocations = state.favoriteLocations.filter((loc) => loc.id !== id);
      saveFavoriteLocations(newLocations);
      return { favoriteLocations: newLocations };
    });
  },
  clearFavoriteLocations: () => {
    saveFavoriteLocations([]);
    set({ favoriteLocations: [] });
  },

  // Comparison areas (multi-area selection)
  areas: [],
  activeAreaId: null,

  addArea: (polygon: SelectionPolygon) => {
    let newAreaId: string | null = null;
    set((state) => {
      if (state.areas.length >= MAX_COMPARISON_AREAS) {
        return state; // Max areas reached
      }

      const areaIndex = state.areas.length;
      newAreaId = `area-${Date.now()}`;

      const newArea: ComparisonArea = {
        id: newAreaId,
        name: AREA_NAMES[areaIndex] || `Area ${areaIndex + 1}`,
        color: AREA_COLORS[areaIndex] || AREA_COLORS[0],
        polygon,
        layerData: new Map(),
      };

      return {
        areas: [...state.areas, newArea],
        activeAreaId: newAreaId,
        // Also update legacy selectionPolygon for backward compatibility
        selectionPolygon: polygon,
      };
    });
    return newAreaId;
  },

  updateAreaPolygon: (areaId: string, polygon: SelectionPolygon) =>
    set((state) => {
      const areaIndex = state.areas.findIndex((a) => a.id === areaId);
      if (areaIndex === -1) return state;

      const newAreas = [...state.areas];
      newAreas[areaIndex] = {
        ...newAreas[areaIndex],
        polygon,
        layerData: new Map(), // Clear layer data when polygon changes
      };

      return {
        areas: newAreas,
        // Update legacy selectionPolygon if this is the active area
        selectionPolygon: state.activeAreaId === areaId ? polygon : state.selectionPolygon,
      };
    }),

  updateAreaLayerData: (areaId: string, layerId: string, data: LayerData) =>
    set((state) => {
      const areaIndex = state.areas.findIndex((a) => a.id === areaId);
      if (areaIndex === -1) return state;

      const newAreas = [...state.areas];
      const newLayerData = new Map(newAreas[areaIndex].layerData);
      newLayerData.set(layerId, data);

      newAreas[areaIndex] = {
        ...newAreas[areaIndex],
        layerData: newLayerData,
      };

      return { areas: newAreas };
    }),

  removeArea: (areaId: string) =>
    set((state) => {
      const newAreas = state.areas.filter((a) => a.id !== areaId);

      // Reassign colors and names to maintain consistency
      const reassignedAreas = newAreas.map((area, index) => ({
        ...area,
        color: AREA_COLORS[index] || AREA_COLORS[0],
        // Keep user-assigned names, only reassign if it was a default name
        name: AREA_NAMES.includes(area.name as typeof AREA_NAMES[number])
          ? AREA_NAMES[index] || `Area ${index + 1}`
          : area.name,
      }));

      // If we removed the active area, set the first remaining area as active
      let newActiveAreaId = state.activeAreaId;
      if (state.activeAreaId === areaId) {
        newActiveAreaId = reassignedAreas.length > 0 ? reassignedAreas[0].id : null;
      }

      // Update legacy selectionPolygon
      const activeArea = reassignedAreas.find((a) => a.id === newActiveAreaId);

      // Clear layerData when no areas remain
      const newLayerData = reassignedAreas.length === 0 ? new Map() : state.layerData;

      return {
        areas: reassignedAreas,
        activeAreaId: newActiveAreaId,
        selectionPolygon: activeArea?.polygon || null,
        // Clear editable vertices when removing areas
        editableVertices: activeArea ? state.editableVertices : [],
        // Clear layer data when all areas are removed
        layerData: newLayerData,
      };
    }),

  setActiveAreaId: (areaId: string | null) =>
    set((state) => {
      const activeArea = areaId ? state.areas.find((a) => a.id === areaId) : null;
      return {
        activeAreaId: areaId,
        selectionPolygon: activeArea?.polygon || null,
      };
    }),

  renameArea: (areaId: string, name: string) =>
    set((state) => {
      const areaIndex = state.areas.findIndex((a) => a.id === areaId);
      if (areaIndex === -1) return state;

      const newAreas = [...state.areas];
      newAreas[areaIndex] = {
        ...newAreas[areaIndex],
        name,
      };

      return { areas: newAreas };
    }),

  clearAreas: () =>
    set({
      areas: [],
      activeAreaId: null,
      selectionPolygon: null,
      editableVertices: [],
      drawingPoints: [],
    }),

  getActiveArea: () => {
    const state = useStore.getState();
    return state.areas.find((a) => a.id === state.activeAreaId) || null;
  },

  // Selection (legacy - bridges to active area for backward compatibility)
  selectionPolygon: null,
  setSelectionPolygon: (polygon) => set({ selectionPolygon: polygon }),
  isDrawing: false,
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  drawingMode: 'polygon' as 'polygon' | 'rectangle' | 'circle',
  setDrawingMode: (mode: 'polygon' | 'rectangle' | 'circle') => set({ drawingMode: mode }),
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
  selectionLocationName: null,
  setSelectionLocationName: (name) => set({ selectionLocationName: name }),

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

  // Story presets
  activeStoryId: null,
  previousStoryState: null,

  applyStory: (storyId: string) =>
    set((state) => {
      const story = getStoryById(storyId);
      if (!story) return state;

      // If clicking the same story, clear it
      if (state.activeStoryId === storyId) {
        // Restore previous state
        if (state.previousStoryState) {
          return {
            activeStoryId: null,
            previousStoryState: null,
            activeLayers: state.previousStoryState.activeLayers,
            explodedView: state.previousStoryState.explodedView,
          };
        }
        return { activeStoryId: null, previousStoryState: null };
      }

      // Save current state before applying story (only if not already in a story)
      const previousState = state.activeStoryId === null
        ? {
            activeLayers: state.activeLayers,
            explodedView: state.explodedView,
          }
        : state.previousStoryState;

      // Apply story config - preserve current view state entirely
      const newExplodedView: ExplodedViewConfig = {
        ...state.explodedView,
        enabled: story.explodedView.enabled,
        ...(story.explodedView.layerSpacing !== undefined && {
          layerSpacing: story.explodedView.layerSpacing,
        }),
        ...(story.explodedView.intraGroupRatio !== undefined && {
          intraGroupRatio: story.explodedView.intraGroupRatio,
        }),
      };

      return {
        activeStoryId: storyId,
        previousStoryState: previousState,
        activeLayers: story.activeLayers,
        explodedView: newExplodedView,
      };
    }),

  clearStory: () =>
    set((state) => {
      if (!state.previousStoryState) {
        return { activeStoryId: null };
      }

      return {
        activeStoryId: null,
        previousStoryState: null,
        activeLayers: state.previousStoryState.activeLayers,
        explodedView: state.previousStoryState.explodedView,
      };
    }),

  // Visual settings
  globalOpacity: 100,
  setGlobalOpacity: (opacity: number) => set({ globalOpacity: opacity }),
  layerStyleOverrides: new Map<string, LayerStyleOverride>(),
  setLayerStyleOverride: (layerId: string, override: LayerStyleOverride) =>
    set((state) => {
      const newMap = new Map(state.layerStyleOverrides);
      newMap.set(layerId, override);
      return { layerStyleOverrides: newMap };
    }),
  clearLayerStyleOverrides: () => set({ layerStyleOverrides: new Map<string, LayerStyleOverride>() }),
}));

import { create } from 'zustand';
import type { AppState, ViewState, LayerData, ExplodedViewConfig } from '../types';

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

  // UI state
  hoveredLayerId: null,
  setHoveredLayerId: (layerId) => set({ hoveredLayerId: layerId }),
  isolatedLayerId: null,
  setIsolatedLayerId: (layerId) => set({ isolatedLayerId: layerId }),

  // Loading
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  loadingMessage: '',
  setLoadingMessage: (message) => set({ loadingMessage: message }),
}));

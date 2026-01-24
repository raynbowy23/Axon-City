/**
 * URL State Sync Hook
 * Synchronizes app state with URL parameters
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import {
  hasUrlState,
  getUrlState,
  updateUrl,
  createShareableState,
  generateShareUrl,
  clearUrlState,
} from '../utils/urlState';
import { calculatePolygonArea } from '../utils/geometryUtils';
import type { Polygon, SelectionPolygon } from '../types';

// Debounce delay for URL updates (ms)
const URL_UPDATE_DEBOUNCE = 1000;

/**
 * Hook to sync app state with URL
 * - On mount: reads URL and applies state if present
 * - On state change: updates URL (debounced)
 */
export function useUrlState(onAreasRestored?: (polygons: { name: string; polygon: Polygon }[]) => void) {
  const {
    viewState,
    areas,
    activeStoryId,
    activeLayers,
    explodedView,
    mapStyle,
    setViewState,
    addArea,
    renameArea,
    applyStory,
    setActiveLayers,
    setExplodedView,
    setMapStyle,
  } = useStore();

  const isInitializedRef = useRef(false);
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUrlRef = useRef<string>('');
  const areasRestoredRef = useRef(false);

  // Initialize from URL on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    if (!hasUrlState()) return;

    const urlState = getUrlState();
    if (!urlState) return;

    // Apply view state
    setViewState({
      longitude: urlState.center[0],
      latitude: urlState.center[1],
      zoom: urlState.zoom,
      pitch: urlState.pitch,
      bearing: urlState.bearing,
      maxPitch: 89,
      minPitch: 0,
    });

    // Apply map style
    if (urlState.mapStyle) {
      setMapStyle(urlState.mapStyle);
    }

    // Apply preset if specified
    if (urlState.presetId) {
      applyStory(urlState.presetId);
    } else if (urlState.activeLayers) {
      // Apply custom layers
      setActiveLayers(urlState.activeLayers);
    }

    // Apply exploded view
    if (urlState.explodedView) {
      setExplodedView({ enabled: true });
    }

    // Restore areas from URL (only if no areas exist yet)
    const currentAreas = useStore.getState().areas;
    if (urlState.areas.length > 0 && !areasRestoredRef.current && currentAreas.length === 0) {
      areasRestoredRef.current = true;

      const restoredPolygons: { name: string; polygon: Polygon }[] = [];

      for (const encodedArea of urlState.areas) {
        // Close the ring if not already closed
        const coords = [...encodedArea.coordinates];
        if (
          coords.length > 2 &&
          (coords[0][0] !== coords[coords.length - 1][0] ||
            coords[0][1] !== coords[coords.length - 1][1])
        ) {
          coords.push(coords[0]);
        }

        if (coords.length < 4) continue; // Need at least 3 points + closing point

        const polygon: Polygon = {
          type: 'Polygon',
          coordinates: [coords],
        };

        // Calculate area
        const areaKm2 = calculatePolygonArea(polygon);
        const areaM2 = areaKm2 * 1_000_000;

        // Create SelectionPolygon
        const selectionPolygon: SelectionPolygon = {
          id: `url-area-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          geometry: polygon,
          area: areaM2,
        };

        // Add area to store
        const areaId = addArea(selectionPolygon);

        // Rename if custom name provided
        if (areaId && encodedArea.name && encodedArea.name.length > 1) {
          renameArea(areaId, encodedArea.name);
        }

        restoredPolygons.push({ name: encodedArea.name, polygon });
      }

      // Notify callback that areas were restored (for triggering data fetch)
      if (restoredPolygons.length > 0 && onAreasRestored) {
        // Use setTimeout to ensure state has been updated
        setTimeout(() => {
          onAreasRestored(restoredPolygons);
        }, 100);
      }
    }
  }, [setViewState, applyStory, setActiveLayers, setExplodedView, setMapStyle, addArea, renameArea, onAreasRestored]);

  // Update URL when state changes (debounced)
  useEffect(() => {
    // Skip during initialization
    if (!isInitializedRef.current) return;

    // Clear pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      const shareableState = createShareableState(
        viewState,
        areas,
        activeStoryId,
        activeLayers,
        explodedView.enabled,
        mapStyle
      );

      const newUrl = generateShareUrl(shareableState);

      // Only update if URL changed
      if (newUrl !== lastUrlRef.current) {
        lastUrlRef.current = newUrl;
        updateUrl(shareableState);
      }
    }, URL_UPDATE_DEBOUNCE);

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [viewState, areas, activeStoryId, activeLayers, explodedView.enabled, mapStyle]);

  // Generate current share URL
  const getShareUrl = useCallback((): string => {
    const shareableState = createShareableState(
      viewState,
      areas,
      activeStoryId,
      activeLayers,
      explodedView.enabled,
      mapStyle
    );
    return generateShareUrl(shareableState);
  }, [viewState, areas, activeStoryId, activeLayers, explodedView.enabled, mapStyle]);

  // Copy share URL to clipboard
  const copyShareUrl = useCallback(async (): Promise<boolean> => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
      } catch {
        document.body.removeChild(textArea);
        return false;
      }
    }
  }, [getShareUrl]);

  // Clear URL state
  const clearUrl = useCallback(() => {
    clearUrlState();
    lastUrlRef.current = '';
  }, []);

  return {
    getShareUrl,
    copyShareUrl,
    clearUrl,
    hasUrlState: hasUrlState(),
  };
}

/**
 * Get areas from URL state
 * Returns polygons that can be used to create areas
 */
export function getAreasFromUrl(): { name: string; polygon: Polygon }[] | null {
  const urlState = getUrlState();
  if (!urlState || urlState.areas.length === 0) return null;

  return urlState.areas.map((encodedArea) => {
    // Close the ring if not already closed
    const coords = [...encodedArea.coordinates];
    if (
      coords.length > 0 &&
      (coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1])
    ) {
      coords.push(coords[0]);
    }

    const polygon: Polygon = {
      type: 'Polygon',
      coordinates: [coords],
    };

    return {
      name: encodedArea.name,
      polygon,
    };
  });
}

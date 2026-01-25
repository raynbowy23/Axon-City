import { useSyncExternalStore, useCallback } from 'react';

// Breakpoints
const MOBILE_MAX = 480;
const TABLET_MAX = 1024; // Include iPad Pro (1024px) as tablet/mobile experience

/**
 * Custom hook to detect if viewport matches a media query
 * Uses useSyncExternalStore for proper subscription pattern
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', callback);
      return () => mediaQuery.removeEventListener('change', callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Hook to detect mobile viewport (max-width: 480px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX}px)`);
}

/**
 * Hook to detect tablet viewport (481px - 768px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery(`(min-width: ${MOBILE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`);
}

/**
 * Hook to detect desktop viewport (> 768px)
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${TABLET_MAX + 1}px)`);
}

/**
 * Hook to detect touch device
 * Uses useSyncExternalStore for consistency
 */
export function useIsTouchDevice(): boolean {
  const subscribe = useCallback(() => {
    // Touch capability doesn't change, so no subscription needed
    return () => {};
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - msMaxTouchPoints is IE specific
      navigator.msMaxTouchPoints > 0
    );
  }, []);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Hook that returns the current device type
 */
export function useDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}

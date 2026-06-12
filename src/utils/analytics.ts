/**
 * Product analytics via Umami (https://umami.is)
 *
 * Loads the Umami tracker only when VITE_UMAMI_SRC and
 * VITE_UMAMI_WEBSITE_ID are set, so dev builds and forks send nothing.
 * All tracking calls are fire-and-forget no-ops when the script is
 * missing or blocked by the browser.
 */

interface Umami {
  track: (eventName: string, eventData?: Record<string, string | number | boolean>) => void;
}

declare global {
  interface Window {
    umami?: Umami;
  }
}

export type AnalyticsEvent =
  | 'preset_selected'
  | 'area_drawn'
  | 'comparison_started'
  | 'export'
  | 'share_link_copied'
  | 'rate_limited';

/** Inject the Umami script tag. Call once at startup. */
export function initAnalytics(): void {
  const src = import.meta.env.VITE_UMAMI_SRC;
  const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return;

  const script = document.createElement('script');
  script.defer = true;
  script.src = src;
  script.setAttribute('data-website-id', websiteId);
  // Restrict tracking to our own hostnames so forks/preview deploys
  // don't pollute the dashboard
  const domains = import.meta.env.VITE_UMAMI_DOMAINS;
  if (domains) {
    script.setAttribute('data-domains', domains);
  }
  document.head.appendChild(script);
}

export function trackEvent(
  name: AnalyticsEvent,
  data?: Record<string, string | number | boolean>
): void {
  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break the app
  }
}

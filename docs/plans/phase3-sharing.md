# AxonCity Phase 3: Sharing as a First-Class Feature

**Status:** ✅ COMPLETED

## Overview

Turn AxonCity outputs into **shareable social objects**. Every comparison should be one click away from Twitter, LinkedIn, or a research presentation.

**Goal:** Users share insights effortlessly; shared links preserve full context.

---

## Core Features

| Feature | Viral Impact | Practitioner Value |
|---------|--------------|-------------------|
| Shareable URLs | High | Reproducible analysis |
| PNG Snapshot | High | Report-ready images |
| Embed Code | Medium | Blog/documentation |
| PDF Export | Low | Formal reports |

---

## Feature 1: Shareable State URLs

### What Gets Encoded

| Parameter | Example | Required |
|-----------|---------|----------|
| `center` | `lng,lat` | Yes |
| `zoom` | `14` | Yes |
| `pitch` | `45` | No (default: 45) |
| `bearing` | `0` | No (default: 0) |
| `areas` | Base64 encoded polygons | Yes |
| `preset` | `built-intensity` | No |
| `layers` | `buildings-residential,parks` | No (uses preset or default) |
| `exploded` | `1` or `0` | No (default: 0) |

### URL Format

```
https://axoncity.app/?
  c=-89.4012,43.0731,14
  &p=45,0
  &a=BASE64_ENCODED_AREAS
  &s=built-intensity
  &e=1
```

### Implementation

**File:** `src/utils/urlState.ts`

```typescript
interface ShareableState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  areas: EncodedArea[];
  presetId?: string;
  activeLayers?: string[];
  explodedView: boolean;
}

// Encode state to URL params
function encodeState(state: ShareableState): string;

// Decode URL params to state
function decodeState(params: URLSearchParams): ShareableState | null;

// Compress polygon coordinates for URL
function compressPolygon(polygon: Polygon): string;

// Decompress polygon from URL
function decompressPolygon(encoded: string): Polygon;
```

### Area Encoding Strategy

Polygons can be large. Use:
1. Coordinate precision reduction (5 decimal places = ~1m accuracy)
2. Delta encoding (store differences, not absolutes)
3. Base64 encoding
4. Optional: LZ compression for complex polygons

---

## Feature 2: PNG Snapshot Export

### Snapshot Contents

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│              [MAP VISUALIZATION]                │
│                                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ Built Intensity                    Area A vs B │
│                                                 │
│ ████ Residential  ████ Commercial  ████ Industrial │
│                                                 │
│ axoncity.app              © OpenStreetMap      │
└─────────────────────────────────────────────────┘
```

### Export Options

| Option | Default | Description |
|--------|---------|-------------|
| Resolution | 1920x1080 | HD for social media |
| Include Legend | Yes | Layer colors + names |
| Include Metrics | Optional | Key stats summary |
| Include Attribution | Yes | OSM + AxonCity |
| Background | Transparent/Dark | Match map style |

### Implementation

**File:** `src/utils/snapshotExport.ts`

```typescript
interface SnapshotOptions {
  width: number;
  height: number;
  includeLegend: boolean;
  includeMetrics: boolean;
  includeAttribution: boolean;
  format: 'png' | 'jpeg';
  quality: number; // 0-1 for jpeg
}

// Capture current map view as image
async function captureMapSnapshot(
  mapRef: MapRef,
  options: SnapshotOptions
): Promise<Blob>;

// Add overlay (legend, attribution, metrics)
function addSnapshotOverlay(
  canvas: HTMLCanvasElement,
  state: OverlayState
): void;

// Trigger download
function downloadSnapshot(blob: Blob, filename: string): void;
```

### Technical Approach

1. Use `map.getCanvas().toDataURL()` for map capture
2. Create overlay canvas with legend/attribution
3. Composite both canvases
4. Export as PNG blob
5. Trigger download or copy to clipboard

---

## Feature 3: Share Dialog UI

### Desktop Layout

```
┌─────────────────────────────────────────────────┐
│ Share Comparison                            [X] │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Preview Image]                                │
│                                                 │
├─────────────────────────────────────────────────┤
│ Link                                            │
│ ┌─────────────────────────────────────────┐     │
│ │ https://axoncity.app/?c=-89.4...  [Copy]│     │
│ └─────────────────────────────────────────┘     │
│                                                 │
├─────────────────────────────────────────────────┤
│ Download                                        │
│                                                 │
│ [PNG Image]  [CSV Data]  [PDF Report]           │
│                                                 │
├─────────────────────────────────────────────────┤
│ Share to                                        │
│                                                 │
│ [Twitter]  [LinkedIn]  [Email]  [Copy Link]     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Social Share Templates

**Twitter:**
```
Comparing urban density in [Area A] vs [Area B] using @AxonCity

Key insight: [Auto-generated from metrics]

🔗 [shortened link]
```

**LinkedIn:**
```
Urban Analysis: [Preset Name]

Comparing [Area A] and [Area B]:
• POI Density: X vs Y per km²
• Diversity Index: X vs Y

Explore the interactive comparison: [link]

#UrbanPlanning #DataVisualization #OpenStreetMap
```

---

## Feature 4: Copy to Clipboard

### Options

| Format | Use Case |
|--------|----------|
| Link | Quick sharing |
| Image | Paste into docs/slides |
| Embed HTML | Blog posts |

### Embed Code

```html
<iframe
  src="https://axoncity.app/embed?c=-89.4,43.0,14&s=built-intensity"
  width="800"
  height="600"
  frameborder="0"
></iframe>
```

---

## Implementation Steps

### Step 1: URL State Management
**New File:** `src/utils/urlState.ts`
- Encode/decode shareable state
- Polygon compression
- URL parameter handling

### Step 2: URL Sync Hook
**New File:** `src/hooks/useUrlState.ts`
- Read URL on app load
- Update URL on state change (debounced)
- Handle browser back/forward

### Step 3: Snapshot Export Utility
**New File:** `src/utils/snapshotExport.ts`
- Map canvas capture
- Overlay rendering
- Download trigger

### Step 4: Share Dialog Component
**New File:** `src/components/ShareDialog.tsx`
- Preview generation
- Link copying
- Social share buttons
- Export options

### Step 5: Share Button Integration
**File:** `src/App.tsx`
- Add share button to UI
- Trigger share dialog

### Step 6: Embed Route (Optional)
**New File:** `src/pages/Embed.tsx`
- Minimal UI for iframe embedding
- Read-only view

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/utils/urlState.ts` | **NEW** - URL encoding/decoding |
| `src/utils/snapshotExport.ts` | **NEW** - PNG export |
| `src/hooks/useUrlState.ts` | **NEW** - URL sync hook |
| `src/components/ShareDialog.tsx` | **NEW** - Share UI |
| `src/components/ShareButton.tsx` | **NEW** - Trigger button |
| `src/App.tsx` | Add share button, URL sync |
| `src/types/index.ts` | Add sharing types |

---

## URL State Examples

### Minimal (just location)
```
https://axoncity.app/?c=-89.4012,43.0731,14
```

### With Preset
```
https://axoncity.app/?c=-89.4012,43.0731,14&s=bike-friendliness
```

### Full State
```
https://axoncity.app/?c=-89.4012,43.0731,14&p=60,-30&s=built-intensity&e=1&a=eyJhcmVhcyI6...
```

---

## Verification Checklist

1. **URL Sharing**
   - [ ] URL updates on state change
   - [ ] Shared URL restores exact state
   - [ ] Back/forward navigation works
   - [ ] Invalid URLs handled gracefully

2. **Snapshot Export**
   - [ ] PNG includes full map view
   - [ ] Legend renders correctly
   - [ ] Attribution visible
   - [ ] Resolution options work

3. **Share Dialog**
   - [ ] Preview generates quickly
   - [ ] Copy link works
   - [ ] Social links open correctly
   - [ ] Mobile-friendly layout

4. **Performance**
   - [ ] URL encoding is fast
   - [ ] Snapshot generation < 2s
   - [ ] No UI blocking during export

---

## Notes

- URL length limit: ~2000 chars (compress polygons if needed)
- Snapshot uses current map style (dark/light/satellite)
- Social share opens in new tab/window
- Embed view hides control panels

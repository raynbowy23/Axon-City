# AxonCity Phase 1: Preset Stories Implementation Plan

**Status:** COMPLETED

## Overview

Implement a **Preset Stories** system that lets users explore curated urban analysis perspectives with **one click**. Each story preconfigures layer visibility, camera position, and exploded view settings to highlight specific urban characteristics.

**Goal:** Users get insight instantly without any configuration.

---

## 5 Preset Stories

| # | Story | Icon | Focus | Key Layers |
|---|-------|------|-------|------------|
| 1 | Built Intensity | 🏗️ | Building density & development | All building layers |
| 2 | Amenity Access | 🏪 | POI distribution & services | Food, shopping, health, education POIs |
| 3 | Bike Friendliness | 🚴 | Cycling infrastructure | Bike lanes, bike parking, bike shops |
| 4 | Bike Friendliness | 🚴 | Cycling infrastructure | Bike lanes, bike parking, bike shops |
| 4 | Green Balance | 🌳 | Green space vs built | Parks, trees, water, buildings |
| 5 | Daily Needs | 🛒 | Essential services | Grocery, health, education, transit |

---

## Implementation Steps

### Step 1: Add Type Definitions
**File:** `src/types/index.ts`

```typescript
export interface StoryPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  activeLayers: string[];
  camera: { pitch: number; bearing: number; };
  explodedView: { enabled: boolean; layerSpacing?: number; intraGroupRatio?: number; };
}
```

### Step 2: Add POI Layers to Manifest
**File:** `src/data/layerManifest.ts`

Add new **'amenities'** group (priority 6) and 7 POI layers:

| Layer ID | Name | OSM Query | Color |
|----------|------|-----------|-------|
| `poi-food-drink` | Food & Drink | `amenity~"restaurant\|cafe\|bar\|fast_food"` | Coral [255,87,51] |
| `poi-shopping` | Shopping | `shop` | Gold [255,195,0] |
| `poi-grocery` | Grocery | `shop~"supermarket\|grocery\|convenience"` | Green [76,175,80] |
| `poi-health` | Healthcare | `amenity~"hospital\|clinic\|pharmacy"` | Red [244,67,54] |
| `poi-education` | Education | `amenity~"school\|university\|college"` | Purple [103,58,183] |
| `poi-bike-parking` | Bike Parking | `amenity="bicycle_parking"` | Cyan [0,188,212] |
| `poi-bike-shops` | Bike Services | `shop="bicycle"\|amenity="bicycle_rental"` | Teal [0,150,136] |

### Step 3: Create Story Presets Data
**New File:** `src/data/storyPresets.ts`

Define all 5 story configurations with their layer combinations, camera angles, and exploded view settings.

### Step 4: Extend Zustand Store
**File:** `src/store/useStore.ts`

Add:
- `activeStoryId: string | null`
- `previousStoryState: { activeLayers, viewState, explodedView } | null`
- `applyStory(storyId)` - saves current state, applies story config
- `clearStory()` - restores previous state

### Step 5: Create StorySelector Component
**New File:** `src/components/StorySelector.tsx`

Horizontal row of pill buttons:
- Shows icon + name for each story
- Active story highlighted in blue
- Click active story to clear and restore previous state
- Disabled during loading

### Step 6: Integrate into App Layout
**File:** `src/App.tsx`

- **Desktop:** Below logo, above area selector
- **Mobile:** Horizontal scrollable strip below search bar

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/types/index.ts` | Add StoryPreset interface |
| `src/data/layerManifest.ts` | Add amenities group + 7 POI layers |
| `src/data/storyPresets.ts` | **NEW** - Define 5 story presets |
| `src/store/useStore.ts` | Add story state & actions |
| `src/components/StorySelector.tsx` | **NEW** - Story selector UI |
| `src/App.tsx` | Integrate StorySelector |

---

## UI Design

```
Desktop Layout:
┌─────────────────────────────────────┐
│ [Logo]                              │
│                                     │
│ [🏗️ Built] [🏪 Amenity] [🚴 Bike] [🌳 Green] [🛒 Daily]
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Comparison Areas (i)            │ │
│ │ [Area 1] [Area 2] [+ Add]       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Clear Selection]                   │
└─────────────────────────────────────┘
```

Button Style:
- Inactive: Semi-transparent with white border
- Active: Blue background with glow
- Hover: Slight brightness increase

---

## Verification

1. **Build Check:** `npm run build` - no TypeScript errors
2. **Dev Server:** `npm run dev` - app loads without errors
3. **Story Application:** Click each story button, verify:
   - Correct layers become visible
   - Camera angle changes appropriately
   - Exploded view settings apply
4. **Story Clear:** Click active story again, verify previous state restores
5. **Loading State:** Stories disabled while fetching data
6. **Mobile:** Test horizontal scroll on narrow viewport

---

## Notes

- POI layers are NOT active by default (only when story applied)
- Stories preserve user's current map location (only change pitch/bearing)
- No customization in Phase 1 - pure presets for simplicity

---

## Implementation Notes (Post-Completion)

### Changes from Original Plan:
1. **UI Location:** Moved from left side (below logo) to right side ControlPanel for better UX
2. **Layout:** Changed from horizontal pills to vertical list with descriptions
3. **Camera:** Removed camera view changes - presets only change layers and exploded view settings
4. **Naming:** Renamed from "Quick Stories" to "Analysis Presets"
5. **Auto-fetch:** Added automatic data fetching when new layers are activated with an existing selection

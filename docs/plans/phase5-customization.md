# AxonCity Phase 5: Lightweight Customization

## Overview

After virality is established, give power users the ability to **tweak presets** without overwhelming new users. Customization is opt-in and clearly separated.

**Goal:** Power without complexity. Presets remain the default path.

---

## Design Principles

1. **Presets first** — Customization is secondary
2. **Progressive disclosure** — Advanced options hidden by default
3. **Save & share** — Custom configurations are shareable
4. **No dead ends** — Always easy to return to presets

---

## Feature 1: Preset Tweaking

### Concept

Users start with a preset, then modify it:

```
┌─────────────────────────────────────────────────────────┐
│ Built Intensity                              [Customize]│
├─────────────────────────────────────────────────────────┤
│ Based on preset, with your modifications:               │
│                                                         │
│ Layers: [✓] Residential [✓] Commercial [ ] Industrial   │
│                                                         │
│ [Reset to Preset]                    [Save as Custom]   │
└─────────────────────────────────────────────────────────┘
```

### Customizable Properties

| Property | Preset Default | User Can Change |
|----------|----------------|-----------------|
| Active Layers | Preset-defined | Add/remove layers |
| Exploded View | Preset-defined | Toggle on/off |
| Layer Spacing | Preset-defined | Adjust slider |
| Layer Order | Default | Drag to reorder |

### What Stays Locked

- Metric calculations (consistency)
- Color mappings (recognizability)
- Data sources (integrity)

### Implementation

**Update:** `src/store/useStore.ts`

```typescript
interface CustomPreset {
  id: string;
  name: string;
  basePresetId: string;      // Which preset it's based on
  modifications: {
    addedLayers: string[];
    removedLayers: string[];
    explodedView?: boolean;
    layerSpacing?: number;
  };
  createdAt: Date;
}

// Store additions
customPresets: CustomPreset[];
addCustomPreset: (preset: CustomPreset) => void;
updateCustomPreset: (id: string, mods: Partial<CustomPreset>) => void;
deleteCustomPreset: (id: string) => void;
```

---

## Feature 2: Custom Preset Library

### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│ Analysis Presets                                        │
├─────────────────────────────────────────────────────────┤
│ Built-in                                                │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🏗️ Built Intensity                                 │ │
│ │ 🏪 Amenity Access                                   │ │
│ │ 🚴 Bike Friendliness                               │ │
│ │ 🌳 Green Balance                                    │ │
│ │ 🛒 Daily Needs                                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ My Presets                                          [+] │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🎨 Transit + Green (based on Green Balance)    [⋮] │ │
│ │ 🎨 Full Infrastructure (based on Built)        [⋮] │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Custom Preset Menu [⋮]

- Edit
- Duplicate
- Share
- Delete

### Storage

Custom presets stored in:
1. localStorage (default)
2. URL params (when shared)
3. Future: user accounts

---

## Feature 3: Layer Combination Builder

### Quick Layer Toggle

```
┌─────────────────────────────────────────────────────────┐
│ Layer Selection                                         │
├─────────────────────────────────────────────────────────┤
│ Quick Select:                                           │
│ [All Buildings] [All POIs] [All Transport] [Clear]      │
│                                                         │
│ Buildings                                               │
│ [✓] Residential  [✓] Commercial  [ ] Industrial         │
│ [ ] Other                                               │
│                                                         │
│ Amenities                                               │
│ [✓] Food & Drink  [ ] Shopping  [✓] Healthcare          │
│ [ ] Education  [ ] Grocery                              │
│                                                         │
│ Transport                                               │
│ [ ] Transit Stops  [ ] Rail Lines  [✓] Bike Lanes       │
│                                                         │
│ Environment                                             │
│ [✓] Parks  [ ] Trees  [ ] Water                         │
└─────────────────────────────────────────────────────────┘
```

### Smart Suggestions

Based on current selection, suggest related layers:

```
💡 You've selected Healthcare. Also consider:
   [+ Add Transit Stops] for accessibility analysis
```

---

## Feature 4: Visual Mapping Customization

### Height Metric Selector

```
┌─────────────────────────────────────────────────────────┐
│ Height Mapping (3D)                                     │
├─────────────────────────────────────────────────────────┤
│ Current: Building actual height                         │
│                                                         │
│ Change to:                                              │
│ ○ Actual height (default)                              │
│ ○ POI density                                          │
│ ○ Building count                                       │
│ ○ Uniform (flat comparison)                            │
└─────────────────────────────────────────────────────────┘
```

### Color Metric Selector

```
┌─────────────────────────────────────────────────────────┐
│ Color Mapping                                           │
├─────────────────────────────────────────────────────────┤
│ Current: Layer type (categorical)                       │
│                                                         │
│ Change to:                                              │
│ ○ Layer type (default)                                 │
│ ○ POI category                                         │
│ ○ Building age (if available)                          │
│ ○ Single color (simplified)                            │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**New File:** `src/components/VisualMappingControls.tsx`

```typescript
interface VisualMapping {
  heightMetric: 'actual' | 'poi_density' | 'building_count' | 'uniform';
  colorMetric: 'layer_type' | 'poi_category' | 'building_age' | 'single';
  colorScheme: string;  // Color palette name
}
```

---

## Feature 5: Area Shape Tools

### Drawing Enhancements

| Tool | Description |
|------|-------------|
| Freehand | Current behavior |
| Rectangle | Click-drag rectangle |
| Circle | Click-drag radius |
| Snap to boundary | Snap to admin boundaries (future) |

### Shape Adjustments

```
┌─────────────────────────────────────────────────────────┐
│ Area Shape                                              │
├─────────────────────────────────────────────────────────┤
│ [Edit Vertices]  [Buffer +/-]  [Simplify]               │
│                                                         │
│ Buffer: [-] ████████░░ [+]  200m                       │
│                                                         │
│ Simplify vertices: 24 → 12 points                       │
└─────────────────────────────────────────────────────────┘
```

### Buffer Tool

Expand or contract area boundary:

```typescript
function bufferPolygon(
  polygon: Polygon,
  distanceMeters: number  // positive = expand, negative = contract
): Polygon;
```

---

## Implementation Steps

### Step 1: Custom Preset Data Model
**Update:** `src/types/index.ts`
**Update:** `src/store/useStore.ts`
- Add CustomPreset interface
- Add CRUD operations
- localStorage persistence

### Step 2: Preset Customization UI
**New File:** `src/components/PresetCustomizer.tsx`
- Layer toggle grid
- Exploded view controls
- Save/reset buttons

### Step 3: Custom Preset Library
**New File:** `src/components/CustomPresetLibrary.tsx`
- List user's custom presets
- Edit/delete/share actions
- Import from URL

### Step 4: Visual Mapping Controls
**New File:** `src/components/VisualMappingControls.tsx`
- Height metric selector
- Color metric selector
- Preview updates

### Step 5: Enhanced Drawing Tools
**New File:** `src/components/DrawingTools.tsx`
**Update:** `src/hooks/usePolygonDrawing.ts`
- Rectangle drawing mode
- Circle drawing mode
- Tool selector UI

### Step 6: Buffer Tool
**New File:** `src/utils/polygonBuffer.ts`
**New File:** `src/components/BufferControl.tsx`
- Turf.js buffer implementation
- Slider UI

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/types/index.ts` | Add CustomPreset, VisualMapping types |
| `src/store/useStore.ts` | Add custom preset state & actions |
| `src/components/PresetCustomizer.tsx` | **NEW** - Tweak presets |
| `src/components/CustomPresetLibrary.tsx` | **NEW** - Manage custom presets |
| `src/components/VisualMappingControls.tsx` | **NEW** - Height/color mapping |
| `src/components/DrawingTools.tsx` | **NEW** - Shape tool selector |
| `src/components/BufferControl.tsx` | **NEW** - Buffer slider |
| `src/utils/polygonBuffer.ts` | **NEW** - Buffer calculation |
| `src/hooks/usePolygonDrawing.ts` | Add rectangle/circle modes |
| `src/components/StorySelector.tsx` | Show custom presets section |

---

## UX Guidelines

### Progressive Disclosure

1. **Level 0 (Default):** Presets only, no customization visible
2. **Level 1 (Curious):** "Customize" button reveals layer toggles
3. **Level 2 (Power):** Visual mapping controls, shape tools
4. **Level 3 (Expert):** Custom preset library, import/export

### Clear Exit Paths

Every customization screen has:
- "Reset to Preset" button
- "Cancel" to discard changes
- Clear indication of what's modified

### Shareable Customizations

Custom presets encode in URL:
```
https://axoncity.app/?custom=BASE64_ENCODED_PRESET
```

---

## Verification Checklist

1. **Preset Tweaking**
   - [ ] Can modify layer selection
   - [ ] Changes reflect immediately
   - [ ] Reset returns to original preset
   - [ ] Save creates new custom preset

2. **Custom Preset Library**
   - [ ] Presets persist in localStorage
   - [ ] Can edit/delete custom presets
   - [ ] Can share via URL
   - [ ] Import from URL works

3. **Visual Mapping**
   - [ ] Height metric changes 3D view
   - [ ] Color metric changes colors
   - [ ] Changes are immediate

4. **Drawing Tools**
   - [ ] Rectangle tool works
   - [ ] Circle tool works
   - [ ] Can switch between tools

5. **Buffer Tool**
   - [ ] Positive buffer expands area
   - [ ] Negative buffer contracts
   - [ ] Handles edge cases

---

## Notes

- Custom presets limited to 10 per user (localStorage)
- Visual mapping requires metric data to be loaded
- Buffer uses Turf.js for geodesic accuracy
- Rectangle/circle convert to polygon internally

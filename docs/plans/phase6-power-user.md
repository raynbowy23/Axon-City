# AxonCity Phase 6: Power User Mode

## Overview

Support **research and professional workflows** without confusing casual users. Power features are clearly separated in an "Advanced" mode.

**Goal:** Enable academic research, consulting work, and batch analysis while keeping the default experience simple.

---

## Design Principles

1. **Explicit opt-in** — Power mode is a conscious choice
2. **Clear separation** — Advanced UI distinct from default
3. **Full data access** — Researchers get raw data
4. **Reproducibility** — Every analysis is exportable and repeatable

---

## Feature 1: Advanced Mode Toggle

### Entry Point

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                            [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Mode                                                    │
│ ○ Standard (recommended for most users)                │
│ ● Advanced (research & professional features)          │
│                                                         │
│ ⚠️ Advanced mode shows additional controls and         │
│    data export options for power users.                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### What Changes in Advanced Mode

| Feature | Standard | Advanced |
|---------|----------|----------|
| Layer controls | Grouped presets | Individual layer toggles + raw queries |
| Metrics | Pre-calculated | Custom formulas |
| Export | PNG, CSV summary | Full GeoJSON, raw OSM data |
| Areas | Max 4 | Max 10 |
| Data input | None | CSV/GeoJSON import |
| API access | None | Query builder |

---

## Feature 2: Custom Data Import

### Supported Formats

| Format | Use Case |
|--------|----------|
| GeoJSON | Spatial data with geometries |
| CSV with coordinates | Point data (lat/lon columns) |
| CSV with WKT | Complex geometries |
| Shapefile (zipped) | Legacy GIS data |

### Import Dialog

```
┌─────────────────────────────────────────────────────────┐
│ Import Custom Data                                  [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │                                                     │ │
│ │     Drop file here or click to browse              │ │
│ │                                                     │ │
│ │     Supported: .geojson, .csv, .json, .zip         │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ CSV Options (if CSV detected):                          │
│ Latitude column:  [lat     ▼]                          │
│ Longitude column: [lon     ▼]                          │
│ Name column:      [name    ▼]                          │
│                                                         │
│ Layer Settings:                                         │
│ Layer name: [My Custom Data        ]                   │
│ Color:      [████] #4A90D9                             │
│ Type:       ○ Points  ○ Lines  ○ Polygons              │
│                                                         │
│                          [Cancel]  [Import]             │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**Update:** `src/components/DataInputPanel.tsx` (already exists, enhance)

```typescript
interface ImportConfig {
  file: File;
  format: 'geojson' | 'csv' | 'shapefile';
  csvOptions?: {
    latColumn: string;
    lonColumn: string;
    nameColumn?: string;
    delimiter: string;
  };
  layerConfig: {
    name: string;
    color: [number, number, number];
    geometryType: 'point' | 'line' | 'polygon';
  };
}

async function importCustomData(config: ImportConfig): Promise<FeatureCollection>;
```

---

## Feature 3: External Index Integration

### Concept

Allow users to bring their own metrics/indices and map them to areas:

```
┌─────────────────────────────────────────────────────────┐
│ External Indices                                        │
├─────────────────────────────────────────────────────────┤
│ Loaded Indices:                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Walk Score (2024)                              [x]  │ │
│ │ Transit Score (2024)                           [x]  │ │
│ │ My Custom Index                                [x]  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [+ Import Index from CSV]                               │
│                                                         │
│ Map index to visual:                                    │
│ Height: [Walk Score        ▼]                          │
│ Color:  [Transit Score     ▼]                          │
└─────────────────────────────────────────────────────────┘
```

### Index CSV Format

```csv
area_id,walk_score,transit_score,custom_index
area-1,85,72,0.45
area-2,62,45,0.31
```

### Implementation

**New File:** `src/utils/externalIndices.ts`

```typescript
interface ExternalIndex {
  id: string;
  name: string;
  source: string;
  values: Map<string, number>;  // area_id -> value
  min: number;
  max: number;
  unit?: string;
}

function importIndexFromCSV(file: File): Promise<ExternalIndex>;
function mapIndexToAreas(index: ExternalIndex, areas: ComparisonArea[]): void;
```

---

## Feature 4: Batch Area Analysis

### Multi-Area Comparison (>4 areas)

```
┌─────────────────────────────────────────────────────────┐
│ Batch Analysis                                          │
├─────────────────────────────────────────────────────────┤
│ Areas loaded: 12                                        │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Area          POI Density  Diversity  Green %       │ │
│ │ Downtown      423/km²      2.14       8%            │ │
│ │ Midtown       312/km²      1.87       12%           │ │
│ │ Uptown        245/km²      1.65       18%           │ │
│ │ ... (9 more)                                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Sort by: [POI Density ▼]  [Ascending ○ Descending ●]   │
│                                                         │
│ [Export All to CSV]  [Export to GeoJSON]               │
└─────────────────────────────────────────────────────────┘
```

### Ranking View

```
┌─────────────────────────────────────────────────────────┐
│ Area Rankings                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ POI Density (per km²)                                   │
│ 1. Downtown      ████████████████████  423              │
│ 2. Midtown       ██████████████░░░░░░  312              │
│ 3. Uptown        ███████████░░░░░░░░░  245              │
│ 4. Suburbs       ████░░░░░░░░░░░░░░░░   98              │
│                                                         │
│ Diversity Index                                         │
│ 1. Downtown      ████████████████████  2.14             │
│ 2. Midtown       █████████████████░░░  1.87             │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**New File:** `src/components/BatchAnalysis.tsx`

```typescript
interface BatchAnalysisProps {
  areas: ComparisonArea[];
  metrics: MetricDefinition[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}
```

---

## Feature 5: Full Data Export

### Export Options

| Format | Contents | Use Case |
|--------|----------|----------|
| CSV Summary | Metrics only | Spreadsheet analysis |
| CSV Full | All POIs with attributes | Data science |
| GeoJSON | Geometries + properties | GIS software |
| Raw OSM | Original Overpass response | Reproducibility |

### Export Dialog

```
┌─────────────────────────────────────────────────────────┐
│ Export Data                                         [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ What to export:                                         │
│ [✓] Metrics summary                                    │
│ [✓] POI data (points)                                  │
│ [ ] Building data (polygons)                           │
│ [✓] Area boundaries                                    │
│ [ ] Raw OSM responses                                  │
│                                                         │
│ Format:                                                 │
│ ○ CSV (separate files)                                 │
│ ○ GeoJSON (single file)                               │
│ ● GeoPackage (.gpkg)                                   │
│                                                         │
│ Include:                                                │
│ [✓] Methodology documentation                          │
│ [✓] Data source attribution                           │
│ [✓] Query parameters (for reproducibility)            │
│                                                         │
│                          [Cancel]  [Export]             │
└─────────────────────────────────────────────────────────┘
```

### Reproducibility Package

Export includes `methodology.md`:

```markdown
# AxonCity Analysis Export

## Query Parameters
- Date: 2024-01-23 14:32 UTC
- Preset: Built Intensity
- Areas: 2 (see boundaries.geojson)

## Data Sources
- OpenStreetMap via Overpass API
- Endpoint: overpass-api.de

## Overpass Queries Used

### Buildings - Residential
```overpass
[out:json][timeout:90];
(
  way["building"~"residential|house|apartments"](bbox);
);
out body geom;
```

## Metrics Methodology
- POI Density: count / area_km²
- Diversity Index: Shannon entropy H = -Σ(pᵢ × ln(pᵢ))
```

---

## Feature 6: Query Builder (Advanced)

### Custom Overpass Queries

For researchers who need specific OSM data:

```
┌─────────────────────────────────────────────────────────┐
│ Custom Query Builder                                [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Query Name: [EV Charging Stations    ]                 │
│                                                         │
│ Overpass Query:                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ node["amenity"="charging_station"]                  │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Geometry type: ○ Point  ○ Line  ○ Polygon              │
│ Color: [████] #00BCD4                                  │
│                                                         │
│ [Test Query]  [Save as Layer]                          │
│                                                         │
│ Result preview:                                         │
│ Found 23 features in current bbox                      │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**New File:** `src/components/QueryBuilder.tsx`

```typescript
interface CustomQuery {
  id: string;
  name: string;
  query: string;           // Overpass QL
  geometryType: GeometryType;
  style: LayerStyle;
  createdAt: Date;
}
```

---

## Implementation Steps

### Step 1: Advanced Mode Toggle
**New File:** `src/components/AdvancedModeToggle.tsx`
**Update:** `src/store/useStore.ts`
- Add `isAdvancedMode` state
- Persist in localStorage

### Step 2: Enhanced Data Import
**Update:** `src/components/DataInputPanel.tsx`
- Add CSV coordinate parsing
- Add Shapefile support (via shpjs)
- Column mapping UI

### Step 3: External Index System
**New File:** `src/utils/externalIndices.ts`
**New File:** `src/components/ExternalIndicesPanel.tsx`
- Index import
- Index-to-visual mapping

### Step 4: Batch Analysis
**New File:** `src/components/BatchAnalysis.tsx`
**New File:** `src/components/RankingView.tsx`
- Multi-area table
- Sorting and ranking
- Bulk export

### Step 5: Full Data Export
**New File:** `src/utils/dataExporter.ts`
**New File:** `src/components/ExportDialog.tsx`
- Multi-format export
- Reproducibility package
- Methodology generation

### Step 6: Query Builder
**New File:** `src/components/QueryBuilder.tsx`
- Overpass query editor
- Syntax highlighting (optional)
- Query testing

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/store/useStore.ts` | Add advancedMode state |
| `src/components/AdvancedModeToggle.tsx` | **NEW** - Mode switch |
| `src/components/DataInputPanel.tsx` | Enhance CSV/Shapefile support |
| `src/utils/externalIndices.ts` | **NEW** - Index management |
| `src/components/ExternalIndicesPanel.tsx` | **NEW** - Index UI |
| `src/components/BatchAnalysis.tsx` | **NEW** - Multi-area analysis |
| `src/components/RankingView.tsx` | **NEW** - Area rankings |
| `src/utils/dataExporter.ts` | **NEW** - Export utilities |
| `src/components/ExportDialog.tsx` | **NEW** - Export UI |
| `src/components/QueryBuilder.tsx` | **NEW** - Custom queries |
| `src/types/index.ts` | Add power user types |

---

## UX Guidelines

### Clear Separation

- Advanced mode has different color accent (e.g., purple vs blue)
- "Advanced" badge on relevant controls
- Tooltip: "This feature is for power users"

### Don't Break Sharing

- Shared links work in both modes
- Advanced features degrade gracefully in standard mode
- Custom queries shareable via URL

### Help & Documentation

- In-app documentation for advanced features
- Link to tutorials/guides
- Example queries library

---

## Verification Checklist

1. **Mode Toggle**
   - [ ] Persists across sessions
   - [ ] UI changes appropriately
   - [ ] Can switch back to standard

2. **Data Import**
   - [ ] CSV with coordinates works
   - [ ] GeoJSON import works
   - [ ] Column mapping is intuitive
   - [ ] Error handling for bad data

3. **External Indices**
   - [ ] Import from CSV works
   - [ ] Can map to height/color
   - [ ] Values display correctly

4. **Batch Analysis**
   - [ ] Handles 10+ areas
   - [ ] Sorting works
   - [ ] Export includes all areas

5. **Full Export**
   - [ ] All formats work
   - [ ] Methodology doc is accurate
   - [ ] Queries are reproducible

6. **Query Builder**
   - [ ] Query executes correctly
   - [ ] Results display properly
   - [ ] Can save as layer

---

## Notes

- Advanced mode is NOT the default, ever
- Power features don't appear in standard mode
- Batch analysis may need server-side support for large areas
- Query builder requires basic Overpass knowledge (provide examples)
- External indices are area-specific (not saved globally)

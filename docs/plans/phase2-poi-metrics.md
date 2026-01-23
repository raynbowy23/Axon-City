# AxonCity Phase 2: POI-Driven Metrics Implementation Plan

**Status:** ✅ COMPLETED

## Overview

Implement **practitioner-grade POI metrics** that provide credible, citable urban analysis. Every metric includes methodology transparency and data source attribution.

**Goal:** Practitioners can use AxonCity outputs in reports, presentations, and research with confidence.

---

## Core Metrics

| Metric | Formula | Unit | Why Practitioners Care |
|--------|---------|------|----------------------|
| POI Count | `n` | count | Basic inventory |
| POI Density | `n / area_km²` | per km² | Comparable across areas |
| POI Diversity | Shannon Index `H = -Σ(pᵢ × ln(pᵢ))` | index (0-∞) | Measures mix vs monoculture |
| Category Share | `category_n / total_n × 100` | % | Composition breakdown |
| Coverage Score | `categories_present / categories_possible × 100` | % | Data completeness signal |

---

## POI Categories (Aligned with Analysis Presets)

| Category ID | Display Name | Included Layers | Color |
|-------------|--------------|-----------------|-------|
| `food` | Food & Dining | poi-food-drink | Coral |
| `shopping` | Retail & Shopping | poi-shopping | Gold |
| `grocery` | Grocery & Convenience | poi-grocery | Green |
| `health` | Healthcare | poi-health | Red |
| `education` | Education | poi-education | Purple |
| `bike` | Cycling Infrastructure | poi-bike-parking, poi-bike-shops, bike-lanes | Cyan |
| `transit` | Public Transit | transit-stops, rail-lines | Blue |
| `green` | Green Space | parks, trees | Forest Green |

---

## Implementation Steps

### Step 1: Create Metrics Calculation Utilities
**New File:** `src/utils/metricsCalculator.ts`

```typescript
interface POIMetrics {
  totalCount: number;
  density: number;           // per km²
  diversityIndex: number;    // Shannon index
  categoryBreakdown: CategoryMetric[];
  coverageScore: number;     // 0-100%
  dataTimestamp: string;     // OSM data freshness
}

interface CategoryMetric {
  id: string;
  name: string;
  count: number;
  density: number;
  share: number;             // percentage
  color: [number, number, number];
}

// Shannon Diversity Index
function calculateDiversityIndex(counts: number[]): number;

// Coverage score based on non-zero categories
function calculateCoverageScore(breakdown: CategoryMetric[]): number;
```

### Step 2: Create Metrics Display Component
**New File:** `src/components/MetricsPanel.tsx`

Features:
- Collapsible category breakdown
- Comparison bars for multi-area view
- Methodology tooltip on each metric
- "Export CSV" button

### Step 3: Add Methodology Tooltips
**New File:** `src/data/metricDefinitions.ts`

```typescript
interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  description: string;
  citation?: string;         // Academic reference if applicable
  interpretation: string;    // "Higher means..."
}
```

### Step 4: Add Data Attribution Component
**New File:** `src/components/DataAttribution.tsx`

Displays:
- "Data: OpenStreetMap contributors"
- Query timestamp
- Coverage disclaimer
- Link to OSM

### Step 5: Implement CSV Export
**New File:** `src/utils/exportMetrics.ts`

Export format:
```csv
Area,Category,Count,Density (per km²),Share (%)
Area A,Food & Dining,45,12.3,18.2
Area A,Healthcare,12,3.3,4.9
...
```

### Step 6: Integrate into StatsPanel
**File:** `src/components/StatsPanel.tsx`

Add:
- POI Metrics section (collapsible)
- Diversity index with interpretation
- Category breakdown chart
- Export button
- Data attribution footer

---

## UI Design

### Metrics Panel (Desktop)

```
┌─────────────────────────────────────┐
│ POI Analysis                    [?] │
├─────────────────────────────────────┤
│                                     │
│ Total POIs         127    vs   89   │
│ Density         34.2/km²   24.1/km² │
│ Diversity Index   1.82      1.45    │
│                  (High)    (Medium) │
│                                     │
├─────────────────────────────────────┤
│ Category Breakdown            [▼]   │
│                                     │
│ Food & Dining ████████░░  32 (25%)  │
│ Shopping      ██████░░░░  24 (19%)  │
│ Healthcare    ███░░░░░░░  12 (9%)   │
│ Education     ██░░░░░░░░   8 (6%)   │
│ ...                                 │
│                                     │
├─────────────────────────────────────┤
│ Coverage: 87% of categories present │
│                                     │
│ [Export CSV]                        │
│                                     │
│ ─────────────────────────────────── │
│ Data: © OpenStreetMap contributors  │
│ Queried: 2024-01-23 14:32 UTC       │
│ Methodology [?]                     │
└─────────────────────────────────────┘
```

### Methodology Tooltip Example

```
┌─────────────────────────────────────┐
│ Diversity Index (Shannon)           │
│                                     │
│ Formula: H = -Σ(pᵢ × ln(pᵢ))        │
│                                     │
│ Measures how evenly POIs are        │
│ distributed across categories.      │
│                                     │
│ Interpretation:                     │
│ • 0 = Single category only          │
│ • 1-2 = Moderate mix                │
│ • 2+ = High diversity               │
│                                     │
│ Reference: Shannon, C.E. (1948)     │
└─────────────────────────────────────┘
```

### Comparison View (Multi-Area)

```
┌─────────────────────────────────────┐
│ POI Comparison                      │
├─────────────────────────────────────┤
│              Area A    Area B   Δ%  │
│ Total POIs     127        89   +43% │
│ Density      34.2      24.1   +42% │
│ Diversity    1.82      1.45   +26% │
├─────────────────────────────────────┤
│ Top Differences:                    │
│ • Food & Dining: +67% in Area A     │
│ • Healthcare: -23% in Area A        │
└─────────────────────────────────────┘
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/utils/metricsCalculator.ts` | **NEW** - Core metric calculations |
| `src/utils/exportMetrics.ts` | **NEW** - CSV export functionality |
| `src/data/metricDefinitions.ts` | **NEW** - Methodology definitions |
| `src/components/MetricsPanel.tsx` | **NEW** - Metrics display UI |
| `src/components/DataAttribution.tsx` | **NEW** - OSM attribution |
| `src/components/StatsPanel.tsx` | Integrate MetricsPanel |
| `src/types/index.ts` | Add metric type definitions |

---

## Practitioner-Grade Details

### Academic Credibility

1. **Shannon Diversity Index** - Widely used in ecology and urban studies
   - Citation: Shannon, C.E. (1948). "A Mathematical Theory of Communication"

2. **Density normalization** - Standard practice in urban planning
   - Allows comparison across different-sized areas

3. **Category taxonomy** - Based on OSM standard tags
   - Reproducible by others using same queries

### Transparency Features

1. **Methodology tooltips** on every metric
2. **Formula visibility** for practitioners who want to verify
3. **Data source attribution** (OSM + timestamp)
4. **Coverage disclaimer** - Honest about data limitations

### Export for Reports

CSV export includes:
- Raw counts
- Calculated metrics
- Area metadata
- Query parameters
- Timestamp

Practitioners can paste directly into reports or further analyze.

---

## Verification Checklist

1. **Metrics Accuracy**
   - [ ] Shannon index matches manual calculation
   - [ ] Density correctly uses area in km²
   - [ ] Percentages sum to 100%

2. **UI/UX**
   - [ ] Tooltips appear on hover/tap
   - [ ] Comparison view shows deltas
   - [ ] Mobile-friendly layout

3. **Export**
   - [ ] CSV downloads correctly
   - [ ] All metrics included
   - [ ] Proper encoding (UTF-8)

4. **Attribution**
   - [ ] OSM credit visible
   - [ ] Timestamp accurate
   - [ ] Methodology link works

---

## Implementation Order

1. **metricsCalculator.ts** - Core logic first
2. **metricDefinitions.ts** - Methodology content
3. **MetricsPanel.tsx** - Basic display
4. **DataAttribution.tsx** - Attribution component
5. **StatsPanel.tsx integration** - Wire it together
6. **exportMetrics.ts** - CSV export last
7. **Comparison enhancements** - Delta calculations

---

## Notes

- Metrics only calculate when POI layers have data
- Empty categories show as 0, not hidden (transparency)
- Diversity index returns 0 if only one category present
- CSV export uses ISO 8601 timestamps

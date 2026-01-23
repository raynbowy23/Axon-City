# AxonCity Phase 4: Comparison Clarity & Credibility

## Overview

As usage grows, prevent misinterpretation and build trust. Add **numeric anchors**, **contextual guidance**, and **data quality signals**.

**Goal:** Users understand what they're seeing and trust the data.

---

## Core Features

| Feature | Purpose |
|---------|---------|
| Comparison Table | Side-by-side numeric view |
| Delta Highlights | Instant difference recognition |
| Normalization Toggle | Fair comparisons |
| Trust Signals | Data quality transparency |
| Interpretation Guide | Prevent misuse |

---

## Feature 1: Compact Comparison Table

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Comparison Summary                              [Export]│
├─────────────────────────────────────────────────────────┤
│                    Area A      Area B      Δ           │
├─────────────────────────────────────────────────────────┤
│ Area              0.37 km²    0.52 km²    +41%         │
│ Total POIs        127         89          +43%  ▲      │
│ POI Density       343/km²     171/km²     +101% ▲▲     │
│ Diversity Index   1.82        1.45        +26%  ▲      │
├─────────────────────────────────────────────────────────┤
│ Buildings         234         312         -25%  ▼      │
│ Building Density  632/km²     600/km²     +5%          │
│ Green Space       12%         8%          +50%  ▲      │
└─────────────────────────────────────────────────────────┘
```

### Delta Indicators

| Symbol | Meaning | Threshold |
|--------|---------|-----------|
| ▲▲ | Much higher | >50% |
| ▲ | Higher | 10-50% |
| (blank) | Similar | -10% to +10% |
| ▼ | Lower | -10% to -50% |
| ▼▼ | Much lower | <-50% |

### Implementation

**New File:** `src/components/ComparisonTable.tsx`

```typescript
interface ComparisonRow {
  metric: string;
  values: number[];      // One per area
  unit: string;
  delta: number;         // Percentage difference
  deltaIndicator: '▲▲' | '▲' | '' | '▼' | '▼▼';
  tooltip?: string;
}

interface ComparisonTableProps {
  areas: ComparisonArea[];
  metrics: ComparisonRow[];
  onExport: () => void;
}
```

---

## Feature 2: Normalization Controls

### Problem
Comparing a 0.3 km² area to a 1.2 km² area using raw counts is misleading.

### Solution
Toggle between:

| Mode | Description | When to Use |
|------|-------------|-------------|
| Raw Counts | Absolute numbers | "How many total?" |
| Per km² | Density normalized | "How concentrated?" |
| Per Capita* | Population normalized | "Per resident access" |

*Per capita requires external population data (Phase 6)

### UI

```
┌─────────────────────────────────────┐
│ Normalize by:                       │
│ ○ Raw counts                        │
│ ● Per km² (recommended)             │
│ ○ Per capita (requires data)        │
└─────────────────────────────────────┘
```

### Implementation

**Update:** `src/store/useStore.ts`

```typescript
type NormalizationMode = 'raw' | 'per_km2' | 'per_capita';

// Add to store
normalizationMode: NormalizationMode;
setNormalizationMode: (mode: NormalizationMode) => void;
```

---

## Feature 3: Trust Signals

### Data Source Attribution

```
┌─────────────────────────────────────────────────────────┐
│ Data Quality                                            │
├─────────────────────────────────────────────────────────┤
│ Source: OpenStreetMap                                   │
│ Last Updated: 2024-01-23                                │
│ Coverage: 87% of expected categories                    │
│                                                         │
│ ⚠️ Healthcare data may be incomplete in this region     │
└─────────────────────────────────────────────────────────┘
```

### Coverage Indicators

| Score | Label | Color | Meaning |
|-------|-------|-------|---------|
| 90-100% | Excellent | Green | All categories present |
| 70-89% | Good | Blue | Most categories present |
| 50-69% | Partial | Yellow | Some gaps |
| <50% | Limited | Red | Significant gaps |

### Completeness Warnings

Auto-detect and warn about:
- Categories with 0 count (may be data gap, not reality)
- Unusually low counts compared to area size
- Known OSM coverage issues by region

### Implementation

**New File:** `src/components/DataQualityIndicator.tsx`

```typescript
interface DataQuality {
  overallScore: number;          // 0-100
  categoryScores: CategoryScore[];
  warnings: QualityWarning[];
  lastUpdated: Date;
}

interface QualityWarning {
  type: 'missing_category' | 'low_count' | 'region_coverage';
  message: string;
  severity: 'info' | 'warning' | 'caution';
}
```

---

## Feature 4: Metric Tooltips & Interpretation

### Every Metric Gets a Tooltip

```
┌─────────────────────────────────────────────────────────┐
│ POI Diversity Index                                 [?] │
│ 1.82 (High)                                             │
├─────────────────────────────────────────────────────────┤
│ [?] Tooltip:                                            │
│                                                         │
│ Shannon Diversity Index measures how evenly POIs        │
│ are distributed across categories.                      │
│                                                         │
│ Formula: H = -Σ(pᵢ × ln(pᵢ))                           │
│                                                         │
│ Interpretation:                                         │
│ • 0-0.5: Low (dominated by 1-2 categories)             │
│ • 0.5-1.5: Moderate (some variety)                     │
│ • 1.5-2.5: High (good mix)                             │
│ • 2.5+: Very High (exceptional diversity)              │
│                                                         │
│ This area's score of 1.82 indicates a healthy mix      │
│ of amenity types.                                       │
└─────────────────────────────────────────────────────────┘
```

### Contextual Interpretation

Don't just show numbers — explain what they mean:

| Metric | Value | Auto-Interpretation |
|--------|-------|---------------------|
| POI Density | 343/km² | "High density - urban core typical" |
| POI Density | 45/km² | "Low density - suburban typical" |
| Diversity | 1.82 | "Good mix of amenity types" |
| Diversity | 0.3 | "Dominated by single category" |

### Implementation

**Update:** `src/data/metricDefinitions.ts`

```typescript
interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  description: string;
  interpretation: InterpretationRange[];
  citation?: string;
}

interface InterpretationRange {
  min: number;
  max: number;
  label: string;
  description: string;
}

// Auto-generate interpretation text
function interpretMetric(
  metricId: string,
  value: number
): string;
```

---

## Feature 5: Comparison Guidance

### "What Does This Mean?" Panel

For users new to urban analysis:

```
┌─────────────────────────────────────────────────────────┐
│ Understanding Your Comparison                       [X] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 📊 Key Findings:                                        │
│                                                         │
│ Area A has significantly higher POI density (+101%)     │
│ suggesting a more walkable, service-rich environment.   │
│                                                         │
│ However, Area B has more buildings (-25% fewer in A),   │
│ indicating potentially lower-density development.       │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ ⚠️ Limitations:                                         │
│ • OSM data varies by region                            │
│ • Building heights estimated                            │
│ • Some POIs may be missing                             │
│                                                         │
│ [Learn more about methodology]                          │
└─────────────────────────────────────────────────────────┘
```

### Auto-Generated Insights

Based on metrics, generate 2-3 key observations:

```typescript
function generateInsights(
  areas: ComparisonArea[],
  metrics: MetricComparison[]
): Insight[];

interface Insight {
  title: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  relatedMetrics: string[];
}
```

---

## Implementation Steps

### Step 1: Comparison Table Component
**New File:** `src/components/ComparisonTable.tsx`
- Side-by-side metrics
- Delta calculations
- Visual indicators

### Step 2: Normalization Controls
**New File:** `src/components/NormalizationToggle.tsx`
**Update:** `src/store/useStore.ts`
- Add normalization mode state
- Apply to all metric displays

### Step 3: Data Quality Indicator
**New File:** `src/components/DataQualityIndicator.tsx`
- Coverage score calculation
- Warning generation
- Attribution display

### Step 4: Enhanced Tooltips
**Update:** `src/data/metricDefinitions.ts`
**New File:** `src/components/MetricTooltip.tsx`
- Rich tooltip component
- Interpretation ranges
- Formula display

### Step 5: Insights Generator
**New File:** `src/utils/insightsGenerator.ts`
- Auto-generate observations
- Rank by significance
- Add confidence levels

### Step 6: Guidance Panel
**New File:** `src/components/ComparisonGuidance.tsx`
- Aggregate insights
- Show limitations
- Link to methodology

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/components/ComparisonTable.tsx` | **NEW** - Side-by-side view |
| `src/components/NormalizationToggle.tsx` | **NEW** - Mode selector |
| `src/components/DataQualityIndicator.tsx` | **NEW** - Trust signals |
| `src/components/MetricTooltip.tsx` | **NEW** - Rich tooltips |
| `src/components/ComparisonGuidance.tsx` | **NEW** - Insights panel |
| `src/utils/insightsGenerator.ts` | **NEW** - Auto insights |
| `src/data/metricDefinitions.ts` | Add interpretation ranges |
| `src/store/useStore.ts` | Add normalization state |
| `src/types/index.ts` | Add comparison types |

---

## Verification Checklist

1. **Comparison Table**
   - [ ] Shows all metrics for all areas
   - [ ] Delta calculations correct
   - [ ] Indicators match thresholds
   - [ ] Export works

2. **Normalization**
   - [ ] Raw counts display correctly
   - [ ] Per km² calculations accurate
   - [ ] Toggle updates all views

3. **Trust Signals**
   - [ ] Coverage score accurate
   - [ ] Warnings appear when appropriate
   - [ ] Attribution always visible

4. **Tooltips**
   - [ ] Every metric has tooltip
   - [ ] Interpretation ranges correct
   - [ ] Mobile-friendly display

5. **Insights**
   - [ ] Insights generated automatically
   - [ ] Make sense for comparison
   - [ ] Don't overstate conclusions

---

## Notes

- Normalization affects all metric displays globally
- Insights use conservative language ("suggests", "may indicate")
- Quality warnings don't prevent analysis, just inform
- All interpretations include "this depends on context" caveat

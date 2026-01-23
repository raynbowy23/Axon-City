# AxonCity Implementation Plans

## Product North Star

> **"Compare places instantly. Share insights effortlessly."**

---

## Phase Overview

| Phase | Name | Status | Focus |
|-------|------|--------|-------|
| 1 | [Preset Stories](./phase1-preset-stories.md) | ✅ Complete | One-click analysis presets |
| 2 | [POI-Driven Metrics](./phase2-poi-metrics.md) | ✅ Complete | Practitioner-grade metrics |
| 3 | [Sharing](./phase3-sharing.md) | ✅ Complete | URLs, snapshots, social |
| 4 | [Comparison Clarity](./phase4-comparison-clarity.md) | 📋 Planned | Trust & interpretation |
| 5 | [Customization](./phase5-customization.md) | 📋 Planned | Power user tweaks |
| 6 | [Power User Mode](./phase6-power-user.md) | 📋 Planned | Research workflows |

---

## Recommended Build Order

### Launch-Ready (Phases 1-3)
1. ✅ **Phase 1: Preset Stories** — Users explore with one click
2. ✅ **Phase 2: POI Metrics** — Credible, citable analysis
3. ✅ **Phase 3: Sharing** — Viral distribution

### Growth (Phases 4-5)
4. **Phase 4: Comparison Clarity** — Trust at scale
5. **Phase 5: Customization** — Power without complexity

### Professional (Phase 6)
6. **Phase 6: Power User Mode** — Research & consulting

---

## Key Design Rules

1. **Presets before customization**
2. **Defaults before imports**
3. **Visual insight before numbers**
4. **Sharing before exporting**
5. **POIs over networks**

---

## What NOT to Build

- No routing
- No link-level traffic visuals
- No simulation
- No prediction models

These kill clarity and virality.

---

## File Index

### Roadmap
- [roadmap-viral-first.md](./roadmap-viral-first.md) — Master strategy document

### Phase Plans
- [phase1-preset-stories.md](./phase1-preset-stories.md) — ✅ Complete
- [phase2-poi-metrics.md](./phase2-poi-metrics.md) — ✅ Complete
- [phase3-sharing.md](./phase3-sharing.md) — ✅ Complete
- [phase4-comparison-clarity.md](./phase4-comparison-clarity.md) — Tables, normalization, trust signals
- [phase5-customization.md](./phase5-customization.md) — Preset tweaking, custom presets
- [phase6-power-user.md](./phase6-power-user.md) — Advanced mode, batch analysis, data export

---

## Quick Reference

### New Files by Phase

**Phase 2 (6 files):**
- `src/utils/metricsCalculator.ts`
- `src/utils/exportMetrics.ts`
- `src/data/metricDefinitions.ts`
- `src/components/MetricsPanel.tsx`
- `src/components/DataAttribution.tsx`

**Phase 3 (5 files):**
- `src/utils/urlState.ts`
- `src/utils/snapshotExport.ts`
- `src/hooks/useUrlState.ts`
- `src/components/ShareDialog.tsx`
- `src/components/ShareButton.tsx`

**Phase 4 (6 files):**
- `src/components/ComparisonTable.tsx`
- `src/components/NormalizationToggle.tsx`
- `src/components/DataQualityIndicator.tsx`
- `src/components/MetricTooltip.tsx`
- `src/components/ComparisonGuidance.tsx`
- `src/utils/insightsGenerator.ts`

**Phase 5 (6 files):**
- `src/components/PresetCustomizer.tsx`
- `src/components/CustomPresetLibrary.tsx`
- `src/components/VisualMappingControls.tsx`
- `src/components/DrawingTools.tsx`
- `src/components/BufferControl.tsx`
- `src/utils/polygonBuffer.ts`

**Phase 6 (8 files):**
- `src/components/AdvancedModeToggle.tsx`
- `src/utils/externalIndices.ts`
- `src/components/ExternalIndicesPanel.tsx`
- `src/components/BatchAnalysis.tsx`
- `src/components/RankingView.tsx`
- `src/utils/dataExporter.ts`
- `src/components/ExportDialog.tsx`
- `src/components/QueryBuilder.tsx`

---

## Estimated Scope

| Phase | New Files | Modified Files | Complexity |
|-------|-----------|----------------|------------|
| 2 | 5 | 2 | Medium |
| 3 | 5 | 2 | Medium |
| 4 | 6 | 3 | Medium |
| 5 | 6 | 4 | High |
| 6 | 8 | 3 | High |

---

## Success Metrics

### Viral Indicators
- Shared links per week
- PNG downloads per week
- Social mentions

### Practitioner Indicators
- CSV exports per week
- Return users (>3 sessions)
- Average areas per session

### Quality Indicators
- Time to first insight (<30s target)
- Comparison completion rate
- Share-to-visit ratio

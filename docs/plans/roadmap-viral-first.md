# AxonCity Roadmap — Viral-First Edition

## Product North Star

> **"Compare places instantly. Share insights effortlessly."**

Every feature below serves **speed, clarity, or shareability**.

---

## **Phase 1 — Preset Stories (Highest ROI)** ✅ COMPLETED

**Goal:** Users get insight in *one click*.

### Preset Story System

Create **4–6 opinionated stories** (no customization initially):

1. **🏙 Built Intensity**
   * Height: building volume / density
   * Color: avg building height
   * POIs muted

2. **🚶 Amenity Access**
   * Height: POI density
   * Color: POI diversity
   * Buildings neutral

3. **🚲 Bike Friendliness**
   * Height: bike-related POI density + bike infra proxy
   * Color: road hierarchy emphasis

4. **🌳 Green Balance**
   * Height: green/open space %
   * Color: green vs built contrast

5. *(Optional)* **🏥 Daily Needs**
   * Height: essential POIs (food, health, education)
   * Color: accessibility proxy

📌 Each preset:
* Locks metric mapping
* Locks normalization
* Sets camera + layer visibility

Users **never configure** — they explore.

---

## **Phase 2 — POI-Driven Metrics (Analytical Core)**

**Goal:** Make POIs the "language" of comparison.

### POI Metrics (Area-Level Only)

* POI count by category
* POI density (per km²)
* POI diversity index (entropy)
* Essential POI coverage (selected categories)

### Visual Mapping

* Single metric → height
* Single metric → color
* Consistent legends across areas

📌 Rule:
> Only one metric per visual channel.

This keeps visuals *shareable*.

---

## **Phase 3 — Sharing as a First-Class Feature**

**Goal:** Turn AxonCity outputs into social objects.

### Shareable State

A shared link preserves:
* Selected areas
* Preset story
* Height + color mapping
* Camera angle

### Snapshot Export

* One-click PNG export
* Includes:
  * Story name
  * Metric legend
  * Area names

### UX Touch

* "Share this comparison" CTA
* Subtle watermark / brand mark

📌 If sharing isn't obvious, virality dies.

---

## **Phase 4 — Comparison Clarity & Credibility**

**Goal:** Prevent misinterpretation as usage grows.

### Numeric Anchors

* Compact comparison table
* % difference callouts
* Per-area normalization toggle

### Trust Signals

* Data source labels (OSM)
* Metric tooltips ("How this is calculated")
* Confidence indicator (coverage completeness)

---

## **Phase 5 — Lightweight Customization (After Virality)**

**Goal:** Give power without killing simplicity.

### Customization

* Switch preset → tweak metric
* Swap height vs color metric
* Save custom story

### Shapes

* Draw polygon
* Adjust boundary buffer
* Snap (later)

---

## **Phase 6 — Power User Mode (Clearly Separated)**

**Goal:** Support research without confusing public users.

* CSV import (explicit "Advanced" mode)
* External index ingestion
* Ranking across many areas

⚠️ Never mix with default stories.

---

## **What NOT to build (still)**

* No routing
* No link-level visuals
* No simulation
* No prediction

Those kill clarity and virality.

---

## **Key Design Rules (Pin These)**

1. **Presets before customization**
2. **Defaults before imports**
3. **Visual insight before numbers**
4. **Sharing before exporting**
5. **POIs over networks**

---

## Top 3 "build this next" recommendations

If you only build **three things next**:

1. **Preset stories (4–5)** ✅ DONE
2. **POI density + diversity metrics**
3. **Shareable links + snapshot export**

Those alone can carry a public launch.

---

## Final thought

AxonCity is strongest when it feels like:

> *"A visual argument about cities."*

Preset stories **make the argument**,
POIs **ground it**,
sharing **spreads it**.

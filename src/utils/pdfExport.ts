/**
 * PDF Report Export Utility
 * Generate professional PDF reports with map snapshots and metrics
 */

import { jsPDF } from 'jspdf';
import type { ComparisonArea, Insight, Polygon, DerivedMetricValue } from '../types';
import { calculatePOIMetrics, POI_CATEGORIES, type POIMetrics } from './metricsCalculator';
import { generateInsights } from './insightsGenerator';
import { captureSnapshot, defaultSnapshotOptions } from './snapshotExport';
import { dataSourceInfo } from '../data/metricDefinitions';
import {
  calculateDerivedMetrics,
  DERIVED_METRIC_DEFINITIONS,
  getMetricInterpretation,
  formatMetricValue,
} from './externalIndices';

// PDF dimensions (A4 in mm)
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Colors
const COLORS = {
  primary: [74, 144, 217] as [number, number, number],
  text: [33, 33, 33] as [number, number, number],
  textLight: [100, 100, 100] as [number, number, number],
  background: [248, 249, 250] as [number, number, number],
  border: [200, 200, 200] as [number, number, number],
  positive: [34, 197, 94] as [number, number, number],
  caution: [234, 179, 8] as [number, number, number],
  neutral: [100, 116, 139] as [number, number, number],
};

interface ReportOptions {
  includeMap: boolean;
  includeMetrics: boolean;
  includeInsights: boolean;
  includeMethodology: boolean;
}

interface AreaWithMetrics {
  area: ComparisonArea;
  metrics: POIMetrics;
  derivedMetrics: DerivedMetricValue[];
}

/**
 * Generate PDF report for areas
 */
export async function generatePDFReport(
  areas: ComparisonArea[],
  activeLayers: string[],
  options: ReportOptions = {
    includeMap: true,
    includeMetrics: true,
    includeInsights: true,
    includeMethodology: true,
  }
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Calculate metrics for each area
  const areasWithMetrics: AreaWithMetrics[] = areas.map((area) => {
    const areaKm2 = area.polygon.area / 1_000_000;
    const metrics = calculatePOIMetrics(area.layerData, areaKm2);
    const derivedMetrics = calculateDerivedMetrics(
      area.layerData,
      areaKm2,
      area.polygon.geometry as Polygon
    );
    return { area, metrics, derivedMetrics };
  });

  // Generate insights
  const insights = generateInsights(areas);

  let yPos = MARGIN;

  // Draw header
  yPos = drawHeader(pdf, areas, yPos);

  // Draw map snapshot
  if (options.includeMap) {
    yPos = await drawMapSnapshot(pdf, areas, activeLayers, yPos);
  }

  // Draw metrics section
  if (options.includeMetrics) {
    yPos = drawMetricsSection(pdf, areasWithMetrics, yPos);
  }

  // Draw category breakdown
  if (options.includeMetrics) {
    yPos = drawCategoryBreakdown(pdf, areasWithMetrics, yPos);
  }

  // Draw urban metrics section (derived indices)
  if (options.includeMetrics) {
    yPos = drawUrbanMetricsSection(pdf, areasWithMetrics, yPos);
  }

  // Draw insights section
  if (options.includeInsights && insights.length > 0) {
    yPos = drawInsightsSection(pdf, insights, yPos);
  }

  // Draw methodology section (new page if needed)
  if (options.includeMethodology) {
    if (yPos > PAGE_HEIGHT - 80) {
      pdf.addPage();
      yPos = MARGIN;
    }
    yPos = drawMethodologySection(pdf, yPos);
  }

  // Draw footer on all pages
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    drawFooter(pdf, i, pageCount);
  }

  return pdf.output('blob');
}

/**
 * Draw report header
 */
function drawHeader(pdf: jsPDF, areas: ComparisonArea[], yPos: number): number {
  // Title
  pdf.setFontSize(24);
  pdf.setTextColor(...COLORS.primary);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Urban Analysis Report', MARGIN, yPos + 8);

  // Subtitle with area names
  yPos += 14;
  pdf.setFontSize(12);
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'normal');

  const areaNames = areas.map((a) => a.name).join(' vs ');
  pdf.text(areaNames, MARGIN, yPos);

  // Date
  yPos += 6;
  pdf.setFontSize(10);
  pdf.setTextColor(...COLORS.textLight);
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  pdf.text(`Generated: ${date}`, MARGIN, yPos);

  // Separator line
  yPos += 6;
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, yPos, PAGE_WIDTH - MARGIN, yPos);

  return yPos + 8;
}

/**
 * Draw map snapshot
 */
async function drawMapSnapshot(
  pdf: jsPDF,
  areas: ComparisonArea[],
  activeLayers: string[],
  yPos: number
): Promise<number> {
  try {
    const snapshotBlob = await captureSnapshot(
      {
        ...defaultSnapshotOptions,
        width: 800,
        height: 450,
        includeLegend: true,
        includeAttribution: true,
      },
      {
        areas,
        activeLayers,
        timestamp: new Date().toLocaleString(),
      }
    );

    if (snapshotBlob) {
      // Convert blob to base64
      const base64 = await blobToBase64(snapshotBlob);

      // Calculate dimensions to fit content width
      const imgWidth = CONTENT_WIDTH;
      const imgHeight = (450 / 800) * imgWidth;

      // Add image
      pdf.addImage(base64, 'PNG', MARGIN, yPos, imgWidth, imgHeight);

      return yPos + imgHeight + 10;
    }
  } catch (error) {
    console.error('Failed to capture map snapshot for PDF:', error);
  }

  return yPos;
}

/**
 * Draw metrics section
 */
function drawMetricsSection(
  pdf: jsPDF,
  areasWithMetrics: AreaWithMetrics[],
  yPos: number
): number {
  // Check if we need a new page
  if (yPos > PAGE_HEIGHT - 60) {
    pdf.addPage();
    yPos = MARGIN;
  }

  // Section title
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Key Metrics', MARGIN, yPos);
  yPos += 8;

  // Metrics table
  const metrics = [
    { label: 'Area Size', getValue: (m: POIMetrics) => `${m.areaKm2.toFixed(3)} km²` },
    { label: 'Total POIs', getValue: (m: POIMetrics) => m.totalCount.toString() },
    { label: 'POI Density', getValue: (m: POIMetrics) => `${m.density.toFixed(1)} /km²` },
    { label: 'Diversity Index', getValue: (m: POIMetrics) => `${m.diversityIndex.toFixed(2)} (${m.diversityLabel})` },
    { label: 'Data Coverage', getValue: (m: POIMetrics) => `${m.coverageScore.toFixed(0)}% (${m.coverageLabel})` },
  ];

  const colWidth = CONTENT_WIDTH / (areasWithMetrics.length + 1);
  const rowHeight = 8;

  // Header row
  pdf.setFillColor(...COLORS.background);
  pdf.rect(MARGIN, yPos, CONTENT_WIDTH, rowHeight, 'F');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.text);
  pdf.text('Metric', MARGIN + 2, yPos + 5.5);

  areasWithMetrics.forEach((aw, i) => {
    const [r, g, b] = aw.area.color;
    pdf.setTextColor(r, g, b);
    pdf.text(aw.area.name, MARGIN + colWidth * (i + 1) + 2, yPos + 5.5);
  });

  yPos += rowHeight;

  // Data rows
  pdf.setFont('helvetica', 'normal');
  metrics.forEach((metric, rowIndex) => {
    if (rowIndex % 2 === 0) {
      pdf.setFillColor(255, 255, 255);
    } else {
      pdf.setFillColor(...COLORS.background);
    }
    pdf.rect(MARGIN, yPos, CONTENT_WIDTH, rowHeight, 'F');

    pdf.setTextColor(...COLORS.textLight);
    pdf.text(metric.label, MARGIN + 2, yPos + 5.5);

    pdf.setTextColor(...COLORS.text);
    areasWithMetrics.forEach((aw, i) => {
      pdf.text(metric.getValue(aw.metrics), MARGIN + colWidth * (i + 1) + 2, yPos + 5.5);
    });

    yPos += rowHeight;
  });

  // Table border
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.3);
  pdf.rect(MARGIN, yPos - rowHeight * (metrics.length + 1), CONTENT_WIDTH, rowHeight * (metrics.length + 1));

  return yPos + 10;
}

/**
 * Draw category breakdown
 */
function drawCategoryBreakdown(
  pdf: jsPDF,
  areasWithMetrics: AreaWithMetrics[],
  yPos: number
): number {
  // Check if we need a new page
  if (yPos > PAGE_HEIGHT - 80) {
    pdf.addPage();
    yPos = MARGIN;
  }

  // Section title
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Category Breakdown', MARGIN, yPos);
  yPos += 8;

  const categories = Object.values(POI_CATEGORIES);
  const barMaxWidth = 40;
  const rowHeight = 7;

  // For each area, draw category bars
  areasWithMetrics.forEach((aw) => {
    // Area name
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    const [r, g, b] = aw.area.color;
    pdf.setTextColor(r, g, b);
    pdf.text(aw.area.name, MARGIN, yPos + 4);
    yPos += 6;

    // Find max count for scaling
    const maxCount = Math.max(...aw.metrics.categoryBreakdown.map((c) => c.count), 1);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');

    aw.metrics.categoryBreakdown.forEach((cat) => {
      const catDef = categories.find((c) => c.id === cat.id);
      if (!catDef) return;

      // Category name
      pdf.setTextColor(...COLORS.text);
      pdf.text(cat.name, MARGIN, yPos + 4);

      // Bar
      const barWidth = (cat.count / maxCount) * barMaxWidth;
      const [cr, cg, cb] = catDef.color;
      pdf.setFillColor(cr, cg, cb);
      pdf.rect(MARGIN + 50, yPos, barWidth, 5, 'F');

      // Count and density
      pdf.setTextColor(...COLORS.textLight);
      pdf.text(`${cat.count} (${cat.density.toFixed(1)}/km²)`, MARGIN + 95, yPos + 4);

      yPos += rowHeight;
    });

    yPos += 5;
  });

  return yPos + 5;
}

/**
 * Draw urban metrics section (derived indices)
 */
function drawUrbanMetricsSection(
  pdf: jsPDF,
  areasWithMetrics: AreaWithMetrics[],
  yPos: number
): number {
  // Check if any area has derived metrics
  const hasAnyDerivedMetrics = areasWithMetrics.some((aw) => aw.derivedMetrics.length > 0);
  if (!hasAnyDerivedMetrics) {
    return yPos;
  }

  // Check if we need a new page
  if (yPos > PAGE_HEIGHT - 70) {
    pdf.addPage();
    yPos = MARGIN;
  }

  // Section title
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Urban Metrics', MARGIN, yPos);
  yPos += 8;

  // Get all unique metric IDs
  const allMetricIds = new Set<string>();
  areasWithMetrics.forEach((aw) => {
    aw.derivedMetrics.forEach((dm) => allMetricIds.add(dm.metricId));
  });

  const colWidth = CONTENT_WIDTH / (areasWithMetrics.length + 1);
  const rowHeight = 8;

  // Header row
  pdf.setFillColor(...COLORS.background);
  pdf.rect(MARGIN, yPos, CONTENT_WIDTH, rowHeight, 'F');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...COLORS.text);
  pdf.text('Metric', MARGIN + 2, yPos + 5.5);

  areasWithMetrics.forEach((aw, i) => {
    const [r, g, b] = aw.area.color;
    pdf.setTextColor(r, g, b);
    pdf.text(aw.area.name, MARGIN + colWidth * (i + 1) + 2, yPos + 5.5);
  });

  yPos += rowHeight;

  // Data rows
  pdf.setFont('helvetica', 'normal');
  let rowIndex = 0;

  for (const metricId of allMetricIds) {
    const definition = DERIVED_METRIC_DEFINITIONS.find((d) => d.id === metricId);
    if (!definition) continue;

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(255, 255, 255);
    } else {
      pdf.setFillColor(...COLORS.background);
    }
    pdf.rect(MARGIN, yPos, CONTENT_WIDTH, rowHeight, 'F');

    // Metric name
    pdf.setTextColor(...COLORS.textLight);
    pdf.text(definition.name, MARGIN + 2, yPos + 5.5);

    // Values for each area
    pdf.setTextColor(...COLORS.text);
    areasWithMetrics.forEach((aw, i) => {
      const dm = aw.derivedMetrics.find((m) => m.metricId === metricId);
      if (dm) {
        const formattedValue = formatMetricValue(dm.value, dm.metricId);
        const level = getMetricInterpretation(dm.value, dm.metricId);
        pdf.text(`${formattedValue} (${level})`, MARGIN + colWidth * (i + 1) + 2, yPos + 5.5);
      } else {
        pdf.text('-', MARGIN + colWidth * (i + 1) + 2, yPos + 5.5);
      }
    });

    yPos += rowHeight;
    rowIndex++;
  }

  // Table border
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.3);
  pdf.rect(MARGIN, yPos - rowHeight * (rowIndex + 1), CONTENT_WIDTH, rowHeight * (rowIndex + 1));

  return yPos + 10;
}

/**
 * Draw insights section
 */
function drawInsightsSection(
  pdf: jsPDF,
  insights: Insight[],
  yPos: number
): number {
  // Check if we need a new page
  if (yPos > PAGE_HEIGHT - 50) {
    pdf.addPage();
    yPos = MARGIN;
  }

  // Section title
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Key Insights', MARGIN, yPos);
  yPos += 8;

  insights.forEach((insight) => {
    // Insight type indicator
    let typeColor: [number, number, number];
    switch (insight.type) {
      case 'positive':
        typeColor = COLORS.positive;
        break;
      case 'caution':
        typeColor = COLORS.caution;
        break;
      default:
        typeColor = COLORS.neutral;
    }

    // Bullet point
    pdf.setFillColor(...typeColor);
    pdf.circle(MARGIN + 2, yPos + 2, 1.5, 'F');

    // Title
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...COLORS.text);
    pdf.text(insight.title, MARGIN + 6, yPos + 3);
    yPos += 5;

    // Description
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...COLORS.textLight);

    // Word wrap description
    const lines = pdf.splitTextToSize(insight.description, CONTENT_WIDTH - 6);
    lines.forEach((line: string) => {
      pdf.text(line, MARGIN + 6, yPos + 3);
      yPos += 4;
    });

    yPos += 3;
  });

  return yPos + 5;
}

/**
 * Draw methodology section
 */
function drawMethodologySection(pdf: jsPDF, yPos: number): number {
  // Section title
  pdf.setFontSize(14);
  pdf.setTextColor(...COLORS.text);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Methodology', MARGIN, yPos);
  yPos += 8;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...COLORS.textLight);

  const methodologyText = [
    `Data Source: ${dataSourceInfo.name}`,
    `License: ${dataSourceInfo.license}`,
    '',
    'POI Density = Total POI Count / Area (km²)',
    'Diversity Index = Shannon Entropy: H = -Σ(pᵢ × ln(pᵢ))',
    '  - Range: 0 (single category) to ~2.5+ (highly diverse)',
    '',
    'Coverage Score = (Categories with data / Total categories) × 100%',
    '',
    'Urban Metrics (Derived Indices):',
    '  • Walk Score: Amenity density weighted by category (0-100)',
    '  • Transit Score: Mode-weighted stop density (0-100)',
    '  • Bike Score: Infrastructure + Amenities + Connectivity (0-100)',
    '  • Green Space Ratio: (Park Area / Total Area) × 100',
    '  • Building Density: (Building Footprint / Total Area) × 100',
    '  • Mixed-Use Score: 1 - |Residential% - Commercial%| (0-100)',
    '',
    'Caveats:',
    ...dataSourceInfo.caveats.map((c) => `  • ${c}`),
  ];

  methodologyText.forEach((line) => {
    pdf.text(line, MARGIN, yPos);
    yPos += 4;
  });

  return yPos;
}

/**
 * Draw footer on page
 */
function drawFooter(pdf: jsPDF, pageNum: number, totalPages: number): void {
  const footerY = PAGE_HEIGHT - 10;

  pdf.setFontSize(8);
  pdf.setTextColor(...COLORS.textLight);
  pdf.setFont('helvetica', 'normal');

  // Left: AxonCity branding
  pdf.text('AxonCity Urban Analysis', MARGIN, footerY);

  // Center: page number
  pdf.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH / 2, footerY, { align: 'center' });

  // Right: attribution
  pdf.text('© OpenStreetMap contributors', PAGE_WIDTH - MARGIN, footerY, { align: 'right' });

  // Top line
  pdf.setDrawColor(...COLORS.border);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY - 4, PAGE_WIDTH - MARGIN, footerY - 4);
}

/**
 * Convert blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Download PDF report
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate and download PDF report
 */
export async function exportPDFReport(
  areas: ComparisonArea[],
  activeLayers: string[],
  options?: Partial<ReportOptions>
): Promise<boolean> {
  try {
    const fullOptions: ReportOptions = {
      includeMap: true,
      includeMetrics: true,
      includeInsights: true,
      includeMethodology: true,
      ...options,
    };

    const blob = await generatePDFReport(areas, activeLayers, fullOptions);

    const timestamp = new Date().toISOString().split('T')[0];
    const areaNames = areas.map((a) => a.name.toLowerCase().replace(/\s+/g, '-')).join('-vs-');
    const filename = `axoncity-report-${areaNames}-${timestamp}.pdf`;

    downloadPDF(blob, filename);
    return true;
  } catch (error) {
    console.error('Failed to generate PDF report:', error);
    return false;
  }
}

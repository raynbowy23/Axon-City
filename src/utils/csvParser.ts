import type { FeatureCollection, Feature, Point } from 'geojson';

export interface CsvParseOptions {
  latColumn: string;
  lonColumn: string;
  delimiter?: string;
}

export interface CsvParseResult {
  features: FeatureCollection<Point>;
  rowCount: number;
  errorCount: number;
}

export interface DetectedColumns {
  latColumn: string | null;
  lonColumn: string | null;
}

// Common column name patterns for latitude
const LAT_PATTERNS = [
  /^lat$/i,
  /^latitude$/i,
  /^lat_/i,
  /_lat$/i,
  /^y$/i,
  /^lat\d*$/i,
];

// Common column name patterns for longitude
const LON_PATTERNS = [
  /^lon$/i,
  /^lng$/i,
  /^longitude$/i,
  /^long$/i,
  /^lon_/i,
  /_lon$/i,
  /^x$/i,
  /^lng\d*$/i,
  /^lon\d*$/i,
];

/**
 * Detect coordinate columns from CSV headers
 */
export function detectCoordinateColumns(headers: string[]): DetectedColumns {
  let latColumn: string | null = null;
  let lonColumn: string | null = null;

  for (const header of headers) {
    const trimmed = header.trim();

    // Check for latitude patterns
    if (!latColumn) {
      for (const pattern of LAT_PATTERNS) {
        if (pattern.test(trimmed)) {
          latColumn = trimmed;
          break;
        }
      }
    }

    // Check for longitude patterns
    if (!lonColumn) {
      for (const pattern of LON_PATTERNS) {
        if (pattern.test(trimmed)) {
          lonColumn = trimmed;
          break;
        }
      }
    }

    // Early exit if both found
    if (latColumn && lonColumn) break;
  }

  return { latColumn, lonColumn };
}

/**
 * Parse a CSV line handling quoted values
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Push the last field
  result.push(current.trim());

  return result;
}

/**
 * Detect the delimiter used in a CSV file
 */
export function detectDelimiter(firstLine: string): string {
  const delimiters = [',', ';', '\t', '|'];
  let maxCount = 0;
  let bestDelimiter = ',';

  for (const delimiter of delimiters) {
    const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

/**
 * Parse CSV text to GeoJSON FeatureCollection
 */
export function parseCsvToGeoJson(
  csvText: string,
  options: CsvParseOptions
): CsvParseResult {
  const { latColumn, lonColumn, delimiter = ',' } = options;

  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    return {
      features: { type: 'FeatureCollection', features: [] },
      rowCount: 0,
      errorCount: 0,
    };
  }

  // Parse header
  const headers = parseCsvLine(lines[0], delimiter);
  const latIndex = headers.findIndex(
    (h) => h.toLowerCase() === latColumn.toLowerCase()
  );
  const lonIndex = headers.findIndex(
    (h) => h.toLowerCase() === lonColumn.toLowerCase()
  );

  if (latIndex === -1 || lonIndex === -1) {
    throw new Error(`Could not find columns: ${latColumn}, ${lonColumn}`);
  }

  const features: Feature<Point>[] = [];
  let errorCount = 0;

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCsvLine(line, delimiter);
      const lat = parseFloat(values[latIndex]);
      const lon = parseFloat(values[lonIndex]);

      // Validate coordinates
      if (isNaN(lat) || isNaN(lon)) {
        errorCount++;
        continue;
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        errorCount++;
        continue;
      }

      // Build properties from all other columns
      const properties: Record<string, string | number> = {};
      for (let j = 0; j < headers.length; j++) {
        if (j !== latIndex && j !== lonIndex) {
          const value = values[j] || '';
          // Try to parse as number
          const numValue = parseFloat(value);
          properties[headers[j]] = isNaN(numValue) ? value : numValue;
        }
      }

      features.push({
        type: 'Feature',
        id: i,
        properties,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
      });
    } catch {
      errorCount++;
    }
  }

  return {
    features: { type: 'FeatureCollection', features },
    rowCount: lines.length - 1,
    errorCount,
  };
}

/**
 * Parse CSV headers from text
 */
export function parseCsvHeaders(csvText: string): string[] {
  const firstLine = csvText.split(/\r?\n/)[0];
  if (!firstLine) return [];

  const delimiter = detectDelimiter(firstLine);
  return parseCsvLine(firstLine, delimiter);
}

/**
 * Validate GeoJSON structure
 */
export function validateGeoJson(data: unknown): {
  valid: boolean;
  error?: string;
  geometryType?: 'point' | 'line' | 'polygon';
  featureCount?: number;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON structure' };
  }

  const geoJson = data as Record<string, unknown>;

  if (geoJson.type !== 'FeatureCollection') {
    // Try to handle single Feature
    if (geoJson.type === 'Feature' && geoJson.geometry) {
      return validateGeoJson({
        type: 'FeatureCollection',
        features: [geoJson],
      });
    }
    return { valid: false, error: 'Must be a FeatureCollection' };
  }

  if (!Array.isArray(geoJson.features)) {
    return { valid: false, error: 'FeatureCollection must have features array' };
  }

  if (geoJson.features.length === 0) {
    return { valid: false, error: 'FeatureCollection has no features' };
  }

  // Detect geometry type from first feature with geometry
  let geometryType: 'point' | 'line' | 'polygon' | undefined;

  for (const feature of geoJson.features as unknown[]) {
    const f = feature as Record<string, unknown>;
    if (!f.geometry) continue;

    const geom = f.geometry as Record<string, unknown>;
    const geomType = geom.type as string;

    if (geomType === 'Point' || geomType === 'MultiPoint') {
      geometryType = 'point';
    } else if (
      geomType === 'LineString' ||
      geomType === 'MultiLineString'
    ) {
      geometryType = 'line';
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      geometryType = 'polygon';
    }

    if (geometryType) break;
  }

  if (!geometryType) {
    return { valid: false, error: 'No valid geometries found' };
  }

  return {
    valid: true,
    geometryType,
    featureCount: geoJson.features.length,
  };
}

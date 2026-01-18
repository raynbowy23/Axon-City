import { useState, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { layerManifest } from '../data/layerManifest';
import type { CustomLayerConfig, LayerGroup, GeometryType, StatsRecipe, FeatureCollection } from '../types';
import {
  parseCsvToGeoJson,
  parseCsvHeaders,
  detectCoordinateColumns,
  detectDelimiter,
  validateGeoJson,
} from '../utils/csvParser';

// Distinct colors for custom layers
const CUSTOM_LAYER_COLORS: [number, number, number, number][] = [
  [255, 99, 132, 200],   // Pink
  [54, 162, 235, 200],   // Blue
  [255, 206, 86, 200],   // Yellow
  [75, 192, 192, 200],   // Teal
  [153, 102, 255, 200],  // Purple
  [255, 159, 64, 200],   // Orange
  [199, 199, 199, 200],  // Gray
  [83, 102, 255, 200],   // Indigo
];

// Stats recipes by geometry type
const STATS_BY_GEOMETRY: Record<GeometryType, StatsRecipe[]> = {
  point: ['count', 'density'],
  line: ['count', 'length', 'density'],
  polygon: ['count', 'area', 'density', 'area_share'],
};

interface FilePreview {
  fileName: string;
  fileType: 'geojson' | 'csv';
  featureCount: number;
  geometryType: GeometryType;
  headers?: string[];
  detectedLatCol?: string | null;
  detectedLonCol?: string | null;
  rawData?: string;
  parsedData?: FeatureCollection;
}

export function DataInputPanel() {
  const { isDataInputOpen, setDataInputOpen, addCustomLayer, customLayers } = useStore();

  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [layerName, setLayerName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<LayerGroup>('usage');
  const [selectedColor, setSelectedColor] = useState(0);
  const [latColumn, setLatColumn] = useState('');
  const [lonColumn, setLonColumn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setPreview(null);
    setLayerName('');
    setSelectedGroup('usage');
    setSelectedColor((customLayers.length) % CUSTOM_LAYER_COLORS.length);
    setLatColumn('');
    setLonColumn('');
    setError(null);
  }, [customLayers.length]);

  const handleClose = useCallback(() => {
    resetState();
    setDataInputOpen(false);
  }, [resetState, setDataInputOpen]);

  const processFile = useCallback(async (file: File) => {
    setError(null);

    const fileName = file.name;
    const extension = fileName.split('.').pop()?.toLowerCase();

    // Validate file type
    if (!['geojson', 'json', 'csv'].includes(extension || '')) {
      setError('Unsupported file type. Please use .geojson, .json, or .csv');
      return;
    }

    try {
      const text = await file.text();

      if (extension === 'csv') {
        // Parse CSV headers
        const headers = parseCsvHeaders(text);
        if (headers.length === 0) {
          setError('CSV file is empty or has no headers');
          return;
        }

        // Auto-detect coordinate columns
        const detected = detectCoordinateColumns(headers);

        setPreview({
          fileName,
          fileType: 'csv',
          featureCount: text.split(/\r?\n/).filter((l) => l.trim()).length - 1,
          geometryType: 'point', // CSV always produces points
          headers,
          detectedLatCol: detected.latColumn,
          detectedLonCol: detected.lonColumn,
          rawData: text,
        });

        // Set detected columns
        if (detected.latColumn) setLatColumn(detected.latColumn);
        if (detected.lonColumn) setLonColumn(detected.lonColumn);

        // Set default layer name from file name
        setLayerName(fileName.replace(/\.(csv)$/i, ''));
      } else {
        // Parse GeoJSON
        const data = JSON.parse(text);
        const validation = validateGeoJson(data);

        if (!validation.valid) {
          setError(validation.error || 'Invalid GeoJSON');
          return;
        }

        // Normalize to FeatureCollection
        let featureCollection: FeatureCollection;
        if (data.type === 'Feature') {
          featureCollection = { type: 'FeatureCollection', features: [data] };
        } else {
          featureCollection = data as FeatureCollection;
        }

        setPreview({
          fileName,
          fileType: 'geojson',
          featureCount: validation.featureCount || 0,
          geometryType: validation.geometryType || 'point',
          parsedData: featureCollection,
        });

        // Set default layer name from file name
        setLayerName(fileName.replace(/\.(geojson|json)$/i, ''));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleAddLayer = useCallback(() => {
    if (!preview) return;

    let features: FeatureCollection;

    if (preview.fileType === 'csv') {
      // Parse CSV with selected columns
      if (!latColumn || !lonColumn) {
        setError('Please select latitude and longitude columns');
        return;
      }

      const delimiter = detectDelimiter(preview.rawData?.split(/\r?\n/)[0] || '');
      const result = parseCsvToGeoJson(preview.rawData || '', {
        latColumn,
        lonColumn,
        delimiter,
      });

      if (result.features.features.length === 0) {
        setError('No valid points could be parsed from the CSV');
        return;
      }

      features = result.features;
    } else {
      features = preview.parsedData!;
    }

    // Generate unique layer ID
    const layerId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create layer config
    const color = CUSTOM_LAYER_COLORS[selectedColor];
    const layer: CustomLayerConfig = {
      id: layerId,
      name: layerName || preview.fileName,
      group: selectedGroup,
      geometryType: preview.geometryType,
      priority: 100 + customLayers.length, // Higher than manifest layers
      style: {
        fillColor: color,
        strokeColor: [color[0], color[1], color[2], 255],
        strokeWidth: 2,
        extruded: preview.geometryType === 'polygon',
        extrusionHeight: preview.geometryType === 'polygon' ? 10 : undefined,
      },
      statsRecipes: STATS_BY_GEOMETRY[preview.geometryType],
      visible: true,
      description: `Imported from ${preview.fileName}`,
      isCustom: true,
      sourceType: preview.fileType,
      fileName: preview.fileName,
    };

    // Add the layer
    addCustomLayer(layer, features);

    // Close panel
    handleClose();
  }, [preview, latColumn, lonColumn, layerName, selectedGroup, selectedColor, customLayers.length, addCustomLayer, handleClose]);

  if (!isDataInputOpen) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(20, 20, 25, 0.98)',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '480px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          color: 'white',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Import Custom Data
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              fontSize: '24px',
              padding: '0 8px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div
            style={{
              backgroundColor: 'rgba(220, 53, 69, 0.2)',
              border: '1px solid rgba(220, 53, 69, 0.4)',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              color: '#ff6b6b',
            }}
          >
            {error}
          </div>
        )}

        {/* Drop Zone */}
        {!preview && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#4A90D9' : 'rgba(255, 255, 255, 0.3)'}`,
              borderRadius: '8px',
              padding: '40px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: isDragging ? 'rgba(74, 144, 217, 0.1)' : 'transparent',
              transition: 'all 0.2s ease',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📁</div>
            <div style={{ fontSize: '14px', marginBottom: '8px' }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: '12px', opacity: 0.6 }}>
              Supported: .geojson, .json, .csv
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,.csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Preview */}
        {preview && (
          <>
            {/* File Info */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span style={{ fontWeight: '500' }}>{preview.fileName}</span>
                <button
                  onClick={resetState}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    textDecoration: 'underline',
                  }}
                >
                  Change file
                </button>
              </div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>
                <span style={{ marginRight: '16px' }}>
                  Features: <strong>{preview.featureCount}</strong>
                </span>
                <span>
                  Geometry: <strong>{preview.geometryType}</strong>
                </span>
              </div>
            </div>

            {/* CSV Column Selection */}
            {preview.fileType === 'csv' && preview.headers && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>
                  Coordinate Columns
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        opacity: 0.7,
                        marginBottom: '4px',
                      }}
                    >
                      Latitude Column
                    </label>
                    <select
                      value={latColumn}
                      onChange={(e) => setLatColumn(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '12px',
                      }}
                    >
                      <option value="">Select column</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                          {header === preview.detectedLatCol ? ' (detected)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '11px',
                        opacity: 0.7,
                        marginBottom: '4px',
                      }}
                    >
                      Longitude Column
                    </label>
                    <select
                      value={lonColumn}
                      onChange={(e) => setLonColumn(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        fontSize: '12px',
                      }}
                    >
                      <option value="">Select column</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                          {header === preview.detectedLonCol ? ' (detected)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Layer Configuration */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px' }}>
                Layer Settings
              </div>

              {/* Layer Name */}
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    opacity: 0.7,
                    marginBottom: '4px',
                  }}
                >
                  Layer Name
                </label>
                <input
                  type="text"
                  value={layerName}
                  onChange={(e) => setLayerName(e.target.value)}
                  placeholder="Enter layer name"
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Group Selection */}
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    opacity: 0.7,
                    marginBottom: '4px',
                  }}
                >
                  Group
                </label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value as LayerGroup)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    fontSize: '12px',
                  }}
                >
                  {layerManifest.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Color Selection */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    opacity: 0.7,
                    marginBottom: '4px',
                  }}
                >
                  Color
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {CUSTOM_LAYER_COLORS.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedColor(index)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '4px',
                        border: selectedColor === index
                          ? '3px solid white'
                          : '2px solid transparent',
                        backgroundColor: `rgba(${color[0]}, ${color[1]}, ${color[2]}, 1)`,
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleClose}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddLayer}
                disabled={
                  preview.fileType === 'csv' && (!latColumn || !lonColumn)
                }
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor:
                    preview.fileType === 'csv' && (!latColumn || !lonColumn)
                      ? 'rgba(74, 144, 217, 0.3)'
                      : '#4A90D9',
                  color: 'white',
                  cursor:
                    preview.fileType === 'csv' && (!latColumn || !lonColumn)
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                Add Layer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

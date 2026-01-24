/**
 * Visual Mapping Controls
 * Provides controls for customizing layer appearance, opacity, and 3D settings
 */

import { useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { layerManifest } from '../data/layerManifest';
import type { LayerConfig, LayerStyleOverride } from '../types';

interface VisualControlsProps {
  compact?: boolean;
}

// Color presets for quick selection
const COLOR_PRESETS = [
  { name: 'Blue', color: [74, 144, 217] },
  { name: 'Green', color: [34, 197, 94] },
  { name: 'Orange', color: [249, 115, 22] },
  { name: 'Purple', color: [168, 85, 247] },
  { name: 'Red', color: [239, 68, 68] },
  { name: 'Cyan', color: [6, 182, 212] },
  { name: 'Yellow', color: [234, 179, 8] },
  { name: 'Pink', color: [236, 72, 153] },
] as const;

export function VisualControls({ compact = false }: VisualControlsProps) {
  const {
    activeLayers,
    explodedView,
    setExplodedView,
    globalOpacity,
    setGlobalOpacity,
    layerStyleOverrides,
    setLayerStyleOverride,
  } = useStore();

  // Local state for UI selection only
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Get active layer configs
  const activeLayerConfigs = activeLayers
    .map((id: string) => layerManifest.layers.find((l: LayerConfig) => l.id === id))
    .filter((l: LayerConfig | undefined): l is LayerConfig => l !== undefined);

  const handleGlobalOpacityChange = useCallback((value: number) => {
    setGlobalOpacity(value);
  }, [setGlobalOpacity]);

  const handleLayerOpacityChange = useCallback((layerId: string, opacity: number) => {
    const existing = layerStyleOverrides.get(layerId) || { opacity: 100 };
    setLayerStyleOverride(layerId, { ...existing, opacity });
  }, [layerStyleOverrides, setLayerStyleOverride]);

  const handleLayerColorChange = useCallback((layerId: string, color: [number, number, number]) => {
    const existing = layerStyleOverrides.get(layerId) || { opacity: 100 };
    setLayerStyleOverride(layerId, { ...existing, fillColor: [...color, 200] });
  }, [layerStyleOverrides, setLayerStyleOverride]);

  const handleExtrusionMultiplier = useCallback((multiplier: number) => {
    // Scale the existing spacing to act as a height multiplier
    const baseSpacing = 100;
    setExplodedView({ layerSpacing: Math.round(baseSpacing * multiplier) });
  }, [setExplodedView]);

  const getLayerOverride = (layerId: string): LayerStyleOverride => {
    return layerStyleOverrides.get(layerId) || { opacity: 100 };
  };

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'white',
        }}
      >
        <span style={{ opacity: 0.7, fontSize: '11px' }}>Opacity:</span>
        <input
          type="range"
          min={20}
          max={100}
          value={globalOpacity}
          onChange={(e) => handleGlobalOpacityChange(Number(e.target.value))}
          style={{
            width: '60px',
            height: '4px',
            cursor: 'pointer',
          }}
        />
        <span style={{ minWidth: '35px', textAlign: 'right' }}>{globalOpacity}%</span>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        color: 'white',
        fontSize: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontWeight: '600', fontSize: '13px' }}>Visual Settings</span>
      </div>

      {/* Global Opacity */}
      <div style={{ marginBottom: '14px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '6px',
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.7)',
          }}
        >
          <span>Global Opacity</span>
          <span>{globalOpacity}%</span>
        </div>
        <input
          type="range"
          min={20}
          max={100}
          value={globalOpacity}
          onChange={(e) => handleGlobalOpacityChange(Number(e.target.value))}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            appearance: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            cursor: 'pointer',
          }}
        />
      </div>

      {/* 3D Height Multiplier */}
      {explodedView.enabled && (
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            <span>3D Height Scale</span>
            <span>{(explodedView.layerSpacing / 100).toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.1}
            value={explodedView.layerSpacing / 100}
            onChange={(e) => handleExtrusionMultiplier(Number(e.target.value))}
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              appearance: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              cursor: 'pointer',
            }}
          />
        </div>
      )}

      {/* Per-Layer Controls */}
      {activeLayerConfigs.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.7)',
              marginBottom: '8px',
            }}
          >
            Layer Colors
          </div>

          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {activeLayerConfigs.slice(0, 5).map((layer: LayerConfig) => {
              const override = getLayerOverride(layer.id);
              const currentColor = override.fillColor || layer.style.fillColor;
              const isSelected = selectedLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    marginBottom: '4px',
                    backgroundColor: isSelected
                      ? 'rgba(74, 144, 217, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() => setSelectedLayerId(isSelected ? null : layer.id)}
                >
                  {/* Color swatch */}
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '3px',
                      backgroundColor: `rgba(${currentColor.slice(0, 3).join(',')}, ${currentColor[3] / 255})`,
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      flexShrink: 0,
                    }}
                  />

                  {/* Layer name */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: '11px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {layer.name}
                  </span>

                  {/* Opacity for this layer */}
                  <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
                    {override.opacity}%
                  </span>
                </div>
              );
            })}

            {activeLayerConfigs.length > 5 && (
              <div
                style={{
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.5)',
                  textAlign: 'center',
                  padding: '4px',
                }}
              >
                +{activeLayerConfigs.length - 5} more layers
              </div>
            )}
          </div>

          {/* Color picker for selected layer */}
          {selectedLayerId && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginBottom: '8px',
                }}
              >
                Color Presets
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() =>
                      handleLayerColorChange(selectedLayerId, preset.color as [number, number, number])
                    }
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '4px',
                      border: '2px solid rgba(255, 255, 255, 0.3)',
                      backgroundColor: `rgb(${preset.color.join(',')})`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s',
                    }}
                    title={preset.name}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                ))}
              </div>

              {/* Layer opacity slider */}
              <div style={{ marginTop: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.6)',
                  }}
                >
                  <span>Layer Opacity</span>
                  <span>{getLayerOverride(selectedLayerId).opacity}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={getLayerOverride(selectedLayerId).opacity}
                  onChange={(e) =>
                    handleLayerOpacityChange(selectedLayerId, Number(e.target.value))
                  }
                  style={{
                    width: '100%',
                    height: '4px',
                    borderRadius: '2px',
                    appearance: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {activeLayerConfigs.length === 0 && (
        <div
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.5)',
            textAlign: 'center',
            padding: '12px',
          }}
        >
          Enable layers to customize their appearance
        </div>
      )}
    </div>
  );
}

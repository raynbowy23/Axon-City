import type { LayerManifest, LayerOrderConfig, LayerConfig, LayerGroup } from '../types';

// Layer manifest defining the hierarchy and styling for all layers
// Priority determines stacking order (higher = on top)
export const layerManifest: LayerManifest = {
  groups: [
    {
      id: 'usage',
      name: 'Land Use',
      priority: 1,
      color: [102, 51, 153], // Purple
    },
    {
      id: 'infrastructure',
      name: 'Infrastructure',
      priority: 2,
      color: [51, 102, 204], // Blue
    },
    {
      id: 'access',
      name: 'Access & Transit',
      priority: 3,
      color: [34, 139, 34], // Green
    },
    {
      id: 'safety',
      name: 'Safety',
      priority: 4,
      color: [220, 20, 60], // Crimson
    },
    {
      id: 'environment',
      name: 'Environment',
      priority: 5,
      color: [46, 139, 87], // Sea green
    },
  ],
  layers: [
    // Usage / Land Use layers (base)
    {
      id: 'landuse-residential',
      name: 'Residential',
      group: 'usage',
      geometryType: 'polygon',
      priority: 10,
      osmQuery: 'way["landuse"="residential"]',
      style: {
        fillColor: [255, 218, 185, 180], // Peach
        strokeColor: [210, 180, 140, 255],
        strokeWidth: 1,
      },
      statsRecipes: ['area', 'area_share'],
      visible: true,
      description: 'Residential land use areas',
    },
    {
      id: 'landuse-commercial',
      name: 'Commercial',
      group: 'usage',
      geometryType: 'polygon',
      priority: 11,
      osmQuery: 'way["landuse"="commercial"]',
      style: {
        fillColor: [135, 206, 250, 180], // Light sky blue
        strokeColor: [70, 130, 180, 255],
        strokeWidth: 1,
      },
      statsRecipes: ['area', 'area_share'],
      visible: true,
      description: 'Commercial and business areas',
    },
    {
      id: 'landuse-industrial',
      name: 'Industrial',
      group: 'usage',
      geometryType: 'polygon',
      priority: 12,
      osmQuery: 'way["landuse"="industrial"]',
      style: {
        fillColor: [192, 192, 192, 180], // Silver
        strokeColor: [128, 128, 128, 255],
        strokeWidth: 1,
      },
      statsRecipes: ['area', 'area_share'],
      visible: true,
      description: 'Industrial zones',
    },
    {
      id: 'buildings',
      name: 'Buildings',
      group: 'usage',
      geometryType: 'polygon',
      priority: 15,
      osmQuery: 'way["building"]',
      style: {
        fillColor: [169, 169, 169, 200], // Dark gray
        strokeColor: [105, 105, 105, 255],
        strokeWidth: 1,
        extruded: true,
        extrusionHeight: 10,
      },
      statsRecipes: ['count', 'area', 'density'],
      visible: true,
      description: 'Building footprints',
    },

    // Infrastructure layers
    {
      id: 'roads-primary',
      name: 'Primary Roads',
      group: 'infrastructure',
      geometryType: 'line',
      priority: 20,
      osmQuery: 'way["highway"~"primary|secondary"]',
      style: {
        fillColor: [255, 165, 0, 255], // Orange
        strokeColor: [255, 165, 0, 255],
        strokeWidth: 4,
      },
      statsRecipes: ['length', 'count'],
      visible: true,
      description: 'Major roads and highways',
    },
    {
      id: 'roads-residential',
      name: 'Residential Streets',
      group: 'infrastructure',
      geometryType: 'line',
      priority: 21,
      osmQuery: 'way["highway"~"residential|tertiary"]',
      style: {
        fillColor: [255, 255, 255, 200], // White
        strokeColor: [200, 200, 200, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['length', 'count'],
      visible: true,
      description: 'Residential and local streets',
    },
    {
      id: 'bike-lanes',
      name: 'Bike Lanes',
      group: 'infrastructure',
      geometryType: 'line',
      priority: 25,
      osmQuery: 'way["highway"="cycleway"]|way["cycleway"]',
      style: {
        fillColor: [50, 205, 50, 255], // Lime green
        strokeColor: [50, 205, 50, 255],
        strokeWidth: 3,
      },
      statsRecipes: ['length', 'density'],
      visible: true,
      description: 'Dedicated bicycle infrastructure',
    },

    // Access & Transit layers
    {
      id: 'transit-stops',
      name: 'Transit Stops',
      group: 'access',
      geometryType: 'point',
      priority: 30,
      osmQuery: 'node["public_transport"="stop_position"]|node["highway"="bus_stop"]',
      style: {
        fillColor: [0, 128, 255, 255], // Dodger blue
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: true,
      description: 'Public transit stops',
    },
    {
      id: 'rail-lines',
      name: 'Rail Lines',
      group: 'access',
      geometryType: 'line',
      priority: 31,
      osmQuery: 'way["railway"~"rail|light_rail|subway"]',
      style: {
        fillColor: [139, 69, 19, 255], // Saddle brown
        strokeColor: [139, 69, 19, 255],
        strokeWidth: 4,
      },
      statsRecipes: ['length'],
      visible: true,
      description: 'Rail and subway lines',
    },
    {
      id: 'parking',
      name: 'Parking',
      group: 'access',
      geometryType: 'polygon',
      priority: 32,
      osmQuery: 'way["amenity"="parking"]',
      style: {
        fillColor: [70, 130, 180, 150], // Steel blue
        strokeColor: [70, 130, 180, 255],
        strokeWidth: 1,
      },
      statsRecipes: ['count', 'area'],
      visible: true,
      description: 'Parking lots and structures',
    },

    // Safety layers
    {
      id: 'traffic-signals',
      name: 'Traffic Signals',
      group: 'safety',
      geometryType: 'point',
      priority: 40,
      osmQuery: 'node["highway"="traffic_signals"]',
      style: {
        fillColor: [255, 0, 0, 255], // Red
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: true,
      description: 'Traffic signal locations',
    },
    {
      id: 'crosswalks',
      name: 'Crosswalks',
      group: 'safety',
      geometryType: 'point',
      priority: 41,
      osmQuery: 'node["highway"="crossing"]',
      style: {
        fillColor: [255, 215, 0, 255], // Gold
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: true,
      description: 'Pedestrian crossings',
    },

    // Environment layers
    {
      id: 'parks',
      name: 'Parks',
      group: 'environment',
      geometryType: 'polygon',
      priority: 50,
      osmQuery: 'way["leisure"="park"]|way["landuse"="grass"]',
      style: {
        fillColor: [34, 139, 34, 150], // Forest green
        strokeColor: [0, 100, 0, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['area', 'area_share', 'count'],
      visible: true,
      description: 'Parks and green spaces',
    },
    {
      id: 'water',
      name: 'Water Bodies',
      group: 'environment',
      geometryType: 'polygon',
      priority: 51,
      osmQuery: 'way["natural"="water"]|way["waterway"="riverbank"]',
      style: {
        fillColor: [65, 105, 225, 180], // Royal blue
        strokeColor: [25, 25, 112, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['area', 'area_share'],
      visible: true,
      description: 'Lakes, rivers, and water bodies',
    },
    {
      id: 'trees',
      name: 'Trees',
      group: 'environment',
      geometryType: 'point',
      priority: 52,
      osmQuery: 'node["natural"="tree"]',
      style: {
        fillColor: [0, 128, 0, 255], // Green
        strokeColor: [0, 100, 0, 255],
        strokeWidth: 1,
      },
      statsRecipes: ['count', 'density'],
      visible: true,
      description: 'Individual trees',
    },
  ],
};

// Helper to get layers by group
export const getLayersByGroup = (groupId: string): LayerManifest['layers'] => {
  return layerManifest.layers.filter((layer) => layer.group === groupId);
};

// Helper to get layer by ID
export const getLayerById = (layerId: string) => {
  return layerManifest.layers.find((layer) => layer.id === layerId);
};

// Helper to get group by ID
export const getGroupById = (groupId: string) => {
  return layerManifest.groups.find((group) => group.id === groupId);
};

// Get sorted layers for rendering (by group priority, then layer priority)
export const getSortedLayers = () => {
  const groupPriority = new Map(
    layerManifest.groups.map((g) => [g.id, g.priority])
  );

  return [...layerManifest.layers].sort((a, b) => {
    const groupA = groupPriority.get(a.group) || 0;
    const groupB = groupPriority.get(b.group) || 0;

    if (groupA !== groupB) return groupA - groupB;
    return a.priority - b.priority;
  });
};

// Get layers sorted by custom order configuration
export const getLayersByCustomOrder = (orderConfig: LayerOrderConfig): LayerConfig[] => {
  const result: LayerConfig[] = [];
  const layerMap = new Map(layerManifest.layers.map(l => [l.id, l]));

  // Iterate through groups in the custom order
  for (const groupId of orderConfig.groupOrder) {
    const layerIds = orderConfig.layerOrderByGroup[groupId] || [];
    // Add layers in the custom order within each group
    for (const layerId of layerIds) {
      const layer = layerMap.get(layerId);
      if (layer) {
        result.push(layer);
      }
    }
  }

  return result;
};

// Get groups sorted by custom order
export const getGroupsByCustomOrder = (orderConfig: LayerOrderConfig) => {
  const groupMap = new Map(layerManifest.groups.map(g => [g.id, g]));
  return orderConfig.groupOrder
    .map(groupId => groupMap.get(groupId))
    .filter((g): g is typeof layerManifest.groups[number] => g !== undefined);
};

// Get layers for a specific group in custom order
export const getLayersByGroupCustomOrder = (groupId: LayerGroup, orderConfig: LayerOrderConfig): LayerConfig[] => {
  const layerIds = orderConfig.layerOrderByGroup[groupId] || [];
  const layerMap = new Map(layerManifest.layers.map(l => [l.id, l]));

  return layerIds
    .map(id => layerMap.get(id))
    .filter((l): l is LayerConfig => l !== undefined);
};

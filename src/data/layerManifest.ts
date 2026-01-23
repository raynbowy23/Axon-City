import type { LayerManifest, LayerOrderConfig, LayerConfig, LayerGroup } from '../types';

// Layer manifest defining the hierarchy and styling for all layers
// Priority determines stacking order (higher = on top)
export const layerManifest: LayerManifest = {
  groups: [
    {
      id: 'environment',
      name: 'Environment',
      priority: 1,
      color: [46, 139, 87], // Sea green
    },
    {
      id: 'usage',
      name: 'Land Use',
      priority: 2,
      color: [102, 51, 153], // Purple
    },
    {
      id: 'infrastructure',
      name: 'Infrastructure',
      priority: 3,
      color: [51, 102, 204], // Blue
    },
    {
      id: 'access',
      name: 'Access & Transit',
      priority: 4,
      color: [34, 139, 34], // Green
    },
    {
      id: 'traffic',
      name: 'Traffic Control',
      priority: 5,
      color: [220, 20, 60], // Crimson
    },
    {
      id: 'amenities',
      name: 'Amenities',
      priority: 6,
      color: [255, 152, 0], // Orange
    },
  ],
  layers: [
    // Usage / Land Use layers (buildings by type)
    {
      id: 'buildings-residential',
      name: 'Residential Buildings',
      group: 'usage',
      geometryType: 'polygon',
      priority: 13,
      osmQuery: 'way["building"~"residential|house|apartments|detached|semidetached_house|terrace|dormitory"]',
      style: {
        fillColor: [255, 182, 139, 200], // Warm peach/salmon
        strokeColor: [210, 140, 100, 255],
        strokeWidth: 1,
        extruded: true,
        extrusionHeight: 10,
      },
      statsRecipes: ['count', 'area', 'density'],
      visible: true,
      description: 'Residential buildings (houses, apartments)',
    },
    {
      id: 'buildings-commercial',
      name: 'Commercial Buildings',
      group: 'usage',
      geometryType: 'polygon',
      priority: 14,
      osmQuery: 'way["building"~"commercial|retail|office|supermarket|hotel|mall"]',
      style: {
        fillColor: [100, 180, 255, 200], // Sky blue
        strokeColor: [60, 130, 200, 255],
        strokeWidth: 1,
        extruded: true,
        extrusionHeight: 15,
      },
      statsRecipes: ['count', 'area', 'density'],
      visible: true,
      description: 'Commercial buildings (offices, retail, hotels)',
    },
    {
      id: 'buildings-industrial',
      name: 'Industrial Buildings',
      group: 'usage',
      geometryType: 'polygon',
      priority: 15,
      osmQuery: 'way["building"~"industrial|warehouse|factory|manufacture"]',
      style: {
        fillColor: [160, 160, 180, 200], // Cool gray/slate
        strokeColor: [120, 120, 140, 255],
        strokeWidth: 1,
        extruded: true,
        extrusionHeight: 12,
      },
      statsRecipes: ['count', 'area', 'density'],
      visible: true,
      description: 'Industrial buildings (warehouses, factories)',
    },
    {
      id: 'buildings-other',
      name: 'Other Buildings',
      group: 'usage',
      geometryType: 'polygon',
      priority: 16,
      osmQuery: 'way["building"]["building"!~"residential|house|apartments|detached|semidetached_house|terrace|dormitory|commercial|retail|office|supermarket|hotel|mall|industrial|warehouse|factory|manufacture"]',
      style: {
        fillColor: [180, 180, 180, 200], // Neutral gray
        strokeColor: [140, 140, 140, 255],
        strokeWidth: 1,
        extruded: true,
        extrusionHeight: 10,
      },
      statsRecipes: ['count', 'area', 'density'],
      visible: true,
      description: 'Other buildings (civic, religious, etc.)',
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
      osmQuery: 'way["highway"="cycleway"]|way["cycleway"~"lane|track|shared_lane"]|way["bicycle"="designated"]',
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
      osmQuery: 'way["railway"~"rail|light_rail|subway|tram|narrow_gauge"]',
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
      osmQuery: 'way["amenity"="parking"]|relation["amenity"="parking"]|way["parking"~"surface|underground|multi-storey"]',
      style: {
        fillColor: [70, 130, 180, 150], // Steel blue
        strokeColor: [70, 130, 180, 255],
        strokeWidth: 1,
      },
      statsRecipes: ['count', 'area'],
      visible: true,
      description: 'Parking lots and structures',
    },

    // Traffic Control layers
    {
      id: 'traffic-signals',
      name: 'Traffic Signals',
      group: 'traffic',
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

    // Crosswalks (Infrastructure)
    {
      id: 'crosswalks',
      name: 'Crosswalks',
      group: 'infrastructure',
      geometryType: 'point',
      priority: 26,
      osmQuery: 'node["highway"="crossing"]|node["crossing"]|node["crossing:markings"]',
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
      osmQuery: 'way["natural"="water"]|relation["natural"="water"]|way["waterway"="riverbank"]|way["water"]|relation["water"]|way["landuse"="reservoir"]',
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

    // Amenities / POI layers
    {
      id: 'poi-food-drink',
      name: 'Food & Drink',
      group: 'amenities',
      geometryType: 'point',
      priority: 60,
      osmQuery: 'node["amenity"~"restaurant|cafe|bar|fast_food"]|way["amenity"~"restaurant|cafe|bar|fast_food"]',
      style: {
        fillColor: [255, 87, 51, 255], // Coral
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'Restaurants, cafes, bars, and fast food',
    },
    {
      id: 'poi-shopping',
      name: 'Shopping',
      group: 'amenities',
      geometryType: 'point',
      priority: 61,
      osmQuery: 'node["shop"]|way["shop"]',
      style: {
        fillColor: [255, 195, 0, 255], // Gold
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'All types of shops and retail',
    },
    {
      id: 'poi-grocery',
      name: 'Grocery',
      group: 'amenities',
      geometryType: 'point',
      priority: 62,
      osmQuery: 'node["shop"~"supermarket|grocery|convenience"]|way["shop"~"supermarket|grocery|convenience"]',
      style: {
        fillColor: [76, 175, 80, 255], // Green
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'Supermarkets, grocery stores, convenience stores',
    },
    {
      id: 'poi-health',
      name: 'Healthcare',
      group: 'amenities',
      geometryType: 'point',
      priority: 63,
      osmQuery: 'node["amenity"~"hospital|clinic|pharmacy|doctors"]|way["amenity"~"hospital|clinic|pharmacy|doctors"]',
      style: {
        fillColor: [244, 67, 54, 255], // Red
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'Hospitals, clinics, pharmacies',
    },
    {
      id: 'poi-education',
      name: 'Education',
      group: 'amenities',
      geometryType: 'point',
      priority: 64,
      osmQuery: 'node["amenity"~"school|university|college|kindergarten"]|way["amenity"~"school|university|college|kindergarten"]',
      style: {
        fillColor: [103, 58, 183, 255], // Purple
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'Schools, universities, colleges',
    },
    {
      id: 'poi-bike-parking',
      name: 'Bike Parking',
      group: 'amenities',
      geometryType: 'point',
      priority: 65,
      osmQuery: 'node["amenity"="bicycle_parking"]|way["amenity"="bicycle_parking"]',
      style: {
        fillColor: [0, 188, 212, 255], // Cyan
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'Bicycle parking locations',
    },
    {
      id: 'poi-bike-shops',
      name: 'Bike Services',
      group: 'amenities',
      geometryType: 'point',
      priority: 66,
      osmQuery: 'node["shop"="bicycle"]|way["shop"="bicycle"]|node["amenity"="bicycle_rental"]|way["amenity"="bicycle_rental"]',
      style: {
        fillColor: [0, 150, 136, 255], // Teal
        strokeColor: [255, 255, 255, 255],
        strokeWidth: 2,
      },
      statsRecipes: ['count', 'density'],
      visible: false,
      description: 'Bike shops and rental services',
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

import type { StoryPreset } from '../types';

// Preset stories for one-click urban analysis perspectives
export const storyPresets: StoryPreset[] = [
  {
    id: 'built-intensity',
    name: 'Built Intensity',
    description: 'Building density and development patterns',
    icon: '🏗️',
    activeLayers: [
      'buildings-residential',
      'buildings-commercial',
      'buildings-industrial',
      'buildings-other',
    ],
    camera: { pitch: 60, bearing: -30 },
    explodedView: { enabled: true, layerSpacing: 80, intraGroupRatio: 0.3 },
  },
  {
    id: 'amenity-access',
    name: 'Amenity Access',
    description: 'POI distribution and services',
    icon: '🏪',
    activeLayers: [
      'poi-food-drink',
      'poi-shopping',
      'poi-health',
      'poi-education',
    ],
    camera: { pitch: 45, bearing: 0 },
    explodedView: { enabled: false },
  },
  {
    id: 'bike-friendliness',
    name: 'Bike Friendliness',
    description: 'Cycling infrastructure quality',
    icon: '🚴',
    activeLayers: [
      'bike-lanes',
      'poi-bike-parking',
      'poi-bike-shops',
    ],
    camera: { pitch: 30, bearing: 15 },
    explodedView: { enabled: false },
  },
  {
    id: 'green-balance',
    name: 'Green Balance',
    description: 'Green space vs built environment',
    icon: '🌳',
    activeLayers: [
      'parks',
      'trees',
      'water',
      'buildings-residential',
      'buildings-commercial',
    ],
    camera: { pitch: 50, bearing: 45 },
    explodedView: { enabled: true, layerSpacing: 100, intraGroupRatio: 0.4 },
  },
  {
    id: 'daily-needs',
    name: 'Daily Needs',
    description: 'Essential services accessibility',
    icon: '🛒',
    activeLayers: [
      'poi-grocery',
      'poi-health',
      'poi-education',
      'transit-stops',
    ],
    camera: { pitch: 40, bearing: 0 },
    explodedView: { enabled: false },
  },
];

// Helper to get a story by ID
export const getStoryById = (id: string): StoryPreset | undefined => {
  return storyPresets.find((story) => story.id === id);
};

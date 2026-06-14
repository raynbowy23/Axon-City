/**
 * Curated reference neighborhoods for the City DNA corpus (novelty track N2).
 *
 * Each entry is a small (~1–2 km) bbox over a well-known, character-rich
 * neighborhood. The corpus build script (buildDnaCorpus.ts) computes a raw DNA
 * vector for each; the distribution becomes the percentile-normalization basis
 * and the similarity reference set.
 *
 * bbox = [west, south, east, north] (lon/lat degrees).
 *
 * NOTE: these bboxes are hand-approximated starter values. Refine them (and add
 * more places — aim for ~80–100) before treating the corpus as authoritative.
 */

export interface CorpusNeighborhood {
  name: string;
  city: string;
  country: string;
  bbox: [number, number, number, number];
}

export const NEIGHBORHOODS: CorpusNeighborhood[] = [
  // North America
  { name: 'SoHo', city: 'New York', country: 'USA', bbox: [-74.005, 40.720, -73.996, 40.727] },
  { name: 'Greenwich Village', city: 'New York', country: 'USA', bbox: [-74.008, 40.730, -73.998, 40.737] },
  { name: 'Williamsburg', city: 'Brooklyn', country: 'USA', bbox: [-73.965, 40.708, -73.950, 40.720] },
  { name: 'The Mission', city: 'San Francisco', country: 'USA', bbox: [-122.422, 37.754, -122.406, 37.766] },
  { name: 'Nob Hill', city: 'San Francisco', country: 'USA', bbox: [-122.423, 37.789, -122.407, 37.797] },
  { name: 'Wicker Park', city: 'Chicago', country: 'USA', bbox: [-87.685, 41.903, -87.669, 41.913] },
  { name: 'The Loop', city: 'Chicago', country: 'USA', bbox: [-87.637, 41.877, -87.621, 41.887] },
  { name: 'Downtown', city: 'Los Angeles', country: 'USA', bbox: [-118.253, 34.040, -118.237, 34.050] },
  { name: 'Venice Beach', city: 'Los Angeles', country: 'USA', bbox: [-118.480, 33.985, -118.464, 33.995] },
  { name: 'La Condesa', city: 'Mexico City', country: 'Mexico', bbox: [-99.179, 19.407, -99.163, 19.417] },
  { name: 'Plateau', city: 'Montreal', country: 'Canada', bbox: [-73.585, 45.515, -73.572, 45.525] },

  // Europe
  { name: 'Le Marais', city: 'Paris', country: 'France', bbox: [2.354, 48.855, 2.368, 48.863] },
  { name: 'Montmartre', city: 'Paris', country: 'France', bbox: [2.333, 48.882, 2.347, 48.890] },
  { name: 'Soho', city: 'London', country: 'UK', bbox: [-0.139, 51.509, -0.123, 51.517] },
  { name: 'Shoreditch', city: 'London', country: 'UK', bbox: [-0.086, 51.522, -0.070, 51.530] },
  { name: 'Notting Hill', city: 'London', country: 'UK', bbox: [-0.213, 51.511, -0.197, 51.519] },
  { name: 'Kreuzberg', city: 'Berlin', country: 'Germany', bbox: [13.392, 52.493, 13.414, 52.505] },
  { name: 'Mitte', city: 'Berlin', country: 'Germany', bbox: [13.395, 52.518, 13.415, 52.530] },
  { name: 'Gràcia', city: 'Barcelona', country: 'Spain', bbox: [2.149, 41.399, 2.163, 41.409] },
  { name: 'El Born', city: 'Barcelona', country: 'Spain', bbox: [2.176, 41.381, 2.188, 41.389] },
  { name: 'Trastevere', city: 'Rome', country: 'Italy', bbox: [12.462, 41.885, 12.476, 41.893] },
  { name: 'Jordaan', city: 'Amsterdam', country: 'Netherlands', bbox: [4.873, 52.370, 4.888, 52.379] },
  { name: 'De Pijp', city: 'Amsterdam', country: 'Netherlands', bbox: [4.885, 52.351, 4.899, 52.359] },
  { name: 'Vesterbro', city: 'Copenhagen', country: 'Denmark', bbox: [12.539, 55.664, 12.555, 55.672] },
  { name: 'Södermalm', city: 'Stockholm', country: 'Sweden', bbox: [18.060, 59.310, 18.084, 59.318] },
  { name: 'Beyoğlu', city: 'Istanbul', country: 'Turkey', bbox: [28.969, 41.029, 28.985, 41.037] },

  // Asia
  { name: 'Shibuya', city: 'Tokyo', country: 'Japan', bbox: [139.694, 35.656, 139.706, 35.666] },
  { name: 'Shinjuku', city: 'Tokyo', country: 'Japan', bbox: [139.694, 35.685, 139.706, 35.695] },
  { name: 'Ginza', city: 'Tokyo', country: 'Japan', bbox: [139.757, 35.667, 139.773, 35.675] },
  { name: 'Gangnam', city: 'Seoul', country: 'South Korea', bbox: [127.019, 37.493, 127.035, 37.503] },
  { name: 'Hongdae', city: 'Seoul', country: 'South Korea', bbox: [126.915, 37.551, 126.931, 37.561] },
  { name: 'Causeway Bay', city: 'Hong Kong', country: 'China', bbox: [114.176, 22.276, 114.192, 22.284] },
  { name: 'Tsim Sha Tsui', city: 'Hong Kong', country: 'China', bbox: [114.164, 22.293, 114.180, 22.301] },

  // Southern Hemisphere
  { name: 'Palermo', city: 'Buenos Aires', country: 'Argentina', bbox: [-58.438, -34.593, -58.422, -34.583] },
  { name: 'Surry Hills', city: 'Sydney', country: 'Australia', bbox: [151.203, -33.890, 151.219, -33.880] },
  { name: 'Fitzroy', city: 'Melbourne', country: 'Australia', bbox: [144.970, -37.804, 144.986, -37.794] },
];

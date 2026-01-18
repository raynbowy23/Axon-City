# AxonCity

An interactive exploded axonometric map visualization tool for exploring urban spatial data. Draw selection areas on any location, fetch OpenStreetMap data, and visualize city layers in a stunning 3D exploded view.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![React](https://img.shields.io/badge/react-19.x-61dafb.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6.svg)
![Vite](https://img.shields.io/badge/vite-7.x-646cff.svg)

## Features

### Interactive Map Selection
- Draw custom polygon areas on the map to define your region of interest
- Edit selection by dragging vertices, adding new points, or removing existing ones
- Search for any location worldwide using the integrated search bar

### Exploded Axonometric View
- Visualize urban layers separated vertically in an exploded diagram style
- Toggle between flat and exploded views with adjustable layer spacing
- Layers are grouped by category: Environment, Land Use, Infrastructure, Access & Transit, and Safety

### 3D Extracted View
- Dedicated 3D viewer with orbit controls for detailed exploration
- Interactive layer group toggles
- Click features to pin information cards that follow the 3D geometry
- Platform indicators show layer group boundaries

### Real-time OSM Data
- Fetches live data from OpenStreetMap's Overpass API
- Automatic feature clipping to selection polygon
- Statistics calculation (count, density, area, length) per layer

### Custom Data Import
- Upload your own GeoJSON or CSV files as custom layers
- Auto-detection of coordinate columns in CSV files
- Custom layers appear at the top of the layer stack
- Zoom-to-extent functionality for imported data

### Layer Management
- Drag-and-drop layer reordering
- Per-layer visibility toggles
- Layer isolation mode for focused analysis
- Customizable layer groups and priorities

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **deck.gl** - WebGL-powered map visualization
- **MapLibre GL** - Base map rendering
- **Turf.js** - Geospatial analysis
- **Zustand** - State management
- **dnd-kit** - Drag and drop functionality

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/raynbowy23/AxonCity.git
cd AxonCity

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Usage

1. **Search for a location** using the search bar at the top
2. **Click "Draw Selection Area"** to start drawing a polygon
3. **Click on the map** to add points (minimum 3 points required)
4. **Press Enter** or click "Complete" to finish drawing
5. **Wait for data to load** from OpenStreetMap
6. **Explore the data** using the control panel on the right:
   - Toggle layer visibility
   - Adjust exploded view settings
   - Reorder layers via drag-and-drop
7. **Open the Extracted View** for a dedicated 3D exploration experience
8. **Import custom data** using the "Import Data" button

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Complete polygon drawing |
| `Escape` | Cancel drawing |
| `Ctrl+Z` | Undo last point |

### Editing Selection

- **Drag vertices** to reshape the polygon
- **Click blue midpoints** to add new vertices
- **Double-click vertices** to remove them

## Layer Groups

| Group | Description | Example Layers |
|-------|-------------|----------------|
| Environment | Natural features | Parks, water bodies, trees |
| Land Use | Buildings by type | Residential, commercial, industrial |
| Infrastructure | Built structures | Roads, railways, bridges |
| Access & Transit | Transportation | Bus stops, bike lanes, crosswalks |
| Safety | Emergency services | Fire stations, hospitals, police |

## Project Structure

```
src/
├── components/          # React components
│   ├── MapView.tsx      # Main map with deck.gl layers
│   ├── ExtractedView.tsx# 3D extracted view
│   ├── ControlPanel.tsx # Layer controls
│   ├── StatsPanel.tsx   # Statistics display
│   ├── DataInputPanel.tsx# Custom data import
│   └── ...
├── data/
│   └── layerManifest.ts # Layer definitions
├── hooks/               # Custom React hooks
├── store/
│   └── useStore.ts      # Zustand state management
├── types/
│   └── index.ts         # TypeScript definitions
└── utils/
    ├── osmFetcher.ts    # Overpass API client
    ├── geometryUtils.ts # Spatial operations
    └── csvParser.ts     # CSV to GeoJSON converter
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Map data from [OpenStreetMap](https://www.openstreetmap.org/) contributors
- Base map tiles from [MapLibre](https://maplibre.org/)
- Visualization powered by [deck.gl](https://deck.gl/)

## Contact

Rei Tamaru ([@raynbowy23](https://github.com/raynbowy23))

---

Made with deck.gl and OpenStreetMap

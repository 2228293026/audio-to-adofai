# Audio to ADOFAI Converter

A modern TypeScript-based converter that transforms 4K rhythm game charts and audio files into ADOFAI (A Dance of Fire andIce) format.

## Features

### 4K Chart Converter
- Import 4K charts (Malody format) and convert to ADOFAI
- Three encoding modes:
  - **Smart**: Dynamically chooses between straight lines and polygon angles based on note density
  - **Hybrid Angle**: Prioritizes angle data with optional Twirl and Pause events
  - **Speed Only**: Pure straight path with BPM events for maximum timing accuracy
- Three chord handling modes:
  - **Merge**: Combine simultaneous notes into one tile
  - **Split**: Expand chords into sequential tiles with spacing
  - **Force Single**: Ignore all but the first note in each chord

### Audio to ADOFAI (NEW!)
- Upload any audio file (MP3, WAV, etc.)
- Automatic beat detection using Web Audio API
- Generate 4K notes from detected beats
- Apply full ADOFAI encoding pipeline
- Multiple note generation strategies:
  - Single Track (all beats to column 0)
  - Alternating (cycles through columns 0-3)
  - Random (random column assignment)
  - Pattern 4 (fixed 0,1,2,3 pattern)

### Additional Features
- Style profile support for smart encoding customization
- Manual offset adjustment
- BPM change preservation
- Export to .adofai format
- Modern React UI with Vite

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **State Management**: React hooks (useState, useCallback)
- **Audio Processing**: Web Audio API
- **Build Tool**: Vite 6

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Usage

1. Open the application in your browser (default: http://localhost:3000)
2. Choose either:
   - **4K Chart Converter**: Upload a 4K JSON/TXT file and configure options
   - **Audio to ADOFAI**: Upload an audio file, select note generation strategy, and convert
3. Click the conversion button
4. Download your .adofai file

## Project Structure

```
src/
├── App.tsx                 # Main application component
├── main.tsx               # React entry point
├── vite-env.d.ts          # Vite type declarations
├── components/            # UI components
│   ├── FileUploader.tsx   # 4K file upload component
│   ├── AudioUploader.tsx  # Audio file upload with preview
│   ├── ConverterForm.tsx  # Conversion options form
│   └── ResultDisplay.tsx  # Result display and download
├── lib/
│   ├── converter/         # 4K to ADOFAI conversion logic
│   │   ├── types.ts       # TypeScript interfaces
│   │   ├── timing.ts      # Timing segment reconstruction
│   │   ├── notes.ts       # Note extraction and grouping
│   │   ├── timeline.ts    # Timeline building
│   │   ├── utils.ts       # Shared utilities
│   │   ├── encoders/      # Encoding modes
│   │   │   ├── speedOnly.ts
│   │   │   ├── hybridAngle.ts
│   │   │   └── smart.ts
│   │   └── index.ts       # Main conversion entry point
│   ├── audio/             # Audio processing
│   │   ├── beatDetector.ts  # Beat detection algorithm
│   │   ├── noteGenerator.ts # Generate notes from beats
│   │   └── index.ts
│   └── audioToAdofai.ts   # Audio-to-ADOFAI pipeline
└── styles/
    └── main.css          # Global styles
```

## Conversion Pipeline

### 4K Chart Path
1. Load 4K JSON file
2. Build timing segments from BPM events
3. Extract and group notes
4. Build timeline with chord handling
5. Apply encoding mode (speed_only, hybrid_angle, smart)
6. Generate ADOFAI JSON
7. Download file

### Audio Path
1. Upload audio file
2. Decode with Web Audio API
3. Detect beats using energy-based onset detection
4. Estimate BPM
5. Generate 4K note structure from beats
6. Apply same 4K→ADOFAI conversion pipeline
7. Download file

## Configuration Options

### Encoding Modes

| Mode | Path | Angle Data | Events |
|------|------|------------|--------|
| `smart` | Dynamic | Dynamic based on density | SetSpeed, Twirl |
| `hybrid_angle` | N/A (angle-based) | Primary representation | SetSpeed, Pause, Twirl |
| `speed_only` | Straight (`R`*N) | None | SetSpeed |

### Chord Modes

| Mode | Description |
|------|-------------|
| `merge` | Combine notes at same time into one tile |
| `split` | Separate chords with spacing |
| `force_single` | Use only first note from each chord |

### Checkboxes

- **Include releases**: Convert hold note releases to hits
- **Enable Twirl**: Insert Twirl events when angles exceed 180°
- **Simulate chord angles**: Spread chords across multiple angles (simulate multi-key)
- **Preserve BPM changes**: Keep original BPM events from source chart

## Notes

- This is a browser-based application; all conversion happens client-side
- Large audio files may take time to process; be patient
- Beat detection accuracy depends on audio quality and genre
- Adjustable thresholds for smart encoding available via style profile JSON

## Style Profile JSON

Customize smart encoding behavior:

```json
{
  "name": "custom",
  "straightDenseThresholdMs": 140,
  "sparseAngleThresholdMs": 190,
  "canonicalDegrees": [180, 120, 90, 60, 45, 135],
  "chordAngleDeg": 22.5,
  "twirlThresholdDeg": 202.5,
  "useTwirl": true,
  "bpmPalette": []
}
```

## Browser Support

- Chrome (recommended)
- Firefox
- Edge
- Safari (may have limited Audio API support)

## License

Educational/E'tainment purposes only.

## Credits

Ported from original Python implementation with permission.

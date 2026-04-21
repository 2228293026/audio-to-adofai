# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a 4K rhythm game chart to ADOFAI (A Dance of Fire and Ice) converter. It converts 4K note charts (typically from Malody) into ADOFAI format with multiple encoding strategies.

## Running the Application

### GUI Mode
```bash
python "4k to adofai/main.py"
```
Launches the GUI with authentication prompt (verification code: `sensei_4040`).

### CLI Mode
```bash
python "4k to adofai/main.py" <input.json/txt> <output.adofai> [encoding_mode] [chord_mode] [include_releases:0|1] [split_spacing_ms] [manual_offset_ms] [use_twirl:0|1] [simulate_chords:0|1] [preserve_bpm:0|1] [model.json|'']
```

Example:
```bash
python "4k to adofai/main.py" input.txt output.adofai smart merge 0 12.0 0.0 1 1 1 ""
```

## Architecture

### Core Data Flow
1. **Input Parsing** (`build_timing_segments`, `extract_note_groups`): Parses 4K JSON/TXT, reconstructs timing segments from BPM events, groups notes by timestamp
2. **Timeline Building** (`build_timeline`): Converts note groups into a timeline with chord handling (merge/split/force_single)
3. **Encoding** (three modes):
   - `encode_speed_only`: Uses straight path + BPM events only
   - `encode_hybrid_angle`: Prioritizes angle data, inserts SetSpeed/Pause/Twirl as needed
   - `encode_smart`: Dynamic selection based on note density, supports style profiles
4. **Output Generation** (`build_common_chart`): Constructs ADOFAI JSON structure

### Key Data Classes
- `TimingSegment`: BPM change point with beat, bpm, abs_seconds
- `RawEvent`: Individual note event with beat, time_seconds, column
- `NoteGroup`: Notes at the same timestamp (chords)
- `TimelineHit`: Final timeline position with chord metadata
- `StyleProfile`: Configuration for smart encoding (thresholds, canonical degrees, BPM palette)

### Encoding Modes
- **smart**: Dynamic selection - straight lines for dense areas (<140ms), polygon angles for sparse areas (>190ms)
- **hybrid_angle**: Angle-based with SetSpeed/Pause/Twirl events
- **speed_only/force_straight**: Pure straight path with BPM events

### Chord Modes
- **merge**: Combine simultaneous notes into single ADOFAI tile
- **split**: Expand chords into sequential tiles with spacing
- **force_single**: Ignore chords, only convert first note

## File Structure

```
4k to adofai/
├── main.py              # Main application (GUI + CLI + conversion logic)
├── 使用说明.txt         # Chinese usage instructions
└── 核对码.txt           # Verification code (sensei_4040)
```

## Important Notes

- The GUI requires authentication with verification code `sensei_4040`
- Input files are typically Malody 4K charts (`.mc` converted to `.txt`)
- Style profiles are optional JSON files for customizing smart encoding behavior
- The converter preserves explicit BPM changes when `preserve_explicit_bpm` is enabled

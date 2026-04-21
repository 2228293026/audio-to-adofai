import { NoteEvent, Chart4K, TimeEvent } from '../converter/types';

export type NoteGenerationStrategy =
  | 'single'      // All beats to column 0
  | 'alternating' // Alternating columns: 0, 1, 2, 3
  | 'random'      // Random column for each beat
  | 'pattern4';   // Fixed 4-beat pattern: 0,1,2,3,0,1,2,3,...

export interface NoteGenerationOptions {
  strategy: NoteGenerationStrategy;
  baseBpm?: number;
  beatOffsets?: number[]; // Additional notes per beat (create chords)
}

const DEFAULT_OPTIONS: NoteGenerationOptions = {
  strategy: 'single',
  baseBpm: 120,
  beatOffsets: []
};

/**
 * Generate 4K notes from beat timestamps
 */
export function generate4kNotesFromBeats(
  beats: number[],
  options: NoteGenerationOptions = DEFAULT_OPTIONS
): NoteEvent[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const notes: NoteEvent[] = [];

  // Helper to convert time to beat tuple [whole, num, den]
  const secondsToBeatTuple = (seconds: number): [number, number, number] => {
    // Use time signature assumption: 4/4, beat = seconds * BPM / 60
    const beatValue = (seconds * opts.baseBpm!) / 60;
    let whole = Math.floor(beatValue);
    let fraction = beatValue - whole;
    // Represent as [whole, numerator, denominator]
    // Using denominator 96 for precision
    const den = 96;
    let num = Math.round(fraction * den);
    // Normalize: if rounding carries over, adjust whole part
    if (num >= den) {
      whole += Math.floor(num / den);
      num = num % den;
    }
    return [whole, num, den];
  };

  const getColumn = (index: number): number => {
    switch (opts.strategy) {
      case 'single':
        return 0;
      case 'alternating':
        return index % 2; // alternate between columns 0 and 1
      case 'pattern4':
        return index % 4; // cycle through 0,1,2,3
      case 'random':
        return Math.floor(Math.random() * 4);
      default:
        return 0;
    }
  };

  for (let i = 0; i < beats.length; i++) {
    const time = beats[i];
    const beatTuple = secondsToBeatTuple(time);
    const column = getColumn(i);

    notes.push({
      beat: beatTuple,
      column
    });

    // Add additional notes at the same time for chords if specified
    if (opts.beatOffsets && opts.beatOffsets.length > 0) {
      for (const offset of opts.beatOffsets) {
        if (offset > 0 && offset < 0.5) {
          // Add a second note slightly offset (simulating chord)
          const offsetTuple = secondsToBeatTuple(time + offset);
          notes.push({
            beat: offsetTuple,
            column: (column + 1) % 4 // Shift to different column
          });
        }
      }
    }
  }

  return notes;
}

/**
 * Build complete 4K chart structure from beats
 *
 * If baseBpm is provided (>0), uses constant BPM mode (all notes
 * have fractional beat positions based on that BPM).
 *
 * If baseBpm is not provided, uses dynamic BPM mode:
 *   - Notes are placed on integer beats (0,1,2,...)
 *   - BPM changes are generated for each interval to preserve exact timing
 *   - chart.settings.offset should be set to the first beat time (in ms) to align
 */
export function build4kChartFromBeats(
  beats: number[],
  options: NoteGenerationOptions = DEFAULT_OPTIONS,
  songTitle: string = 'Audio Generated',
  songArtist: string = 'Unknown',
  audioFileName: string = 'audio.mp3'
): Chart4K {
  const noteCount = beats.length;
  if (noteCount === 0) {
    throw new Error('No beats to generate chart');
  }

  const getColumn = (index: number): number => {
    switch (options.strategy) {
      case 'single':
        return 0;
      case 'alternating':
        return index % 2; // alternate between columns 0 and 1
      case 'pattern4':
        return index % 4; // cycle through 0,1,2,3
      case 'random':
        return Math.floor(Math.random() * 4);
      default:
        return 0;
    }
  };

  // Constant BPM mode: generate notes with fractional beats using baseBpm
  if (options.baseBpm && options.baseBpm > 0) {
    const notes = generate4kNotesFromBeats(beats, options);
    return {
      meta: {
        song: {
          bpm: options.baseBpm,
          title: songTitle,
          artist: songArtist,
          file: audioFileName
        }
      },
      time: [],
      note: notes
    };
  }

  // Dynamic BPM mode: integer beats + per-interval BPM events
  const notes: NoteEvent[] = [];
  const timeEvents: TimeEvent[] = [];

  for (let i = 0; i < noteCount; i++) {
    notes.push({
      beat: [i, 0, 1],
      column: getColumn(i)
    });
  }

  if (noteCount >= 2) {
    for (let i = 0; i < noteCount - 1; i++) {
      const intervalSec = beats[i + 1] - beats[i];
      if (intervalSec <= 0) continue;
      const bpm = 60 / intervalSec;
      timeEvents.push({
        beat: [i, 0, 1],
        bpm: Math.round(bpm * 1000000) / 1000000,
        delay: 0
      });
    }
  }

  const metaBpm = timeEvents[0]?.bpm ?? 120;

  return {
    meta: {
      song: {
        bpm: metaBpm,
        title: songTitle,
        artist: songArtist,
        file: audioFileName
      }
    },
    time: timeEvents,
    note: notes
  };
}

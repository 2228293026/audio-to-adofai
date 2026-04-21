import { TimingSegment, Chart4K } from './types';

/**
 * Convert Malody beat tuple [whole, num, den] to float
 * e.g., [1, 2, 3] -> 1.666...
 */
export function beatTupleToFloat(beat: [number, number, number]): number {
  const [whole, num, den] = beat;
  if (den === 0) {
    throw new Error(`beat denominator cannot be 0: ${beat}`);
  }
  return Number(whole) + Number(num) / Number(den);
}

/**
 * Build timing segments from chart's time events
 * Each segment represents a BPM change with absolute timing
 */
export function buildTimingSegments(chart: Chart4K): TimingSegment[] {
  const timeEvents = chart.time || [];
  if (timeEvents.length === 0) {
    const songBpm = chart.meta?.song?.bpm ?? 120;
    return [{ beat: 0, bpm: songBpm, absSeconds: 0, index: 0 }];
  }

  const sortedEvents = [...timeEvents].sort(
    (a, b) => beatTupleToFloat(a.beat) - beatTupleToFloat(b.beat)
  );

  const segments: TimingSegment[] = [];
  let prevBeat: number | null = null;
  let prevBpm: number | null = null;
  let currentAbsSeconds = 0;

  for (let idx = 0; idx < sortedEvents.length; idx++) {
    const event = sortedEvents[idx];
    const beat = beatTupleToFloat(event.beat);
    const bpm = Number(event.bpm);
    const delaySeconds = (event.delay ?? 0) / 1000;

    if (idx === 0) {
      currentAbsSeconds = delaySeconds;
    } else if (prevBeat !== null && prevBpm !== null) {
      currentAbsSeconds += ((beat - prevBeat) * 60) / prevBpm + delaySeconds;
    }

    segments.push({
      beat,
      bpm,
      absSeconds: currentAbsSeconds,
      index: idx
    });

    prevBeat = beat;
    prevBpm = bpm;
  }

  return segments;
}

/**
 * Find the timing segment that contains the given beat
 */
export function locateSegment(beatValue: number, segments: TimingSegment[]): TimingSegment {
  let current = segments[0];
  for (let i = 1; i < segments.length; i++) {
    if (beatValue >= segments[i].beat) {
      current = segments[i];
    } else {
      break;
    }
  }
  return current;
}

/**
 * Convert beat value to absolute seconds using timing segments
 */
export function beatToSeconds(
  beatValue: number,
  segments: TimingSegment[]
): [number, number, number] {
  const seg = locateSegment(beatValue, segments);
  const seconds =
    seg.absSeconds + (beatValue - seg.beat) * (60 / seg.bpm);
  return [seconds, seg.bpm, seg.index];
}

/**
 * Collect all unique BPM values from timing segments
 */
export function collectSourceBpmPalette(chart: Chart4K): number[] {
  const segments = buildTimingSegments(chart);
  const seen = new Set<number>();
  const palette: number[] = [];

  for (const seg of segments) {
    const val = Math.round(seg.bpm * 1_000_000) / 1_000_000;
    if (val > 0 && !seen.has(val)) {
      seen.add(val);
      palette.push(val);
    }
  }

  const songBpm = chart.meta?.song?.bpm ?? 0;
  const val = Math.round(songBpm * 1_000_000) / 1_000_000;
  if (val > 0 && !seen.has(val)) {
    seen.add(val);
    palette.push(val);
  }

  return palette;
}

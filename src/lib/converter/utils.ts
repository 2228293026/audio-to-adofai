import {
  Chart4K,
  AdofaiChart,
  AdofaiSettings,
  Action,
  TimelineHit
} from './types';

/**
 * Calculate time intervals between consecutive timeline hits
 */
export function intervalsFromTimeline(timeline: TimelineHit[]): number[] {
  if (timeline.length === 0) {
    throw new Error('timeline is empty');
  }

  const intervals: number[] = [];
  intervals.push(Math.max(timeline[0].timeSeconds, 1e-9));

  for (let i = 1; i < timeline.length; i++) {
    const dt = timeline[i].timeSeconds - timeline[i - 1].timeSeconds;
    intervals.push(Math.max(dt, 1e-9));
  }

  return intervals;
}

/**
 * Pretty-print BPM with 6 decimal places
 */
export function prettyBpm(bpm: number): number {
  return Math.round(Number(bpm) * 1_000_000) / 1_000_000;
}

/**
 * Clamp angle to [0, 360) range
 */
export function clampDeg(value: number): number {
  let v = Number(value) % 360;
  if (Math.abs(v) < 1e-12) {
    return 0;
  }
  return v;
}

/**
 * Find nearest value in palette
 */
export function nearestCanonical(
  value: number,
  palette: number[]
): [number, number] {
  let best: number | null = null;
  let bestDiff = Infinity;

  for (const x of palette) {
    const diff = Math.abs(Number(value) - Number(x));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = x;
    }
  }

  return [best ?? value, bestDiff];
}

/**
 * Compress BPM changes - returns [firstBpm, actions[]]
 * Merges consecutive same-BPM intervals
 */
export function compressBpmActions(intervals: number[]): [number, Action[]] {
  if (intervals.length === 0) {
    throw new Error('intervals is empty');
  }

  const bpms = intervals.map(dt => 60 / dt);
  const firstBpm = Math.round(bpms[0] * 1_000_000_000) / 1_000_000_000;
  const actions: Action[] = [];
  let prevBpm = firstBpm;

  for (let floor = 1; floor < bpms.length; floor++) {
    const bpm = Math.round(bpms[floor] * 1_000_000_000) / 1_000_000_000;
    if (bpm !== prevBpm) {
      actions.push({
        floor,
        eventType: 'SetSpeed',
        speedType: 'Bpm',
        beatsPerMinute: bpm,
        bpmMultiplier: 1
      });
      prevBpm = bpm;
    }
  }

  return [firstBpm, actions];
}

/**
 * Build common ADOFAI chart structure
 */
export function buildCommonChart(
  chart4k: Chart4K,
  settingsBpm: number,
  manualOffsetMs: number,
  levelTag: string,
  extra: { pathData?: string; angleData?: number[]; actions: Action[] }
): AdofaiChart {
  const srcMeta = chart4k.meta ?? {};
  const srcSong = srcMeta.song ?? {};
  const title = srcSong.title ?? 'Unknown';
  const artist = srcSong.artist ?? 'Unknown';
  const songFile = srcSong.file ?? '';

  const settings: AdofaiSettings = {
    version: 4,
    artist,
    specialArtistType: 'None',
    artistPermission: '',
    song: title,
    author: '4K to ADOFAI Integrated Converter',
    separateCountdownTime: 'Disabled',
    previewImage: '',
    previewIcon: '',
    previewIconColor: '003f52',
    previewSongStart: 0,
    previewSongDuration: 10,
    seizureWarning: 'Disabled',
    levelDesc: `Converted from 4K. mode=${levelTag}.`,
    levelTags: `converted,4k,integrated,${levelTag}`,
    artistLinks: '',
    difficulty: 1,
    songFilename: songFile,
    bpm: settingsBpm,
    volume: 100,
    offset: Math.round(manualOffsetMs * 1000) / 1000,
    pitch: 100,
    hitsound: 'Kick',
    hitsoundVolume: 100,
    countdownTicks: 0,
    trackColorType: 'Single',
    trackColor: 'debb7b',
    secondaryTrackColor: 'ffffff',
    trackColorAnimDuration: 2,
    trackColorPulse: 'None',
    trackPulseLength: 10,
    trackStyle: 'Standard',
    trackAnimation: 'None',
    beatsAhead: 3,
    trackDisappearAnimation: 'None',
    beatsBehind: 4,
    backgroundColor: '000000',
    showDefaultBGIfNoImage: 'Enabled',
    bgImage: '',
    bgImageColor: 'ffffff',
    parallax: [100, 100],
    bgDisplayMode: 'FitToScreen',
    lockRot: 'Disabled',
    loopBG: 'Disabled',
    unscaledSize: 100,
    relativeTo: 'Player',
    position: [0, 0],
    rotation: 0,
    zoom: 100,
    bgVideo: '',
    loopVideo: 'Disabled',
    vidOffset: 0,
    floorIconOutlines: 'Disabled',
    stickToFloors: 'Disabled',
    planetEase: 'Linear',
    planetEaseParts: 1,
    legacyFlash: false
  };

  const chart: AdofaiChart = {
    settings,
    actions: extra.actions,
    decorations: []
  };

  if (extra.pathData) {
    chart.pathData = extra.pathData;
  }
  if (extra.angleData) {
    chart.angleData = extra.angleData;
  }

  return chart;
}

/**
 * Load and parse JSON file
 */
export async function loadJsonFile<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load file: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Adjust angle using twirl state
 */
export function adjustAngleWithTwirl(
  rawDeg: number,
  twirled: boolean
): number {
  return rawDeg >= 360 ? 360 : Math.max(twirled ? 360 - rawDeg : rawDeg, 0.001);
}

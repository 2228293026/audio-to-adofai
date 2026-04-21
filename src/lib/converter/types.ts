// Core data structures for 4K to ADOFAI conversion
// Ported from Python dataclasses (main.py lines 41-121)

export interface TimingSegment {
  beat: number;
  bpm: number;
  absSeconds: number;
  index: number;
}

export interface RawEvent {
  beat: number;
  timeSeconds: number;
  column: number;
  kind: 'hit' | 'release';
  bpm: number;
  segmentIndex: number;
}

export interface NoteGroup {
  groupId: number;
  beat: number;
  timeSeconds: number;
  columns: readonly number[];
  kind: string;
  bpm: number;
  segmentIndex: number;
  chordSize: number;
}

export interface TimelineHit {
  floor: number;
  timeSeconds: number;
  columns: readonly number[];
  chordSize: number;
  groupId: number;
  bpm: number;
  segmentIndex: number;
  kind: string;
  chordPieceIndex: number;
  chordPieceTotal: number;
  isChordSimPiece: boolean;
}

export interface StyleProfile {
  name: string;
  straightDenseThresholdMs: number;
  sparseAngleThresholdMs: number;
  canonicalDegrees: number[];
  chordAngleDeg: number;
  twirlThresholdDeg: number;
  twirlEventPenalty: number;
  speedEventPenalty: number;
  useTwirl: boolean;
  bpmPalette: number[];
}

export interface ConversionOptions {
  encodingMode: 'speed_only' | 'force_straight' | 'hybrid_angle' | 'smart';
  chordMode: 'merge' | 'split' | 'force_single';
  includeReleases: boolean;
  splitSpacingMs: number;
  manualOffsetMs: number;
  useTwirl: boolean;
  simulateChordsWithAngle: boolean;
  preserveExplicitBpm: boolean;
  modelPath?: string | null;
  energyThresholdPct?: number; // for audio: 0-100, filtering low-energy beats
}

export interface EncodingStats {
  encodingMode: string;
  actionsCount: number;
  setspeedCount: number;
  twirlCount: number;
  pauseCount: number;
  pathLength: number;
  firstHitSeconds: number;
  lastHitSeconds: number;
  profile?: string;
}

export interface ConversionResult {
  inputPath: string;
  outputPath: string;
  encodingMode: string;
  chordMode: string;
  includeReleases: boolean;
  splitSpacingMs: number;
  manualOffsetMs: number;
  useTwirl: boolean;
  simulateChordsWithAngle: boolean;
  preserveExplicitBpm: boolean;
  profile: string;
  timeline: {
    groupCount: number;
    timelineHitCount: number;
    chordGroups: number;
    maxGroupSize: number;
    ignoredChordNotes: number;
  };
  encoding: EncodingStats;
  chart?: AdofaiChart; // Generated ADOFAI chart data for re-download
}

// ADOFAI Chart structure
export interface AdofaiSettings {
  version: number;
  artist: string;
  specialArtistType: string;
  artistPermission: string;
  song: string;
  author: string;
  separateCountdownTime: 'Enabled' | 'Disabled';
  previewImage: string;
  previewIcon: string;
  previewIconColor: string;
  previewSongStart: number;
  previewSongDuration: number;
  seizureWarning: 'Enabled' | 'Disabled';
  levelDesc: string;
  levelTags: string;
  artistLinks: string;
  difficulty: number;
  songFilename: string;
  bpm: number;
  volume: number;
  offset: number;
  pitch: number;
  hitsound: string;
  hitsoundVolume: number;
  countdownTicks: number;
  trackColorType: string;
  trackColor: string;
  secondaryTrackColor: string;
  trackColorAnimDuration: number;
  trackColorPulse: string;
  trackPulseLength: number;
  trackStyle: string;
  trackAnimation: string;
  beatsAhead: number;
  trackDisappearAnimation: string;
  beatsBehind: number;
  backgroundColor: string;
  showDefaultBGIfNoImage: 'Enabled' | 'Disabled';
  bgImage: string;
  bgImageColor: string;
  parallax: [number, number];
  bgDisplayMode: string;
  lockRot: 'Enabled' | 'Disabled';
  loopBG: 'Enabled' | 'Disabled';
  unscaledSize: number;
  relativeTo: string;
  position: [number, number];
  rotation: number;
  zoom: number;
  bgVideo: string;
  loopVideo: 'Enabled' | 'Disabled';
  vidOffset: number;
  floorIconOutlines: 'Enabled' | 'Disabled';
  stickToFloors: 'Enabled' | 'Disabled';
  planetEase: string;
  planetEaseParts: number;
  legacyFlash: boolean;
}

export interface AdofaiChart {
  settings: AdofaiSettings;
  pathData?: string;
  angleData?: number[];
  actions: Action[];
  decorations: Decoration[];
}

export interface Action {
  floor: number;
  eventType: string;
  [key: string]: any;
}

export interface Decoration {
  [key: string]: any;
}

// 4K chart structure (Malody format)
export interface Chart4K {
  meta: {
    song: {
      bpm: number;
      title: string;
      artist: string;
      file: string;
    };
  };
  time: TimeEvent[];
  note: NoteEvent[];
  [key: string]: any;
}

export interface TimeEvent {
  beat: [number, number, number];
  bpm: number;
  delay?: number;
}

export interface NoteEvent {
  beat: [number, number, number];
  column: number;
  endbeat?: [number, number, number];
  [key: string]: any;
}

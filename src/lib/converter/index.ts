import {
  Chart4K,
  ConversionOptions,
  ConversionResult,
  StyleProfile
} from './types';

// Re-export types using 'export type' for isolatedModules
export type { Chart4K, ConversionOptions, ConversionResult, StyleProfile };

import { extractNoteGroups, buildTimeline } from './timeline';
import { encodeSpeedOnly } from './encoders/speedOnly';
import { encodeHybridAngle } from './encoders/hybridAngle';
import { encodeSmart } from './encoders/smart';
import { loadJsonFile } from './utils';

/**
 * Main conversion function
 *
 * Converts a 4K chart to ADOFAI format using specified encoding mode
 */
export async function convert4kToAdofai(
  inputPath: string,
  outputPath: string,
  options: ConversionOptions
): Promise<ConversionResult> {
  const {
    encodingMode,
    chordMode,
    includeReleases,
    splitSpacingMs,
    manualOffsetMs,
    useTwirl,
    simulateChordsWithAngle,
    preserveExplicitBpm,
    modelPath
  } = options;

  if (
    encodingMode !== 'speed_only' &&
    encodingMode !== 'force_straight' &&
    encodingMode !== 'hybrid_angle' &&
    encodingMode !== 'smart'
  ) {
    throw new Error(
      "encodingMode must be 'speed_only', 'force_straight', 'hybrid_angle', or 'smart'"
    );
  }

  // Load input chart
  const chart4k = await loadJsonFile<Chart4K>(inputPath);

  // Load style profile if provided
  let profile: StyleProfile = {
    name: 'builtin-default',
    straightDenseThresholdMs: 140,
    sparseAngleThresholdMs: 190,
    canonicalDegrees: [180, 120, 90, 60, 45, 135],
    chordAngleDeg: 22.5,
    twirlThresholdDeg: 202.5,
    twirlEventPenalty: 0.3,
    speedEventPenalty: 0.42,
    useTwirl: true,
    bpmPalette: []
  };

  if (modelPath) {
    try {
      const modelData = await loadJsonFile<Record<string, unknown>>(modelPath);
      profile = { ...profile, ...modelData } as StyleProfile;
    } catch (err) {
      console.warn(`Failed to load style profile from ${modelPath}:`, err);
    }
  }

  // Extract note groups and timing segments
  const [groups, segments] = extractNoteGroups(chart4k, includeReleases);

  // Build timeline
  const [timeline, timelineStats] = buildTimeline(
    groups,
    chordMode,
    splitSpacingMs,
    simulateChordsWithAngle
  );

  // Determine actual encoding mode
  const actualMode = encodingMode === 'force_straight' ? 'speed_only' : encodingMode;

  // Encode according to mode
  let chart;
  let encodingStats;

  if (actualMode === 'speed_only') {
    [chart, encodingStats] = encodeSpeedOnly(
      chart4k,
      timeline,
      manualOffsetMs,
      encodingMode
    );
  } else if (actualMode === 'hybrid_angle') {
    [chart, encodingStats] = encodeHybridAngle(
      chart4k,
      timeline,
      manualOffsetMs,
      useTwirl
    );
  } else {
    // smart mode
    profile.useTwirl = useTwirl;
    [chart, encodingStats] = encodeSmart(
      chart4k,
      timeline,
      segments,
      profile,
      manualOffsetMs,
      preserveExplicitBpm
    );
  }

  // Save output
  await saveAdofaiFile(outputPath, chart);

  return {
    inputPath,
    outputPath,
    encodingMode,
    chordMode,
    includeReleases,
    splitSpacingMs,
    manualOffsetMs,
    useTwirl,
    simulateChordsWithAngle,
    preserveExplicitBpm,
    profile: profile.name,
    timeline: timelineStats,
    encoding: encodingStats,
    chart
  };
}

/**
 * Download ADOFAI chart as file
 */
export async function saveAdofaiFile(
  path: string,
  chart: { settings: object; pathData?: string; angleData?: number[]; actions: any[]; decorations: any[] }
): Promise<void> {
  const data = JSON.stringify(chart, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? 'chart.adofai';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

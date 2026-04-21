import { convert4kToAdofai, ConversionOptions, ConversionResult } from './converter';
import { detectBeatsFromAudio, type BeatDetectionOptions } from './audio/beatDetector';
import { build4kChartFromBeats, type NoteGenerationStrategy } from './audio/noteGenerator';

/**
 * Convert audio file to ADOFAI chart
 *
 * Process:
 * 1. Detect beats from audio (with energy)
 * 2. Optionally filter by energy threshold
 * 3. Generate 4K chart (constant or dynamic BPM)
 * 4. Convert to ADOFAI
 *
 * @param audioFile - Audio file to convert
 * @param outputFileName - Desired output filename
 * @param options - Conversion options (encoding mode, chord mode, etc.) plus optional energyThresholdPct
 * @param noteStrategy - Strategy for generating notes from beats
 * @param baseBpm - Base BPM for note timing (overrides detected BPM if provided)
 * @param beatDetectionOptions - Optional custom beat detection options
 *
 * @returns Conversion result
 */
export async function convertAudioToAdofai(
  audioFile: File,
  outputFileName: string,
  options: Omit<ConversionOptions, 'inputPath'>,
  noteStrategy: NoteGenerationStrategy = 'single',
  baseBpm?: number,
  beatDetectionOptions?: BeatDetectionOptions
): Promise<ConversionResult> {
  // Step 1: Detect beats from audio (with energy)
  const { beatInfos, bpm: detectedBpm } = await detectBeatsFromAudio(audioFile, beatDetectionOptions);
  if (beatInfos.length === 0) {
    throw new Error('No beats detected in audio.');
  }

  // Energy filtering based on options.energyThresholdPct (0-100)
  let filteredBeats: Array<{time: number, energy: number}> = beatInfos;
  const energyThresholdPct = options.energyThresholdPct ?? 0;
  if (energyThresholdPct > 0) {
    const maxEnergy = Math.max(...beatInfos.map(bi => bi.energy));
    const thresholdVal = maxEnergy * (energyThresholdPct / 100);
    filteredBeats = beatInfos.filter(bi => bi.energy >= thresholdVal);
  }

  if (filteredBeats.length === 0) {
    throw new Error('All beats filtered out by energy threshold. Lower the threshold.');
  }

  const beats = filteredBeats.map(bi => bi.time);

  // Determine if using constant BPM (baseBpm provided) or dynamic (compute BPM changes per interval)
  const useDynamic = !(baseBpm && baseBpm > 0);
  const effectiveBaseBpm = useDynamic ? undefined : baseBpm;

  // Step 2: Generate 4K chart structure
  const chart4k = build4kChartFromBeats(beats, {
    strategy: noteStrategy,
    baseBpm: effectiveBaseBpm
  }, audioFile.name, 'Audio Generated', audioFile.name);

  // For dynamic BPM mode, adjust manual offset to align first note with its original time
  let manualOffsetMs = options.manualOffsetMs;
  if (useDynamic && beats.length > 0) {
    manualOffsetMs = (beats[0] ?? 0) * 1000 + manualOffsetMs;
  }

  // Step 3: Use existing 4K→ADOFAI conversion pipeline
  const chartBlob = new Blob([JSON.stringify(chart4k, null, 2)], {
    type: 'application/json'
  });
  const chartUrl = URL.createObjectURL(chartBlob);

  try {
    const result = await convert4kToAdofai(chartUrl, outputFileName, {
      ...options,
      manualOffsetMs,
      includeReleases: false // Audio doesn't have releases yet
    });

    return result;
  } finally {
    URL.revokeObjectURL(chartUrl);
  }
}

/**
 * Simple wrapper for quick audio conversion
 */
export async function quickAudioConvert(
  audioFile: File,
  outputFileName: string
): Promise<ConversionResult> {
  return convertAudioToAdofai(audioFile, outputFileName, {
    encodingMode: 'smart',
    chordMode: 'merge',
    includeReleases: false,
    splitSpacingMs: 12,
    manualOffsetMs: 0,
    useTwirl: true,
    simulateChordsWithAngle: true,
    preserveExplicitBpm: true
  }, 'single');
}

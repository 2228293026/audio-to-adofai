/**
 * Simple beat detection using Web Audio API
 * Energy-based onset detection algorithm
 */

export interface BeatDetectionOptions {
  blockSize?: number;
  threshold?: number;
  lookahead?: number;
  minBeatInterval?: number; // in seconds
}

interface FullOptions extends Required<BeatDetectionOptions> {
  sampleRate: number;
}

const DEFAULT_OPTIONS: FullOptions = {
  sampleRate: 44100,
  blockSize: 1024,
  threshold: 0.005, // Absolute RMS energy threshold (0-1 range)
  minBeatInterval: 0.05
};

/**
 * Get detection options based on detail level (1-10)
 * Higher level = more aggressive, more beats detected
 */
export function getDetectionOptions(level: number): Required<BeatDetectionOptions> {
  // Block size: Level 1 uses large blocks (4096 samples), Level 10 uses tiny blocks (128 samples)
  const blockSizes = [4096, 3072, 2048, 1536, 1024, 768, 512, 384, 256, 128];
  // Absolute RMS energy threshold: Level 1 uses 0.02 (high), Level 10 uses 0.001 (extremely low)
  const thresholds = [0.02, 0.018, 0.015, 0.012, 0.010, 0.008, 0.006, 0.004, 0.003, 0.002];
  // Minimum interval: Level 1 uses 0.1s (600 BPM max), Level 10 uses 0.01s (6000 BPM)
  const minIntervals = [0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.015];

  const idx = Math.max(1, Math.min(10, level)) - 1;

  return {
    blockSize: blockSizes[idx],
    threshold: thresholds[idx],
    minBeatInterval: minIntervals[idx],
    sampleRate: 44100
  };
}

export class BeatDetector {
  private options: FullOptions;
  private lastEnergy = 0;
  private lastBeatTime = 0;
  private beats: number[] = [];

  constructor(options: BeatDetectionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  reset() {
    this.lastEnergy = 0;
    this.lastBeatTime = 0;
    this.beats = [];
  }

  getBeats(): number[] {
    return [...this.beats];
  }

  /**
   * Process audio buffer and detect beats
   * Returns array of {time, energy} for each detected onset
   */
  detectBeats(audioBuffer: AudioBuffer): Array<{time: number, energy: number}> {
    this.reset();

    const channelData = audioBuffer.getChannelData(0);
    const { blockSize, threshold: absThreshold, minBeatInterval } = this.options;
    const numBlocks = Math.floor(channelData.length / blockSize);

    // Compute RMS energy per block
    const energies = new Array<number>(numBlocks);
    for (let i = 0; i < numBlocks; i++) {
      const start = i * blockSize;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        const sample = channelData[start + j];
        sum += sample * sample;
      }
      energies[i] = Math.sqrt(sum / blockSize);
    }

    // Detect peaks: exceed absolute threshold, local maximum, respect min interval
    const results: Array<{time: number, energy: number}> = [];
    let lastBeatTime = 0;

    for (let i = 0; i < numBlocks; i++) {
      const energy = energies[i];
      if (energy < absThreshold) continue;

      // Local maximum check
      if (i > 0 && energy < energies[i - 1]) continue;
      if (i < numBlocks - 1 && energy < energies[i + 1]) continue;

      const time = (i * blockSize + blockSize / 2) / audioBuffer.sampleRate;
      if (time - lastBeatTime < minBeatInterval) continue;

      results.push({ time, energy });
      this.beats.push(time); // for getBeats() compatibility
      lastBeatTime = time;
    }

    return results;
  }

  /**
   * Estimate BPM from detected beats
   */
  static estimateBpm(
    beats: number[],
    minBpm: number = 60,
    maxBpm: number = 240
  ): { bpm: number; confidence: number } {
    if (beats.length < 4) {
      return { bpm: 120, confidence: 0 };
    }

    // Calculate intervals between beats
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i] - beats[i - 1]);
    }

    // Average interval
    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const avgBpm = 60 / avgInterval;

    // Simple histogram approach to find most common BPM
    const bins = new Map<number, number>();

    for (const interval of intervals) {
      const bpm = 60 / interval;
      if (bpm >= minBpm && bpm <= maxBpm) {
        const bin = Math.round(bpm * 10) / 10; // Round to nearest 0.1 BPM
        bins.set(bin, (bins.get(bin) ?? 0) + 1);
      }
    }

    let bestBpm = avgBpm;
    let bestCount = 0;

    for (const [bpm, count] of bins) {
      if (count > bestCount) {
        bestCount = count;
        bestBpm = bpm;
      }
    }

    const confidence = bestCount / intervals.length;

    return {
      bpm: Math.round(bestBpm * 10) / 10,
      confidence
    };
  }
}

/**
 * Detect beats from audio file using Web Audio API
 */
export async function detectBeatsFromAudio(
  audioFile: File,
  options: BeatDetectionOptions = {}
): Promise<{ beatInfos: Array<{time: number, energy: number}>; bpm: number; confidence: number }> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const detector = new BeatDetector(options);
    const beatInfos = detector.detectBeats(audioBuffer);
    const times = beatInfos.map(bi => bi.time);
    const { bpm, confidence } = BeatDetector.estimateBpm(times);

    return { beatInfos, bpm, confidence };
  } finally {
    // Close the AudioContext to free resources
    if (audioContext.close) {
      try {
        await audioContext.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

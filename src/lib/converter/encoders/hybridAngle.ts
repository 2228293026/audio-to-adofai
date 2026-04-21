import { Chart4K, AdofaiChart, Action, TimelineHit, EncodingStats } from '../types';
import { intervalsFromTimeline, buildCommonChart } from '../utils';
import { collectSourceBpmPalette } from '../timing';

/**
 * Choose optimal BPM to keep angle in target range
 *
 * For a given interval dt and current BPM, tries to find a BPM
 * that results in an angle (dt * 3 * bpm) within [angle_low, angle_high]
 */
export function chooseWorkingBpm(
  dt: number,
  currentBpm: number,
  bpmPalette: number[],
  angleTarget: number = 120,
  angleLow: number = 45,
  angleHigh: number = 180,
  minBpm: number = 30,
  maxBpm: number = 360
): number {
  if (dt <= 0) {
    return Math.max(Math.min(currentBpm, maxBpm), minBpm);
  }

  const candidates: number[] = [];
  const seen = new Set<number>();

  const add = (x: number) => {
    let xr = Math.round(x * 1_000_000_000) / 1_000_000_000;
    if (xr <= 0) return;
    xr = Math.max(minBpm, Math.min(maxBpm, xr));
    if (!seen.has(xr)) {
      seen.add(xr);
      candidates.push(xr);
    }
  };

  add(currentBpm);
  for (const bpm of bpmPalette) {
    add(bpm);
  }
  add(angleTarget / (3 * dt));
  add(angleLow / (3 * dt));
  add(angleHigh / (3 * dt));
  add(180 / (3 * dt));

  // Score candidates: prefer those with angle in range
  const score = (a: number, b: number): number => {
    const getScore = (bpm: number): [number, number, number, number] => {
      const deg = dt * 3 * bpm;
      const within = angleLow <= deg && deg <= angleHigh ? 1 : 0;
      const withinHard = deg > 0 && deg <= 360 ? 1 : 0;
      return [
        -withinHard,
        -within,
        Math.abs(deg - angleTarget),
        Math.abs(bpm - currentBpm)
      ];
    };
    const scoreA = getScore(a);
    const scoreB = getScore(b);
    for (let i = 0; i < 4; i++) {
      if (scoreA[i] !== scoreB[i]) {
        return scoreA[i] - scoreB[i];
      }
    }
    return 0;
  };

  return candidates.sort(score)[0];
}

/**
 * Encode using hybrid angle mode
 * Prioritizes angle data, inserts SetSpeed/Pause/Twirl as needed
 */
export function encodeHybridAngle(
  chart4k: Chart4K,
  timeline: TimelineHit[],
  manualOffsetMs: number,
  useTwirl: boolean = true
): [AdofaiChart, EncodingStats] {
  const intervals = intervalsFromTimeline(timeline);
  const bpmPalette = collectSourceBpmPalette(chart4k);
  const firstBpm = Math.round((60 / intervals[0]) * 1_000_000_000) / 1_000_000_000;

  const actions: Action[] = [];
  let currentBpm = firstBpm;
  let twirled = false;
  let twirlCount = 0;
  let pauseCount = 0;
  let speedCount = 0;
  const rawClickDegs: number[] = [180]; // Start with straight

  for (let floor = 1; floor < intervals.length; floor++) {
    const dt = intervals[floor];

    // Choose optimal BPM
    const bpm = chooseWorkingBpm(dt, currentBpm, bpmPalette);
    if (Math.abs(bpm - currentBpm) > 1e-9) {
      actions.push({
        floor,
        eventType: 'SetSpeed',
        speedType: 'Bpm',
        beatsPerMinute: Math.round(bpm * 1_000_000_000) / 1_000_000_000,
        bpmMultiplier: 1
      });
      currentBpm = bpm;
      speedCount++;
    }

    // Calculate raw angle
    let rawDeg = dt * 3 * currentBpm;
    let pauseSeconds = 0;

    if (rawDeg > 360) {
      pauseSeconds = dt - (120 / currentBpm);
      rawDeg = 360;
    } else if (rawDeg <= 0) {
      rawDeg = 0.001;
    }

    // Determine if we should twirl
    const desiredTwirl = useTwirl && rawDeg > 180;
    if (desiredTwirl !== twirled) {
      actions.push({ floor, eventType: 'Twirl' });
      twirled = desiredTwirl;
      twirlCount++;
    }

    const storedDeg = Math.max(twirled ? 360 - rawDeg : rawDeg, 0.001);
    rawClickDegs.push(Math.round(storedDeg * 1_000_000) / 1_000_000);

    // Add pause if needed
    if (pauseSeconds > 1e-12) {
      const pauseBeats = pauseSeconds * currentBpm / 60;
      actions.push({
        floor,
        eventType: 'Pause',
        duration: Math.round(pauseBeats * 1_000_000_000) / 1_000_000_000,
        countdownTicks: 0
      });
      pauseCount++;
    }
  }

  // Convert raw click degrees to cumulative angleData
  const angleData: number[] = [0];
  let prevAngle = 0;
  for (let floor = 1; floor < rawClickDegs.length; floor++) {
    const deg = rawClickDegs[floor];
    const curAngle = ((180 + prevAngle - deg) % 360 + 360) % 360;
    angleData.push(Math.round(curAngle * 1_000_000) / 1_000_000);
    prevAngle = curAngle;
  }

  const chart = buildCommonChart(chart4k, firstBpm, manualOffsetMs, 'hybrid_angle', {
    angleData,
    actions
  });

  const encoding = {
    encodingMode: 'hybrid_angle',
    actionsCount: actions.length,
    setspeedCount: speedCount,
    twirlCount,
    pauseCount,
    pathLength: angleData.length,
    firstHitSeconds: timeline[0].timeSeconds,
    lastHitSeconds: timeline[timeline.length - 1].timeSeconds
  };

  return [chart, encoding];
}

import { Chart4K, AdofaiChart, Action, TimelineHit, StyleProfile, EncodingStats } from '../types';
import {
  intervalsFromTimeline,
  buildCommonChart,
  nearestCanonical,
  prettyBpm,
  clampDeg
} from '../utils';
import { collectSourceBpmPalette } from '../timing';

function buildExplicitBpmEvents(
  timeline: TimelineHit[],
  segments: { absSeconds: number; bpm: number }[]
): Map<number, number> {
  const events = new Map<number, number>();
  for (let i = 1; i < segments.length; i++) {
    const segAbsSeconds = segments[i].absSeconds;
    for (let idx = 0; idx < timeline.length; idx++) {
      if (timeline[idx].timeSeconds > segAbsSeconds + 1e-9) {
        events.set(idx, prettyBpm(segments[i].bpm));
        break;
      }
    }
  }
  return events;
}

function chooseSmartDegree(
  dt: number,
  baseBpm: number,
  profile: StyleProfile,
  isChordPiece: boolean
): [number, number, string] {
  const dtMs = dt * 1000;
  const exactDeg = dt * baseBpm * 3;
  if (isChordPiece) {
    return [profile.chordAngleDeg, profile.chordAngleDeg / (3 * dt), 'chord_sim'];
  }
  if (dtMs <= profile.straightDenseThresholdMs) {
    return [180, 180 / (3 * dt), 'dense_straight'];
  }
  if (dtMs >= profile.sparseAngleThresholdMs) {
    const [deg] = nearestCanonical(
      exactDeg,
      profile.canonicalDegrees.filter(d => d !== 180)
    );
    return [deg, deg / (3 * dt), 'sparse_polygon'];
  }
  return [exactDeg, baseBpm, 'exact_source'];
}

export function encodeSmart(
  chart4k: Chart4K,
  timeline: TimelineHit[],
  segments: { absSeconds: number; bpm: number; index: number }[],
  profile: StyleProfile,
  manualOffsetMs: number,
  preserveExplicitBpm: boolean = true
): [AdofaiChart, EncodingStats] {
  const initialBpm = prettyBpm(segments[0].bpm);
  let currentBpm = initialBpm;
  let currentTwirlState = false;
  let prevAbsAngle = 0;
  const actions: Action[] = [];
  const angleData: number[] = [];

  const explicitBpmEvents = preserveExplicitBpm
    ? buildExplicitBpmEvents(timeline, segments)
    : new Map<number, number>();

  const sourcePalette = collectSourceBpmPalette(chart4k);
  const mergedProfile = { ...profile };
  mergedProfile.bpmPalette = [
    ...new Set([
      ...sourcePalette.map(prettyBpm),
      ...profile.bpmPalette.map(prettyBpm)
    ].filter(x => x > 0))
  ];

  const intervals = intervalsFromTimeline(timeline);

  for (let floor = 0; floor < intervals.length; floor++) {
    const dt = intervals[floor];
    const segmentBpm = prettyBpm(timeline[floor].bpm);
    let baseBpm = prettyBpm(explicitBpmEvents.get(floor) ?? segmentBpm);

    // Update BPM if changed
    if (Math.abs(currentBpm - baseBpm) > 2) {
      currentBpm = baseBpm;
      actions.push({
        floor,
        eventType: 'SetSpeed',
        speedType: 'Bpm',
        beatsPerMinute: currentBpm,
        bpmMultiplier: 1
      });
    }

    // Determine if this is a chord simulation piece
    const isChordPiece =
      floor > 0 &&
      timeline[floor].groupId === timeline[floor - 1].groupId &&
      timeline[floor].isChordSimPiece;

    // Choose smart degree
    let [actualDeg, targetBpm] = chooseSmartDegree(
      dt,
      baseBpm,
      mergedProfile,
      isChordPiece
    );

    // Round to BPM palette if close enough
    if (mergedProfile.bpmPalette.length > 0) {
      const [nearestBpm, diff] = nearestCanonical(
        targetBpm,
        mergedProfile.bpmPalette
      );
      const threshold = Math.max(0.4, nearestBpm * 0.03);
      if (diff <= threshold) {
        targetBpm = nearestBpm;
        // Recalculate actual degree with rounded BPM
        const newActualDeg = dt * targetBpm * 3;
        const dtMs = dt * 1000;
        if (isChordPiece) {
          actualDeg = profile.chordAngleDeg;
        } else if (dtMs <= profile.straightDenseThresholdMs) {
          actualDeg = 180;
        } else if (dtMs >= profile.sparseAngleThresholdMs) {
          const [nearestDeg] = nearestCanonical(
            newActualDeg,
            profile.canonicalDegrees
          );
          actualDeg = nearestDeg;
        } else {
          actualDeg = newActualDeg;
        }
      }
    }

    let roundedTargetBpm = prettyBpm(targetBpm);

    // Add SetSpeed action if BPM changed
    if (Math.abs(currentBpm - roundedTargetBpm) > 2) {
      currentBpm = roundedTargetBpm;
      actions.push({
        floor,
        eventType: 'SetSpeed',
        speedType: 'Bpm',
        beatsPerMinute: currentBpm,
        bpmMultiplier: 1
      });
    }

    // Add Twirl if needed
    const desiredTwirl =
      mergedProfile.useTwirl && actualDeg >= mergedProfile.twirlThresholdDeg;
    if (desiredTwirl !== currentTwirlState) {
      currentTwirlState = desiredTwirl;
      actions.push({ floor, eventType: 'Twirl' });
    }

    // Calculate angle
    let baseDeg = currentTwirlState ? 360 - actualDeg : actualDeg;
    baseDeg = clampDeg(baseDeg);
    const absAngle = clampDeg((180 + prevAbsAngle - baseDeg) % 360);
    angleData.push(Math.round(absAngle * 1_000_000) / 1_000_000);
    prevAbsAngle = absAngle;
  }

  const chart = buildCommonChart(chart4k, initialBpm, manualOffsetMs, 'smart', {
    angleData,
    actions
  });

  const encoding: EncodingStats = {
    encodingMode: 'smart',
    actionsCount: actions.length,
    setspeedCount: actions.filter(a => a.eventType === 'SetSpeed').length,
    twirlCount: actions.filter(a => a.eventType === 'Twirl').length,
    pauseCount: 0,
    pathLength: angleData.length,
    firstHitSeconds: timeline[0].timeSeconds,
    lastHitSeconds: timeline[timeline.length - 1].timeSeconds,
    profile: profile.name
  };

  return [chart, encoding];
}

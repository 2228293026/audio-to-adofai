import { Chart4K, AdofaiChart, TimelineHit, EncodingStats } from '../types';
import { buildCommonChart, intervalsFromTimeline, compressBpmActions } from '../utils';

/**
 * Encode using speed-only (straight path) mode
 * Uses pathData = "R"*N and BPM events only
 */
export function encodeSpeedOnly(
  chart4k: Chart4K,
  timeline: TimelineHit[],
  manualOffsetMs: number,
  tag: string = 'speed_only'
): [AdofaiChart, EncodingStats] {
  const intervals = intervalsFromTimeline(timeline);
  const [firstBpm, actions] = compressBpmActions(intervals);

  const chart = buildCommonChart(chart4k, firstBpm, manualOffsetMs, tag, {
    pathData: 'R'.repeat(intervals.length),
    actions
  });

  const encoding = {
    encodingMode: tag,
    actionsCount: actions.length,
    setspeedCount: actions.filter(a => a.eventType === 'SetSpeed').length,
    twirlCount: 0,
    pauseCount: 0,
    pathLength: intervals.length,
    firstHitSeconds: timeline[0].timeSeconds,
    lastHitSeconds: timeline[timeline.length - 1].timeSeconds
  };

  return [chart, encoding];
}

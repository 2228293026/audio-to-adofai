import { TimingSegment, Chart4K, RawEvent, NoteGroup, TimelineHit } from './types';
import { beatTupleToFloat, beatToSeconds, buildTimingSegments } from './timing';

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
 * Extract note groups from chart
 * Groups notes that occur at the same time (microsecond precision)
 */
export function extractNoteGroups(
  chart: Chart4K,
  includeReleases: boolean = false
): [NoteGroup[], TimingSegment[]] {
  const segments = buildTimingSegments(chart);
  const notes = chart.note || [];

  const rawEvents: RawEvent[] = [];

  for (const note of notes) {
    if (!note.hasOwnProperty('column') || !note.hasOwnProperty('beat')) {
      continue;
    }

    const column = Number(note.column);
    const startBeat = beatTupleToFloat(note.beat);
    const [startSeconds, bpm, segIdx] = beatToSeconds(startBeat, segments);

    rawEvents.push({
      beat: startBeat,
      timeSeconds: startSeconds,
      column,
      kind: 'hit',
      bpm,
      segmentIndex: segIdx
    });

    if (includeReleases && note.endbeat) {
      const endBeat = beatTupleToFloat(note.endbeat);
      const [endSeconds, bpm2, segIdx2] = beatToSeconds(endBeat, segments);
      rawEvents.push({
        beat: endBeat,
        timeSeconds: endSeconds,
        column,
        kind: 'release',
        bpm: bpm2,
        segmentIndex: segIdx2
      });
    }
  }

  if (rawEvents.length === 0) {
    throw new Error('No note events found in 4K chart.');
  }

  // Group by microsecond timestamp and kind
  const grouped = new Map<number, RawEvent[]>();
  const microSec = (seconds: number) => Math.round(seconds * 1_000_000);

  for (const ev of rawEvents) {
    const key = microSec(ev.timeSeconds) * 10 + (ev.kind === 'hit' ? 0 : 1);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ev);
  }

  const groups: NoteGroup[] = [];
  let groupId = 0;

  // Convert map to sorted array
  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => a - b);
  const sortedGrouped = new Map(sortedKeys.map(k => [k, grouped.get(k)!]));

  for (const [, bucket] of sortedGrouped) {
    bucket.sort((a, b) => a.column - b.column || a.beat - b.beat);
    const first = bucket[0];
    const columns = bucket.map(ev => ev.column);

    groups.push({
      groupId: groupId++,
      beat: first.beat,
      timeSeconds: first.timeSeconds,
      columns,
      kind: first.kind,
      bpm: first.bpm,
      segmentIndex: first.segmentIndex,
      chordSize: columns.length
    });
  }

  return [groups, segments];
}

/**
 * Build timeline from note groups with chord handling
 *
 * @param groups - Note groups to convert
 * @param chordMode - How to handle chords: 'merge', 'split', or 'force_single'
 * @param splitSpacingMs - Minimum spacing between split chord pieces in milliseconds
 * @param simulateChordsWithAngle - Whether to expand chords for angle simulation
 *
 * @returns Tuple of [timeline, stats]
 */
export function buildTimeline(
  groups: NoteGroup[],
  chordMode: 'merge' | 'split' | 'force_single',
  splitSpacingMs: number = 12,
  simulateChordsWithAngle: boolean = true
): [TimelineHit[], { groupCount: number; timelineHitCount: number; chordGroups: number; maxGroupSize: number; ignoredChordNotes: number }] {
  if (chordMode !== 'merge' && chordMode !== 'split' && chordMode !== 'force_single') {
    throw new Error("chordMode must be 'merge', 'split', or 'force_single'");
  }

  const splitSpacingSec = Math.max(0.1, splitSpacingMs) / 1000;
  const hits: TimelineHit[] = [];
  let chordGroups = 0;
  let maxGroupSize = 0;
  let ignoredChordNotes = 0;

  for (const group of groups) {
    maxGroupSize = Math.max(maxGroupSize, group.chordSize);
    if (group.chordSize >= 2) {
      chordGroups += 1;
    }

    // Force single: ignore all but the first note in a chord
    if (chordMode === 'force_single') {
      ignoredChordNotes += Math.max(0, group.chordSize - 1);
      hits.push({
        floor: hits.length,
        timeSeconds: group.timeSeconds,
        columns: [group.columns[0]],
        chordSize: 1,
        groupId: group.groupId,
        bpm: group.bpm,
        segmentIndex: group.segmentIndex,
        kind: group.kind,
        chordPieceIndex: 0,
        chordPieceTotal: 1,
        isChordSimPiece: false
      });
      continue;
    }

    // Determine if we should expand this chord
    let expand = false;
    if (chordMode === 'split') {
      expand = true;
    } else if (group.chordSize >= 2 && simulateChordsWithAngle) {
      expand = true;
    }

    // Merge mode - keep chord as one hit
    if (!expand) {
      hits.push({
        floor: hits.length,
        timeSeconds: group.timeSeconds,
        columns: group.columns,
        chordSize: group.chordSize,
        groupId: group.groupId,
        bpm: group.bpm,
        segmentIndex: group.segmentIndex,
        kind: group.kind,
        chordPieceIndex: 0,
        chordPieceTotal: 1,
        isChordSimPiece: false
      });
      continue;
    }

    // Split mode or chord simulation - expand into sequential pieces
    const pieceTotal = Math.max(1, group.chordSize);
    for (let pieceIdx = 0; pieceIdx < pieceTotal; pieceIdx++) {
      hits.push({
        floor: hits.length,
        timeSeconds: group.timeSeconds + pieceIdx * splitSpacingSec,
        columns: group.columns,
        chordSize: group.chordSize,
        groupId: group.groupId,
        bpm: group.bpm,
        segmentIndex: group.segmentIndex,
        kind: group.kind,
        chordPieceIndex: pieceIdx,
        chordPieceTotal: pieceTotal,
        isChordSimPiece: group.chordSize >= 2 && simulateChordsWithAngle
      });
    }
  }

  // Sort by time, then groupId, then chordPieceIndex
  hits.sort((a, b) => {
    if (Math.abs(a.timeSeconds - b.timeSeconds) > 1e-9) {
      return a.timeSeconds - b.timeSeconds;
    }
    if (a.groupId !== b.groupId) {
      return a.groupId - b.groupId;
    }
    return a.chordPieceIndex - b.chordPieceIndex;
  });

  // Normalize timestamps to ensure strict ordering
  const normalized: TimelineHit[] = [];
  let prevTime = -1;
  for (let idx = 0; idx < hits.length; idx++) {
    let t = hits[idx].timeSeconds;
    if (t <= prevTime) {
      t = prevTime + 1e-6;
    }
    prevTime = t;

    normalized.push({
      ...hits[idx],
      floor: idx,
      timeSeconds: t
    });
  }

  const stats = {
    groupCount: groups.length,
    timelineHitCount: normalized.length,
    chordGroups,
    maxGroupSize,
    ignoredChordNotes
  };

  return [normalized, stats];
}

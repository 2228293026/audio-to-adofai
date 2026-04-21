#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
4K -> ADOFAI 整合版转换器

整合来源思路：
- 基础直线版：pathData + SetSpeed，优先保证时间轴准确
- 角度混合版：hybrid_angle，优先用 angleData 表达节奏
- 智能版：smart，加入显式 BPM 保留、Twirl、和弦仿真、手动 offset、风格模型
- 单押特化：force_single，所有同一时刻的 2K/3K/4K 统一压成 1 键

主要功能：
1. 强制单押：忽略 2K/3K/4K，同一时刻统一转为 1 键
2. 强行直线：只用 BPM 速度事件（pathData = "R" * N）
3. 混合角度：优先 angleData，必要时插入 SetSpeed / Pause / Twirl
4. 智能排砖：密集区偏直线，稀疏区偏多边形，支持显式 BPM 保留
5. 可选长条尾判转点击
6. 可选和弦 merge / split / force_single
7. 可选双押仿真角度
8. 可选风格模型 JSON
9. GUI + CLI 双入口
"""

from __future__ import annotations

import json
import math
import os
import sys
import traceback
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import tkinter as tk
from tkinter import filedialog, messagebox, ttk, Toplevel, StringVar


# -----------------------------
# 数据类
# -----------------------------
@dataclass(frozen=True)
class TimingSegment:
    beat: float
    bpm: float
    abs_seconds: float
    index: int


@dataclass(frozen=True)
class RawEvent:
    beat: float
    time_seconds: float
    column: int
    kind: str
    bpm: float
    segment_index: int


@dataclass(frozen=True)
class NoteGroup:
    group_id: int
    beat: float
    time_seconds: float
    columns: Tuple[int, ...]
    kind: str
    bpm: float
    segment_index: int

    @property
    def chord_size(self) -> int:
        return len(self.columns)


@dataclass(frozen=True)
class TimelineHit:
    floor: int
    time_seconds: float
    columns: Tuple[int, ...]
    chord_size: int
    group_id: int
    bpm: float
    segment_index: int
    kind: str
    chord_piece_index: int = 0
    chord_piece_total: int = 1
    is_chord_sim_piece: bool = False


@dataclass
class StyleProfile:
    name: str = "builtin-default"
    straight_dense_threshold_ms: float = 140.0
    sparse_angle_threshold_ms: float = 190.0
    canonical_degrees: List[float] = field(default_factory=lambda: [180.0, 120.0, 90.0, 60.0, 45.0, 135.0])
    chord_angle_deg: float = 22.5
    twirl_threshold_deg: float = 202.5
    twirl_event_penalty: float = 0.30
    speed_event_penalty: float = 0.42
    use_twirl: bool = True
    bpm_palette: List[float] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StyleProfile":
        profile = cls()
        for name in (
            "name",
            "straight_dense_threshold_ms",
            "sparse_angle_threshold_ms",
            "chord_angle_deg",
            "twirl_threshold_deg",
            "twirl_event_penalty",
            "speed_event_penalty",
            "use_twirl",
        ):
            if name in data:
                setattr(profile, name, data[name])
        if isinstance(data.get("canonical_degrees"), list):
            profile.canonical_degrees = [float(x) for x in data["canonical_degrees"] if float(x) > 0]
        if isinstance(data.get("bpm_palette"), list):
            profile.bpm_palette = [float(x) for x in data["bpm_palette"] if float(x) > 0]
        return profile


# -----------------------------
# 基础工具
# -----------------------------
def load_json_file(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def save_json_file(path: str, data: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8-sig") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def beat_tuple_to_float(beat: Iterable[Any]) -> float:
    vals = list(beat)
    if len(vals) != 3:
        raise ValueError(f"非法 beat 结构：{beat!r}")
    whole, num, den = vals
    den = float(den)
    if den == 0:
        raise ValueError(f"beat 分母不能为 0：{beat!r}")
    return float(whole) + float(num) / den


def micro_key(seconds: float) -> int:
    return int(round(seconds * 1_000_000))


def pretty_bpm(bpm: float) -> float:
    return round(float(bpm), 6)


def clamp_deg(value: float) -> float:
    value = float(value) % 360.0
    if math.isclose(value, 0.0, abs_tol=1e-12):
        return 0.0
    return value


def load_style_profile(path: Optional[str]) -> StyleProfile:
    if not path:
        return StyleProfile()
    return StyleProfile.from_dict(load_json_file(path))


# -----------------------------
# 4K 时轴重建
# -----------------------------
def build_timing_segments(chart_4k: Dict[str, Any]) -> List[TimingSegment]:
    time_events = chart_4k.get("time") or []
    if not time_events:
        song_bpm = ((((chart_4k.get("meta") or {}).get("song") or {}).get("bpm")) or 120.0)
        return [TimingSegment(beat=0.0, bpm=float(song_bpm), abs_seconds=0.0, index=0)]

    sorted_events = sorted(time_events, key=lambda e: beat_tuple_to_float(e["beat"]))
    segments: List[TimingSegment] = []
    prev_beat: Optional[float] = None
    prev_bpm: Optional[float] = None
    current_abs_seconds = 0.0

    for idx, event in enumerate(sorted_events):
        beat = beat_tuple_to_float(event["beat"])
        bpm = float(event["bpm"])
        delay_seconds = float(event.get("delay", 0.0)) / 1000.0
        if idx == 0:
            current_abs_seconds = delay_seconds
        else:
            assert prev_beat is not None and prev_bpm is not None
            current_abs_seconds += (beat - prev_beat) * 60.0 / prev_bpm + delay_seconds
        segments.append(TimingSegment(beat=beat, bpm=bpm, abs_seconds=current_abs_seconds, index=idx))
        prev_beat = beat
        prev_bpm = bpm

    return segments


def locate_segment(beat_value: float, segments: Sequence[TimingSegment]) -> TimingSegment:
    current = segments[0]
    for nxt in segments[1:]:
        if beat_value >= nxt.beat:
            current = nxt
        else:
            break
    return current


def beat_to_seconds(beat_value: float, segments: Sequence[TimingSegment]) -> Tuple[float, float, int]:
    seg = locate_segment(beat_value, segments)
    seconds = seg.abs_seconds + (beat_value - seg.beat) * 60.0 / seg.bpm
    return seconds, seg.bpm, seg.index


def collect_source_bpm_palette(chart_4k: Dict[str, Any]) -> List[float]:
    seen = set()
    palette: List[float] = []
    for seg in build_timing_segments(chart_4k):
        val = pretty_bpm(seg.bpm)
        if val > 0 and val not in seen:
            seen.add(val)
            palette.append(val)
    song_bpm = ((((chart_4k.get("meta") or {}).get("song") or {}).get("bpm")) or 0)
    try:
        val = pretty_bpm(song_bpm)
        if val > 0 and val not in seen:
            seen.add(val)
            palette.append(val)
    except Exception:
        pass
    return palette


def extract_note_groups(chart_4k: Dict[str, Any], include_releases: bool = False) -> Tuple[List[NoteGroup], List[TimingSegment]]:
    segments = build_timing_segments(chart_4k)
    notes = chart_4k.get("note") or []
    raw_events: List[RawEvent] = []

    for note in notes:
        if "column" not in note or "beat" not in note:
            continue
        column = int(note["column"])
        start_beat = beat_tuple_to_float(note["beat"])
        start_seconds, bpm, seg_idx = beat_to_seconds(start_beat, segments)
        raw_events.append(RawEvent(start_beat, start_seconds, column, "hit", bpm, seg_idx))

        if include_releases and "endbeat" in note:
            end_beat = beat_tuple_to_float(note["endbeat"])
            end_seconds, bpm2, seg_idx2 = beat_to_seconds(end_beat, segments)
            raw_events.append(RawEvent(end_beat, end_seconds, column, "release", bpm2, seg_idx2))

    if not raw_events:
        raise ValueError("没有在 4K 文件中找到可转换的 note 事件。")

    grouped: Dict[Tuple[int, str], List[RawEvent]] = {}
    for ev in raw_events:
        grouped.setdefault((micro_key(ev.time_seconds), ev.kind), []).append(ev)

    groups: List[NoteGroup] = []
    for gid, key in enumerate(sorted(grouped.keys())):
        bucket = sorted(grouped[key], key=lambda e: (e.column, e.beat))
        ev0 = bucket[0]
        columns = tuple(ev.column for ev in bucket)
        groups.append(
            NoteGroup(
                group_id=gid,
                beat=ev0.beat,
                time_seconds=ev0.time_seconds,
                columns=columns,
                kind=ev0.kind,
                bpm=ev0.bpm,
                segment_index=ev0.segment_index,
            )
        )
    return groups, segments


# -----------------------------
# 时间轴整理
# -----------------------------
def build_timeline(
    groups: Sequence[NoteGroup],
    chord_mode: str = "merge",
    split_spacing_ms: float = 12.0,
    simulate_chords_with_angle: bool = True,
) -> Tuple[List[TimelineHit], Dict[str, int]]:
    if chord_mode not in {"merge", "split", "force_single"}:
        raise ValueError("chord_mode 只能是 merge / split / force_single")

    split_spacing_sec = max(0.1, float(split_spacing_ms)) / 1000.0
    hits: List[TimelineHit] = []
    chord_groups = 0
    max_group_size = 0
    ignored_chord_notes = 0

    for group in groups:
        max_group_size = max(max_group_size, group.chord_size)
        if group.chord_size >= 2:
            chord_groups += 1

        if chord_mode == "force_single":
            ignored_chord_notes += max(0, group.chord_size - 1)
            hits.append(
                TimelineHit(
                    floor=len(hits),
                    time_seconds=group.time_seconds,
                    columns=(group.columns[0],),
                    chord_size=1,
                    group_id=group.group_id,
                    bpm=group.bpm,
                    segment_index=group.segment_index,
                    kind=group.kind,
                )
            )
            continue

        expand = False
        if chord_mode == "split":
            expand = True
        elif group.chord_size >= 2 and simulate_chords_with_angle:
            expand = True

        if not expand:
            hits.append(
                TimelineHit(
                    floor=len(hits),
                    time_seconds=group.time_seconds,
                    columns=group.columns,
                    chord_size=group.chord_size,
                    group_id=group.group_id,
                    bpm=group.bpm,
                    segment_index=group.segment_index,
                    kind=group.kind,
                )
            )
            continue

        piece_total = max(1, group.chord_size)
        for piece_idx in range(piece_total):
            hits.append(
                TimelineHit(
                    floor=len(hits),
                    time_seconds=group.time_seconds + piece_idx * split_spacing_sec,
                    columns=group.columns,
                    chord_size=group.chord_size,
                    group_id=group.group_id,
                    bpm=group.bpm,
                    segment_index=group.segment_index,
                    kind=group.kind,
                    chord_piece_index=piece_idx,
                    chord_piece_total=piece_total,
                    is_chord_sim_piece=(group.chord_size >= 2 and simulate_chords_with_angle),
                )
            )

    hits.sort(key=lambda x: (x.time_seconds, x.group_id, x.chord_piece_index))
    normalized: List[TimelineHit] = []
    prev_time = -1.0
    for idx, hit in enumerate(hits):
        t = hit.time_seconds
        if t <= prev_time:
            t = prev_time + 1e-6
        prev_time = t
        normalized.append(
            TimelineHit(
                floor=idx,
                time_seconds=t,
                columns=hit.columns,
                chord_size=hit.chord_size,
                group_id=hit.group_id,
                bpm=hit.bpm,
                segment_index=hit.segment_index,
                kind=hit.kind,
                chord_piece_index=hit.chord_piece_index,
                chord_piece_total=hit.chord_piece_total,
                is_chord_sim_piece=hit.is_chord_sim_piece,
            )
        )

    stats = {
        "group_count": len(groups),
        "timeline_hit_count": len(normalized),
        "chord_groups": chord_groups,
        "max_group_size": max_group_size,
        "ignored_chord_notes": ignored_chord_notes,
    }
    return normalized, stats


# -----------------------------
# 编码模式 1：强行直线 / 基础直线
# -----------------------------
def intervals_from_timeline(timeline: Sequence[TimelineHit]) -> List[float]:
    if not timeline:
        raise ValueError("timeline 为空")
    intervals = [max(timeline[0].time_seconds, 1e-9)]
    for i in range(1, len(timeline)):
        intervals.append(max(timeline[i].time_seconds - timeline[i - 1].time_seconds, 1e-9))
    return intervals


def compress_bpm_actions(intervals: Sequence[float]) -> Tuple[float, List[Dict[str, Any]]]:
    bpms = [60.0 / dt for dt in intervals]
    first_bpm = round(bpms[0], 9)
    actions: List[Dict[str, Any]] = []
    prev_bpm = first_bpm
    for floor, bpm in enumerate(bpms[1:], start=1):
        bpm_r = round(bpm, 9)
        if bpm_r != prev_bpm:
            actions.append(
                {
                    "floor": floor,
                    "eventType": "SetSpeed",
                    "speedType": "Bpm",
                    "beatsPerMinute": bpm_r,
                    "bpmMultiplier": 1,
                }
            )
            prev_bpm = bpm_r
    return first_bpm, actions


def encode_speed_only(
    chart_4k: Dict[str, Any],
    timeline: Sequence[TimelineHit],
    manual_offset_ms: float,
    tag: str = "speed_only",
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    intervals = intervals_from_timeline(timeline)
    first_bpm, actions = compress_bpm_actions(intervals)
    chart = build_common_chart(
        chart_4k=chart_4k,
        settings_bpm=first_bpm,
        manual_offset_ms=manual_offset_ms,
        level_tag=tag,
        extra={"pathData": "R" * len(intervals), "actions": actions},
    )
    stats = {
        "encoding_mode": tag,
        "actions_count": len(actions),
        "setspeed_count": len(actions),
        "twirl_count": 0,
        "pause_count": 0,
        "path_length": len(chart["pathData"]),
        "first_hit_seconds": timeline[0].time_seconds,
        "last_hit_seconds": timeline[-1].time_seconds,
    }
    return chart, stats


# -----------------------------
# 编码模式 2：混合角度
# -----------------------------
def choose_working_bpm(
    dt: float,
    current_bpm: float,
    bpm_palette: Sequence[float],
    angle_target: float = 120.0,
    angle_low: float = 45.0,
    angle_high: float = 180.0,
    min_bpm: float = 30.0,
    max_bpm: float = 360.0,
) -> float:
    if dt <= 0:
        return max(min(current_bpm, max_bpm), min_bpm)

    candidates: List[float] = []
    seen = set()

    def add(x: float) -> None:
        xr = round(float(x), 9)
        if xr <= 0:
            return
        xr = max(min_bpm, min(max_bpm, xr))
        if xr not in seen:
            seen.add(xr)
            candidates.append(xr)

    add(current_bpm)
    for bpm in bpm_palette:
        add(bpm)
    add(angle_target / (3.0 * dt))
    add(angle_low / (3.0 * dt))
    add(angle_high / (3.0 * dt))
    add(180.0 / (3.0 * dt))

    def score(bpm: float) -> Tuple[int, int, float, float]:
        deg = dt * 3.0 * bpm
        within = 1 if angle_low <= deg <= angle_high else 0
        within_hard = 1 if 0.0 < deg <= 360.0 else 0
        return (-within_hard, -within, abs(deg - angle_target), abs(bpm - current_bpm))

    return min(candidates, key=score)


def encode_hybrid_angle(
    chart_4k: Dict[str, Any],
    timeline: Sequence[TimelineHit],
    manual_offset_ms: float,
    use_twirl: bool = True,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    intervals = intervals_from_timeline(timeline)
    bpm_palette = collect_source_bpm_palette(chart_4k)
    first_bpm = round(60.0 / intervals[0], 9)
    actions: List[Dict[str, Any]] = []
    current_bpm = first_bpm
    twirled = False
    twirl_count = 0
    pause_count = 0
    speed_count = 0
    raw_click_degs: List[float] = [180.0]

    for floor in range(1, len(intervals)):
        dt = intervals[floor]
        bpm = choose_working_bpm(dt, current_bpm, bpm_palette)
        if abs(bpm - current_bpm) > 1e-9:
            actions.append(
                {
                    "floor": floor,
                    "eventType": "SetSpeed",
                    "speedType": "Bpm",
                    "beatsPerMinute": round(bpm, 9),
                    "bpmMultiplier": 1,
                }
            )
            current_bpm = bpm
            speed_count += 1

        raw_deg = dt * 3.0 * current_bpm
        pause_seconds = 0.0
        if raw_deg > 360.0:
            pause_seconds = dt - 120.0 / current_bpm
            raw_deg = 360.0
        elif raw_deg <= 0:
            raw_deg = 0.001

        desired_twirl = bool(use_twirl and raw_deg > 180.0)
        if desired_twirl != twirled:
            actions.append({"floor": floor, "eventType": "Twirl"})
            twirled = desired_twirl
            twirl_count += 1

        stored_deg = 360.0 - raw_deg if twirled else raw_deg
        raw_click_degs.append(round(max(stored_deg, 0.001), 9))

        if pause_seconds > 1e-12:
            pause_beats = pause_seconds * current_bpm / 60.0
            actions.append(
                {
                    "floor": floor,
                    "eventType": "Pause",
                    "duration": round(pause_beats, 9),
                    "countdownTicks": 0,
                }
            )
            pause_count += 1

    angle_data: List[float] = [0.0]
    prev_angle = 0.0
    for floor in range(1, len(raw_click_degs)):
        deg = raw_click_degs[floor]
        cur_angle = (180.0 + prev_angle - deg) % 360.0
        angle_data.append(round(cur_angle, 9))
        prev_angle = cur_angle

    chart = build_common_chart(
        chart_4k=chart_4k,
        settings_bpm=first_bpm,
        manual_offset_ms=manual_offset_ms,
        level_tag="hybrid_angle",
        extra={"angleData": angle_data, "actions": actions},
    )
    stats = {
        "encoding_mode": "hybrid_angle",
        "actions_count": len(actions),
        "setspeed_count": speed_count,
        "twirl_count": twirl_count,
        "pause_count": pause_count,
        "path_length": len(angle_data),
        "first_hit_seconds": timeline[0].time_seconds,
        "last_hit_seconds": timeline[-1].time_seconds,
    }
    return chart, stats


# -----------------------------
# 编码模式 3：智能排砖
# -----------------------------
def nearest_canonical(value: float, palette: Sequence[float]) -> Tuple[float, float]:
    best = None
    best_diff = float("inf")
    for x in palette:
        diff = abs(float(value) - float(x))
        if diff < best_diff:
            best_diff = diff
            best = float(x)
    return (best if best is not None else float(value), best_diff)


def build_explicit_bpm_events(timeline: Sequence[TimelineHit], segments: Sequence[TimingSegment]) -> Dict[int, float]:
    events: Dict[int, float] = {}
    for seg in segments[1:]:
        floor = None
        for idx, hit in enumerate(timeline):
            if hit.time_seconds > seg.abs_seconds + 1e-9:
                floor = idx
                break
        if floor is not None:
            events[floor] = pretty_bpm(seg.bpm)
    return events


def choose_smart_degree(
    dt: float,
    base_bpm: float,
    profile: StyleProfile,
    is_chord_piece: bool,
) -> Tuple[float, float, str]:
    dt_ms = dt * 1000.0
    exact_deg = dt * base_bpm * 3.0

    if is_chord_piece:
        target_deg = float(profile.chord_angle_deg)
        return target_deg, target_deg / max(3.0 * dt, 1e-9), "chord_sim"

    if dt_ms <= profile.straight_dense_threshold_ms:
        target_deg = 180.0
        return target_deg, target_deg / max(3.0 * dt, 1e-9), "dense_straight"

    if dt_ms >= profile.sparse_angle_threshold_ms:
        deg, _ = nearest_canonical(exact_deg, [x for x in profile.canonical_degrees if x != 180.0] or profile.canonical_degrees)
        return deg, deg / max(3.0 * dt, 1e-9), "sparse_polygon"

    return exact_deg, base_bpm, "exact_source"


def encode_smart(
    chart_4k: Dict[str, Any],
    timeline: Sequence[TimelineHit],
    segments: Sequence[TimingSegment],
    profile: StyleProfile,
    manual_offset_ms: float,
    preserve_explicit_bpm: bool = True,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    initial_bpm = pretty_bpm(segments[0].bpm)
    current_bpm = initial_bpm
    current_twirl_state = False
    prev_abs_angle = 0.0
    actions: List[Dict[str, Any]] = []
    angle_data: List[float] = []

    explicit_bpm_events = build_explicit_bpm_events(timeline, segments) if preserve_explicit_bpm else {}
    source_palette = collect_source_bpm_palette(chart_4k)
    merged_profile = StyleProfile.from_dict({**profile.__dict__})
    merged_profile.bpm_palette = list(dict.fromkeys([pretty_bpm(x) for x in source_palette + profile.bpm_palette if x > 0]))

    intervals = intervals_from_timeline(timeline)

    for floor, dt in enumerate(intervals):
        segment_bpm = pretty_bpm(timeline[floor].bpm)
        base_bpm = pretty_bpm(explicit_bpm_events.get(floor, segment_bpm))
        if not math.isclose(current_bpm, base_bpm, abs_tol=1e-9, rel_tol=1e-9):
            current_bpm = base_bpm
            actions.append(
                {
                    "floor": floor,
                    "eventType": "SetSpeed",
                    "speedType": "Bpm",
                    "beatsPerMinute": current_bpm,
                    "bpmMultiplier": 1,
                }
            )

        is_chord_piece = floor > 0 and timeline[floor].group_id == timeline[floor - 1].group_id and timeline[floor].is_chord_sim_piece
        actual_deg, target_bpm, _reason = choose_smart_degree(dt, base_bpm, merged_profile, is_chord_piece)

        if merged_profile.bpm_palette:
            nearest_bpm, diff = nearest_canonical(target_bpm, merged_profile.bpm_palette)
            if diff <= max(0.4, nearest_bpm * 0.03):
                target_bpm = nearest_bpm
                actual_deg = dt * target_bpm * 3.0

        if not math.isclose(current_bpm, target_bpm, abs_tol=1e-9, rel_tol=1e-9):
            current_bpm = pretty_bpm(target_bpm)
            actions.append(
                {
                    "floor": floor,
                    "eventType": "SetSpeed",
                    "speedType": "Bpm",
                    "beatsPerMinute": current_bpm,
                    "bpmMultiplier": 1,
                }
            )

        desired_twirl = bool(merged_profile.use_twirl and actual_deg >= merged_profile.twirl_threshold_deg)
        if desired_twirl != current_twirl_state:
            current_twirl_state = desired_twirl
            actions.append({"floor": floor, "eventType": "Twirl"})

        base_deg = actual_deg if not current_twirl_state else 360.0 - actual_deg
        base_deg = clamp_deg(base_deg)
        abs_angle = clamp_deg((180.0 + prev_abs_angle - base_deg) % 360.0)
        angle_data.append(round(abs_angle, 6))
        prev_abs_angle = abs_angle

    chart = build_common_chart(
        chart_4k=chart_4k,
        settings_bpm=initial_bpm,
        manual_offset_ms=manual_offset_ms,
        level_tag="smart",
        extra={"angleData": angle_data, "actions": actions},
    )
    stats = {
        "encoding_mode": "smart",
        "actions_count": len(actions),
        "setspeed_count": sum(1 for a in actions if a.get("eventType") == "SetSpeed"),
        "twirl_count": sum(1 for a in actions if a.get("eventType") == "Twirl"),
        "pause_count": 0,
        "path_length": len(angle_data),
        "first_hit_seconds": timeline[0].time_seconds,
        "last_hit_seconds": timeline[-1].time_seconds,
        "profile": profile.name,
    }
    return chart, stats


# -----------------------------
# 公共建谱
# -----------------------------
def build_common_chart(
    chart_4k: Dict[str, Any],
    settings_bpm: float,
    manual_offset_ms: float,
    level_tag: str,
    extra: Dict[str, Any],
) -> Dict[str, Any]:
    src_meta = chart_4k.get("meta") or {}
    src_song = src_meta.get("song") or {}
    title = src_song.get("title") or "Unknown"
    artist = src_song.get("artist") or "Unknown"
    song_file = src_song.get("file") or ""

    chart = {
        "settings": {
            "version": 4,
            "artist": artist,
            "specialArtistType": "None",
            "artistPermission": "",
            "song": title,
            "author": "4K to ADOFAI Integrated Converter",
            "separateCountdownTime": "Disabled",
            "previewImage": "",
            "previewIcon": "",
            "previewIconColor": "003f52",
            "previewSongStart": 0,
            "previewSongDuration": 10,
            "seizureWarning": "Disabled",
            "levelDesc": f"Converted from 4K. mode={level_tag}.",
            "levelTags": f"converted,4k,integrated,{level_tag}",
            "artistLinks": "",
            "difficulty": 1,
            "songFilename": song_file,
            "bpm": settings_bpm,
            "volume": 100,
            "offset": round(float(manual_offset_ms), 3),
            "pitch": 100,
            "hitsound": "Kick",
            "hitsoundVolume": 100,
            "countdownTicks": 0,
            "trackColorType": "Single",
            "trackColor": "debb7b",
            "secondaryTrackColor": "ffffff",
            "trackColorAnimDuration": 2,
            "trackColorPulse": "None",
            "trackPulseLength": 10,
            "trackStyle": "Standard",
            "trackAnimation": "None",
            "beatsAhead": 3,
            "trackDisappearAnimation": "None",
            "beatsBehind": 4,
            "backgroundColor": "000000",
            "showDefaultBGIfNoImage": "Enabled",
            "bgImage": "",
            "bgImageColor": "ffffff",
            "parallax": [100, 100],
            "bgDisplayMode": "FitToScreen",
            "lockRot": "Disabled",
            "loopBG": "Disabled",
            "unscaledSize": 100,
            "relativeTo": "Player",
            "position": [0, 0],
            "rotation": 0,
            "zoom": 100,
            "bgVideo": "",
            "loopVideo": "Disabled",
            "vidOffset": 0,
            "floorIconOutlines": "Disabled",
            "stickToFloors": "Disabled",
            "planetEase": "Linear",
            "planetEaseParts": 1,
            "legacyFlash": False,
        },
        "actions": extra.get("actions", []),
        "decorations": [],
    }
    if "pathData" in extra:
        chart["pathData"] = extra["pathData"]
    if "angleData" in extra:
        chart["angleData"] = extra["angleData"]
    return chart


# -----------------------------
# 对外入口
# -----------------------------
def default_output_path(input_path: str) -> str:
    base, _ = os.path.splitext(input_path)
    return base + "_integrated.adofai"


def convert_4k_to_adofai(
    input_path: str,
    output_path: str,
    encoding_mode: str = "smart",
    chord_mode: str = "merge",
    include_releases: bool = False,
    split_spacing_ms: float = 12.0,
    manual_offset_ms: float = 0.0,
    use_twirl: bool = True,
    simulate_chords_with_angle: bool = True,
    preserve_explicit_bpm: bool = True,
    model_path: Optional[str] = None,
) -> Dict[str, Any]:
    if encoding_mode not in {"speed_only", "force_straight", "hybrid_angle", "smart"}:
        raise ValueError("encoding_mode 只能是 speed_only / force_straight / hybrid_angle / smart")

    chart_4k = load_json_file(input_path)
    profile = load_style_profile(model_path)
    groups, segments = extract_note_groups(chart_4k, include_releases=include_releases)
    timeline, timeline_stats = build_timeline(
        groups,
        chord_mode=chord_mode,
        split_spacing_ms=split_spacing_ms,
        simulate_chords_with_angle=simulate_chords_with_angle,
    )

    actual_mode = "speed_only" if encoding_mode == "force_straight" else encoding_mode

    if actual_mode == "speed_only":
        chart, encode_stats = encode_speed_only(chart_4k, timeline, manual_offset_ms, tag=encoding_mode)
    elif actual_mode == "hybrid_angle":
        chart, encode_stats = encode_hybrid_angle(chart_4k, timeline, manual_offset_ms, use_twirl=use_twirl)
    else:
        profile.use_twirl = bool(use_twirl)
        chart, encode_stats = encode_smart(
            chart_4k,
            timeline,
            segments,
            profile,
            manual_offset_ms,
            preserve_explicit_bpm=preserve_explicit_bpm,
        )

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    save_json_file(output_path, chart)

    return {
        "input_path": input_path,
        "output_path": output_path,
        "encoding_mode": encoding_mode,
        "chord_mode": chord_mode,
        "include_releases": include_releases,
        "split_spacing_ms": split_spacing_ms,
        "manual_offset_ms": manual_offset_ms,
        "use_twirl": use_twirl,
        "simulate_chords_with_angle": simulate_chords_with_angle,
        "preserve_explicit_bpm": preserve_explicit_bpm,
        "profile": profile.name,
        "timeline": timeline_stats,
        "encoding": encode_stats,
    }


# -----------------------------
# 核对码窗口
# -----------------------------
class AuthWindow:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("访问验证")
        self.root.geometry("500x300")
        self.root.resizable(False, False)
        
        # 移除窗口装饰，使窗口无法移动
        self.root.overrideredirect(True)
        
        # 设置窗口始终在最前
        self.root.attributes("-topmost", True)
        
        # 中心窗口
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - 500) // 2
        y = (screen_height - 300) // 2
        self.root.geometry(f"500x300+{x}+{y}")
        
        # 主框架
        main_frame = ttk.Frame(self.root, padding=20)
        main_frame.pack(fill="both", expand=True)
        
        # 标题
        title_label = ttk.Label(main_frame, text="4K -> ADOFAI 转换器", font=("Arial", 16, "bold"))
        title_label.pack(pady=(0, 20))
        
        # 公告文本
        announcement_text = """主要公告：
本文本仅用于娱乐用途，不可用于制谱方面。
铺面转换一般为4k转到.adofai文件，k以上的不太确定，
适用于malody中的4k文件（需将.mc文件转换为.txt文件进行转换）。
风格模型不建议使用，如果你需要的话。"""
        
        announcement_frame = ttk.LabelFrame(main_frame, text="公告", padding=10)
        announcement_frame.pack(fill="x", pady=(0, 20))
        
        announcement_label = ttk.Label(announcement_frame, text=announcement_text, 
                                      wraplength=450, justify="left", foreground="red")
        announcement_label.pack()
        
        # 核对码输入
        auth_frame = ttk.Frame(main_frame)
        auth_frame.pack(fill="x", pady=(0, 20))
        
        ttk.Label(auth_frame, text="请输入核对码：", font=("Arial", 11)).pack(side="left", padx=(0, 10))
        self.auth_code_var = StringVar()
        auth_entry = ttk.Entry(auth_frame, textvariable=self.auth_code_var, show="*", width=20)
        auth_entry.pack(side="left")
        auth_entry.bind("<Return>", lambda e: self.check_auth())
        
        # 按钮
        button_frame = ttk.Frame(main_frame)
        button_frame.pack()
        
        ttk.Button(button_frame, text="验证", command=self.check_auth, width=15).pack(side="left", padx=5)
        ttk.Button(button_frame, text="退出", command=self.root.quit, width=15).pack(side="left", padx=5)
        
        # 提示
        hint_label = ttk.Label(main_frame, text="核对码: sensei_4040", foreground="gray", font=("Arial", 9))
        hint_label.pack(pady=(10, 0))
        
        # 绑定 ESC 键退出
        self.root.bind("<Escape>", lambda e: self.root.quit())
        
        # 焦点设置
        auth_entry.focus_set()
        
        self.success = False
    
    def check_auth(self) -> None:
        code = self.auth_code_var.get().strip()
        if code == "sensei_4040":
            self.success = True
            self.root.quit()
        else:
            messagebox.showerror("错误", "核对码错误！")
            self.auth_code_var.set("")


# -----------------------------
# 转换器GUI
# -----------------------------
class ConverterApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("4K -> ADOFAI 整合版转换器")
        self.root.geometry("1000x800")
        
        # 主框架
        main_frame = ttk.Frame(self.root, padding=10)
        main_frame.pack(fill="both", expand=True)
        
        # 公告栏
        announcement_frame = ttk.LabelFrame(main_frame, text="功能说明与公告", padding=10)
        announcement_frame.pack(fill="x", pady=(0, 10))
        
        announcement_text = """
主要公告：
本文本仅用于娱乐用途，不可用于制谱方面。
铺面转换一般为4k转到.adofai文件，k以上的不太确定，
适用于malody中的4k文件（需将.mc文件转换为.txt文件进行转换）。
风格模型不建议使用，如果你需要的话。

----------------------------------------
编码模式说明：
• smart (智能排砖)：动态选择最合适的表现方式，密集区用直线，稀疏区用多边形角度
• hybrid_angle (混合角度)：优先用角度数据表达节奏，必要时插入速度/暂停/Twirl事件
• speed_only/force_straight (强行直线)：用直线路径+BPM事件，时间轴最准确

和弦模式说明：
• merge (合并)：将同一时刻按下的所有音符合并为ADOFAI中的一个"键"
• split (拆分)：将和弦拆分成多个连续的按键
• force_single (强制单押)：忽略所有多键和弦，只转换第一个音符
----------------------------------------
        """
        
        announcement_label = ttk.Label(announcement_frame, text=announcement_text, 
                                      wraplength=950, justify="left", font=("宋体", 10))
        announcement_label.pack()
        
        # 文件选择框架
        file_frame = ttk.LabelFrame(main_frame, text="文件选择", padding=10)
        file_frame.pack(fill="x", pady=(0, 10))
        
        # 输入文件
        ttk.Label(file_frame, text="输入 4K 文件：").grid(row=0, column=0, sticky="w", padx=5, pady=5)
        self.input_var = tk.StringVar(value="")
        ttk.Entry(file_frame, textvariable=self.input_var, width=70).grid(row=0, column=1, sticky="we", padx=5, pady=5)
        ttk.Button(file_frame, text="浏览", command=self.pick_input, width=10).grid(row=0, column=2, padx=5, pady=5)
        
        # 输出文件
        ttk.Label(file_frame, text="输出 .adofai：").grid(row=1, column=0, sticky="w", padx=5, pady=5)
        self.output_var = tk.StringVar(value="")
        ttk.Entry(file_frame, textvariable=self.output_var, width=70).grid(row=1, column=1, sticky="we", padx=5, pady=5)
        ttk.Button(file_frame, text="另存为", command=self.pick_output, width=10).grid(row=1, column=2, padx=5, pady=5)
        
        # 模型文件
        ttk.Label(file_frame, text="风格模型 JSON（可选）：").grid(row=2, column=0, sticky="w", padx=5, pady=5)
        self.model_var = tk.StringVar(value="")
        ttk.Entry(file_frame, textvariable=self.model_var, width=70).grid(row=2, column=1, sticky="we", padx=5, pady=5)
        ttk.Button(file_frame, text="加载模型", command=self.pick_model, width=10).grid(row=2, column=2, padx=5, pady=5)
        
        file_frame.columnconfigure(1, weight=1)
        
        # 选项框架
        options_frame = ttk.LabelFrame(main_frame, text="转换选项", padding=10)
        options_frame.pack(fill="x", pady=(0, 10))
        
        # 编码模式
        ttk.Label(options_frame, text="编码模式：").grid(row=0, column=0, sticky="w", padx=5, pady=5)
        self.encoding_mode_var = tk.StringVar(value="smart")
        encoding_combo = ttk.Combobox(
            options_frame,
            textvariable=self.encoding_mode_var,
            values=["smart", "hybrid_angle", "speed_only", "force_straight"],
            state="readonly",
            width=20
        )
        encoding_combo.grid(row=0, column=1, sticky="w", padx=5, pady=5)
        encoding_combo.bind("<<ComboboxSelected>>", self.update_encoding_description)
        
        # 编码模式说明
        self.encoding_desc_var = tk.StringVar(value="智能排砖：动态选择直线/角度，生成更像人工编排的谱面")
        ttk.Label(options_frame, textvariable=self.encoding_desc_var, foreground="#666", 
                 wraplength=500).grid(row=0, column=2, columnspan=3, sticky="w", padx=5, pady=5)
        
        # 和弦模式
        ttk.Label(options_frame, text="和弦模式：").grid(row=1, column=0, sticky="w", padx=5, pady=5)
        self.chord_mode_var = tk.StringVar(value="merge")
        chord_combo = ttk.Combobox(
            options_frame,
            textvariable=self.chord_mode_var,
            values=["merge", "split", "force_single"],
            state="readonly",
            width=20
        )
        chord_combo.grid(row=1, column=1, sticky="w", padx=5, pady=5)
        chord_combo.bind("<<ComboboxSelected>>", self.update_chord_description)
        
        # 和弦模式说明
        self.chord_desc_var = tk.StringVar(value="合并：将同一时刻的多键合并为一个键")
        ttk.Label(options_frame, textvariable=self.chord_desc_var, foreground="#666",
                 wraplength=500).grid(row=1, column=2, columnspan=3, sticky="w", padx=5, pady=5)
        
        # 其他选项
        ttk.Label(options_frame, text="split 间隔(ms)：").grid(row=2, column=0, sticky="w", padx=5, pady=5)
        self.split_spacing_var = tk.StringVar(value="12")
        ttk.Entry(options_frame, textvariable=self.split_spacing_var, width=10).grid(row=2, column=1, sticky="w", padx=5, pady=5)
        
        ttk.Label(options_frame, text="手动 offset(ms)：").grid(row=2, column=2, sticky="w", padx=5, pady=5)
        self.manual_offset_var = tk.StringVar(value="0")
        ttk.Entry(options_frame, textvariable=self.manual_offset_var, width=10).grid(row=2, column=3, sticky="w", padx=5, pady=5)
        
        # 复选框
        self.include_releases_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(options_frame, text="把长条尾判也转成点击", 
                       variable=self.include_releases_var).grid(row=3, column=0, columnspan=2, sticky="w", padx=5, pady=5)
        
        self.use_twirl_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(options_frame, text="启用 Twirl", 
                       variable=self.use_twirl_var).grid(row=3, column=2, sticky="w", padx=5, pady=5)
        
        self.simulate_chords_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(options_frame, text="仿双押/多押角度", 
                       variable=self.simulate_chords_var).grid(row=3, column=3, sticky="w", padx=5, pady=5)
        
        self.preserve_bpm_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(options_frame, text="尽量保留原谱 BPM 变化", 
                       variable=self.preserve_bpm_var).grid(row=4, column=0, columnspan=2, sticky="w", padx=5, pady=5)
        
        options_frame.columnconfigure(2, weight=1)
        
        # 按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill="x", pady=(0, 10))
        
        ttk.Button(button_frame, text="开始转换", command=self.run_convert, width=15).pack(side="left", padx=(0, 10))
        ttk.Button(button_frame, text="清空日志", command=self.clear_log, width=15).pack(side="left")
        
        # 日志框架
        log_frame = ttk.LabelFrame(main_frame, text="日志", padding=10)
        log_frame.pack(fill="both", expand=True)
        
        # 日志文本框
        self.log = tk.Text(log_frame, height=15, wrap="word")
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log.yview)
        self.log.configure(yscrollcommand=log_scroll.set)
        
        self.log.grid(row=0, column=0, sticky="nsew")
        log_scroll.grid(row=0, column=1, sticky="ns")
        
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)
        main_frame.rowconfigure(5, weight=1)
        
        self.write_log("已就绪。整合版支持 force_single、force_straight、hybrid_angle、smart。")
    
    def update_encoding_description(self, event=None) -> None:
        mode = self.encoding_mode_var.get()
        descriptions = {
            "smart": "智能排砖：根据音符间隔动态选择直线或多边形角度，生成最自然的谱面",
            "hybrid_angle": "混合角度：优先用角度表达节奏，必要时插入速度/暂停/Twirl事件",
            "speed_only": "强行直线：用直线路径+BPM事件，时间轴最准确但路径全是直线",
            "force_straight": "强行直线：同 speed_only，用直线路径+BPM事件"
        }
        self.encoding_desc_var.set(descriptions.get(mode, ""))
    
    def update_chord_description(self, event=None) -> None:
        mode = self.chord_mode_var.get()
        descriptions = {
            "merge": "合并：将同一时刻按下的所有音符合并为ADOFAI中的一个键",
            "split": "拆分：将和弦拆分成多个连续的按键（模拟快速单点）",
            "force_single": "强制单押：忽略所有2K/3K/4K和弦，只取第一个音符转换"
        }
        self.chord_desc_var.set(descriptions.get(mode, ""))
    
    def write_log(self, text: str) -> None:
        self.log.insert("end", text + "\n")
        self.log.see("end")
    
    def clear_log(self) -> None:
        self.log.delete("1.0", "end")
    
    def pick_input(self) -> None:
        path = filedialog.askopenfilename(
            title="选择 4K 谱文件",
            filetypes=[("JSON / TXT", "*.json *.txt"), ("All Files", "*.*")],
        )
        if not path:
            return
        self.input_var.set(path)
        if not self.output_var.get().strip():
            self.output_var.set(default_output_path(path))
        self.write_log(f"输入文件：{path}")
    
    def pick_output(self) -> None:
        init = self.output_var.get().strip()
        path = filedialog.asksaveasfilename(
            title="保存为 .adofai",
            defaultextension=".adofai",
            initialfile=os.path.basename(init) if init else "converted_integrated.adofai",
            filetypes=[("ADOFAI", "*.adofai"), ("All Files", "*.*")],
        )
        if not path:
            return
        self.output_var.set(path)
        self.write_log(f"输出文件：{path}")
    
    def pick_model(self) -> None:
        path = filedialog.askopenfilename(
            title="选择风格模型 JSON",
            filetypes=[("JSON", "*.json"), ("All Files", "*.*")],
        )
        if not path:
            return
        self.model_var.set(path)
        self.write_log(f"已加载模型路径：{path}")
    
    def run_convert(self) -> None:
        input_path = self.input_var.get().strip()
        output_path = self.output_var.get().strip()
        if not input_path:
            messagebox.showwarning("缺少输入", "请先选择 4K 谱文件。")
            return
        if not output_path:
            messagebox.showwarning("缺少输出", "请先选择输出路径。")
            return
        
        try:
            split_spacing_ms = float(self.split_spacing_var.get().strip() or "12")
            manual_offset_ms = float(self.manual_offset_var.get().strip() or "0")
        except ValueError:
            messagebox.showerror("参数错误", "split 间隔和 offset 必须是数字。")
            return
        
        try:
            self.write_log("开始转换...")
            result = convert_4k_to_adofai(
                input_path=input_path,
                output_path=output_path,
                encoding_mode=self.encoding_mode_var.get().strip() or "smart",
                chord_mode=self.chord_mode_var.get().strip() or "merge",
                include_releases=self.include_releases_var.get(),
                split_spacing_ms=split_spacing_ms,
                manual_offset_ms=manual_offset_ms,
                use_twirl=self.use_twirl_var.get(),
                simulate_chords_with_angle=self.simulate_chords_var.get(),
                preserve_explicit_bpm=self.preserve_bpm_var.get(),
                model_path=self.model_var.get().strip() or None,
            )
            self.write_log("转换完成。")
            self.write_log(json.dumps(result, ensure_ascii=False, indent=2))
            messagebox.showinfo("完成", f"转换成功！\n\n输出：{result['output_path']}")
        except Exception as exc:
            self.write_log("转换失败：")
            self.write_log(str(exc))
            self.write_log(traceback.format_exc())
            messagebox.showerror("转换失败", str(exc))


# -----------------------------
# CLI
# -----------------------------
def run_cli(argv: List[str]) -> int:
    if len(argv) < 3:
        print(
            "用法：python integrated_4k_to_adofai_converter.py <input.json/txt> <output.adofai> "
            "[encoding_mode] [chord_mode] [include_releases:0|1] [split_spacing_ms] [manual_offset_ms] "
            "[use_twirl:0|1] [simulate_chords:0|1] [preserve_bpm:0|1] [model.json|'']"
        )
        return 1
    
    input_path = argv[1]
    output_path = argv[2]
    encoding_mode = argv[3] if len(argv) >= 4 else "smart"
    chord_mode = argv[4] if len(argv) >= 5 else "merge"
    include_releases = bool(int(argv[5])) if len(argv) >= 6 else False
    split_spacing_ms = float(argv[6]) if len(argv) >= 7 else 12.0
    manual_offset_ms = float(argv[7]) if len(argv) >= 8 else 0.0
    use_twirl = bool(int(argv[8])) if len(argv) >= 9 else True
    simulate_chords = bool(int(argv[9])) if len(argv) >= 10 else True
    preserve_bpm = bool(int(argv[10])) if len(argv) >= 11 else True
    model_path = argv[11] if len(argv) >= 12 and argv[11] else None
    
    result = convert_4k_to_adofai(
        input_path=input_path,
        output_path=output_path,
        encoding_mode=encoding_mode,
        chord_mode=chord_mode,
        include_releases=include_releases,
        split_spacing_ms=split_spacing_ms,
        manual_offset_ms=manual_offset_ms,
        use_twirl=use_twirl,
        simulate_chords_with_angle=simulate_chords,
        preserve_explicit_bpm=preserve_bpm,
        model_path=model_path,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def main() -> None:
    if len(sys.argv) >= 3:
        raise SystemExit(run_cli(sys.argv))
    
    # 创建主窗口
    root = tk.Tk()
    
    # 显示核对窗口
    auth_window = AuthWindow(root)
    root.mainloop()
    
    # 检查核对结果
    if not auth_window.success:
        return
    
    # 销毁核对窗口
    root.destroy()
    
    # 创建主应用窗口
    root = tk.Tk()
    app = ConverterApp(root)
    
    # 更新编码模式说明
    app.update_encoding_description()
    app.update_chord_description()
    
    root.mainloop()


if __name__ == "__main__":
    main()
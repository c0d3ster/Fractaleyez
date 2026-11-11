"""Shared by drum-real-thresholds.py and drum-weak-labels.py: drum-candidates.mts output and Raveform's beat grid, per track.

In the drops of four-on-the-floor tracks a kick plays on every beat, a snare or clap on 2 and 4 and a hat on the off-beats, nearly always,
so the beats stand in for drum labels where there are none (drum-real-score.py has the same proxies).
"""
import csv
import json
import os
from dataclasses import dataclass

import numpy as np

FOUR_ON_THE_FLOOR = {'Techno', 'Trance', 'Tech House', 'Mainstage', 'Deep House', 'House', 'Progressive House', 'Melodic House & Techno'}
KINDS = ['kick', 'hat', 'snare', 'clap']
# A drop needs this many beats to be read (shorter ones are often mislabelled edges).
MIN_DROP_BEATS = 16


@dataclass
class Candidates:
    track: np.ndarray  # index into tracks
    t: np.ndarray  # ms
    p: np.ndarray  # rows x 4, the installed model's probabilities
    f: np.ndarray  # rows x inputs
    tracks: list[dict]
    features: list[str]


def load(prefixes: str) -> Candidates:
    """drum-candidates.mts shards (comma-separated prefixes), joined, with each shard's track indices made global."""
    parts, tracks, features = [], [], []
    for prefix in prefixes.split(','):
        meta = json.load(open(f'{prefix}.json'))
        rows = np.fromfile(f'{prefix}.bin', dtype='<f4').reshape(-1, meta['width']) if meta['width'] else np.zeros((0, 6))
        rows = rows.astype(np.float64)
        rows[:, 0] += len(tracks)
        parts.append(rows)
        tracks += meta['tracks']
        features = meta['features']
    rows = np.concatenate(parts)
    return Candidates(rows[:, 0].astype(int), rows[:, 1], rows[:, 2:6], rows[:, 6:], tracks, features)


@dataclass
class Grid:
    beats: np.ndarray  # ms, every beat of the track
    place: np.ndarray  # 1 to 4 in the bar
    drop: np.ndarray  # the beat is in a drop

    @property
    def off_beats(self) -> np.ndarray:
        return (self.beats[:-1] + self.beats[1:]) / 2

    def in_drop(self, t: np.ndarray) -> np.ndarray:
        """Which times fall between a drop beat and the next beat."""
        at = np.clip(np.searchsorted(self.beats, t) - 1, 0, len(self.beats) - 1)
        return self.drop[at] & (t >= self.beats[0]) & (t < self.beats[-1])


def grid(beats_dir: str, track: dict) -> Grid | None:
    """The track's beats, or None when it is not four on the floor or has too little drop."""
    if track.get('genre') not in FOUR_ON_THE_FLOOR:
        return None
    lines = list(csv.DictReader(open(os.path.join(beats_dir, f"{track['id']}.beat.csv"))))
    g = Grid(np.array([float(x['time']) * 1000 for x in lines]), np.array([int(x['downbeat']) for x in lines]),
             np.array([x['section'] == 'drop' for x in lines]))
    return g if g.drop.sum() >= MIN_DROP_BEATS else None


def distance(times: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Each time's distance to the nearest of `points` (sorted), in ms."""
    if len(points) == 0:
        return np.full(len(times), np.inf)
    at = np.searchsorted(points, times)
    before, after = points[np.clip(at - 1, 0, len(points) - 1)], points[np.clip(at, 0, len(points) - 1)]
    return np.minimum(np.abs(times - before), np.abs(times - after))

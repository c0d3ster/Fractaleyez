"""Scores grid-eval.mts beats against Raveform's marked beats (raveform/structures: segments.json and beats/<key>.beat.csv).

    python grid-score-raveform.py <grid.json> <structures dir> [--folds 6,7] [--from 10] [--per-track out.json]

Raveform marks every beat with its place in the bar (1 to 4) and its section. Bars are counted from the first marked downbeat, so a marked
8-bar line is every 8th downbeat from there. Only beats after --from seconds count (the tempo tracker needs about 9 s before it shows a
tempo). Within 70 ms, the usual tolerance:
  beat F         predicted beats against marked beats
  beat F any     the same, also accepting double or half the marked rate, or the off-beat
  offset         median of predicted minus nearest marked beat (a steady lag to calibrate out)
  downbeat F     predicted beat-1s against marked beat-1s
  8-bar F        predicted 8-bar lines (beat 1 of bar 1 in the phrase) against marked 8-bar lines
  bar right      share of tracks where the beat is right (F > 0.7) and most beat-1s land on marked beat-1s (F > 0.5)
  phrase right   share of tracks where, on top of that, most 8-bar lines land on marked ones (F > 0.5)
  sec on line    share of Raveform's section starts that land on a predicted 8-bar line (70 ms), against the share that sit on a marked
                 8-bar line (the ceiling: Raveform's own phrasing), and within a beat of one
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np

TOL = 0.07


def f_measure(pred: np.ndarray, truth: np.ndarray, tol: float = TOL) -> float:
    if len(pred) == 0 or len(truth) == 0:
        return 0.0
    used = np.zeros(len(truth), dtype=bool)
    hits = 0
    for p in pred:
        i = int(np.argmin(np.abs(truth - p)))
        if abs(truth[i] - p) <= tol and not used[i]:
            used[i] = True
            hits += 1
    precision, recall = hits / len(pred), hits / len(truth)
    return 0.0 if hits == 0 else 2 * precision * recall / (precision + recall)


def near(points: np.ndarray, targets: np.ndarray, tol: float) -> np.ndarray:
    if len(targets) == 0:
        return np.zeros(len(points), dtype=bool)
    idx = np.clip(np.searchsorted(targets, points), 1, len(targets) - 1) if len(targets) > 1 else np.zeros(len(points), dtype=int)
    best = np.minimum(np.abs(targets[idx] - points), np.abs(targets[np.maximum(idx - 1, 0)] - points))
    return best <= tol


def load_marks(path: str) -> tuple[np.ndarray, np.ndarray]:
    times, positions = [], []
    with open(path) as f:
        next(f)
        for line in f:
            parts = line.strip().split(',')
            if len(parts) >= 2 and parts[0]:
                times.append(float(parts[0]))
                positions.append(int(parts[1]))
    return np.array(times), np.array(positions)


def score_track(beats_run: list, times: np.ndarray, positions: np.ndarray, sections: list, start: float) -> dict | None:
    ones_all = times[positions == 1]
    if len(ones_all) < 9:
        return None
    lines_all = ones_all[::8]
    keep = times >= start
    t_beats = times[keep]
    t_ones = ones_all[ones_all >= start]
    t_lines = lines_all[lines_all >= start]
    if len(t_beats) < 8:
        return None
    beats = np.array([b[0] for b in beats_run if b[0] >= start])
    ones = np.array([b[0] for b in beats_run if b[0] >= start and b[1] == 1])
    lines = np.array([b[0] for b in beats_run if b[0] >= start and b[1] == 1 and b[2] == 1])
    period = float(np.median(np.diff(times)))
    mids = t_beats[:-1] + np.diff(t_beats) / 2
    variants = [t_beats, np.sort(np.concatenate([t_beats, mids])), t_beats[::2], t_beats[1::2], mids]
    beat_f = f_measure(beats, t_beats)
    row = dict(
        beat_f=beat_f,
        any_f=max(f_measure(beats, v) for v in variants),
        down_f=f_measure(ones, t_ones),
        line_f=f_measure(lines, t_lines),
    )
    row['bar_right'] = float(beat_f > 0.7 and row['down_f'] > 0.5)
    row['phrase_right'] = float(row['bar_right'] and row['line_f'] > 0.5)
    offsets = []
    if len(beats):
        idx = np.clip(np.searchsorted(t_beats, beats), 1, len(t_beats) - 1)
        nearest = np.where(np.abs(t_beats[idx] - beats) < np.abs(t_beats[idx - 1] - beats), t_beats[idx], t_beats[idx - 1])
        d = beats - nearest
        offsets = list(d[np.abs(d) < period / 4])
    starts = np.array([s['start'] for s in sections if s['start'] >= start])
    row['sec_n'] = len(starts)
    row['sec_on_line'] = int(near(starts, lines, TOL).sum()) if len(lines) else 0
    row['sec_near_line'] = int(near(starts, lines, period * 0.5).sum()) if len(lines) else 0
    row['sec_on_marked'] = int(near(starts, t_lines, TOL).sum())
    return row, offsets


def main() -> None:
    run = json.load(open(sys.argv[1]))
    structures = sys.argv[2]
    start = float(sys.argv[sys.argv.index('--from') + 1]) if '--from' in sys.argv else 10.0
    folds = set(int(x) for x in sys.argv[sys.argv.index('--folds') + 1].split(',')) if '--folds' in sys.argv else None
    segments = {s['key']: s for s in json.load(open(os.path.join(structures, 'segments.json')))}
    rows = defaultdict(list)
    offsets = []
    per_track = {}
    for r in run['runs']:
        seg = segments.get(r['id'])
        path = os.path.join(structures, 'beats', f"{r['id']}.beat.csv")
        if seg is None or not os.path.exists(path) or (folds is not None and seg['fold'] not in folds):
            continue
        times, positions = load_marks(path)
        scored = score_track(r['beats'], times, positions, seg['sections'], start)
        if scored is None:
            continue
        row, off = scored
        offsets += off
        per_track[r['id']] = row
        rows['all'].append(row)
        rows[seg['genre']].append(row)
    if '--per-track' in sys.argv:
        json.dump(per_track, open(sys.argv[sys.argv.index('--per-track') + 1], 'w'))
    print(f"median offset {np.median(offsets) * 1000:+.0f} ms (predicted minus marked; positive is late), n={len(offsets)}")
    for name, rs in sorted(rows.items(), key=lambda kv: (kv[0] != 'all', -len(kv[1]))):
        m = {k: np.mean([x[k] for x in rs]) for k in ('beat_f', 'any_f', 'down_f', 'line_f', 'bar_right', 'phrase_right')}
        n_sec = sum(x['sec_n'] for x in rs) or 1
        on = sum(x['sec_on_line'] for x in rs) / n_sec
        near_ = sum(x['sec_near_line'] for x in rs) / n_sec
        marked = sum(x['sec_on_marked'] for x in rs) / n_sec
        print(f"{name:24s} n={len(rs):4d}  beat F {m['beat_f']:.3f}  any {m['any_f']:.3f}  downbeat F {m['down_f']:.3f}  "
              f"8-bar F {m['line_f']:.3f}  bar right {m['bar_right']:.2f}  phrase right {m['phrase_right']:.2f}  "
              f"sec on line {on:.2f} (within a beat {near_:.2f}, marked {marked:.2f})")


if __name__ == '__main__':
    main()

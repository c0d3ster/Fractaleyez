"""Scores grid-eval.mts beats against hand-marked beats and downbeats (Ballroom annotations: one "<time> <beat in bar>" line per beat).

    python grid-score.py <grid.json> <annotations dir> [--genres genres.txt] [--from 10]

Only excerpts in 4/4 count (Ballroom's waltzes are in 3/4, which the grid does not model), and only beats after --from seconds (the
tempo tracker needs about 9 s before it shows a tempo). Within 70 ms, the usual tolerance:
  beat F       predicted beats against marked beats
  beat F any   the same, also accepting the grid running at double or half the marked beat rate, or on the off-beat
  offset       median of predicted minus nearest marked beat (a steady lag to calibrate out)
  downbeat F   predicted beat-1s against marked beat-1s
  bar right    share of excerpts where most predicted beat-1s (once the beat itself is right) land on marked beat-1s
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np

TOL = 0.07


def f_measure(pred: np.ndarray, truth: np.ndarray) -> float:
    if len(pred) == 0 or len(truth) == 0:
        return 0.0
    used = np.zeros(len(truth), dtype=bool)
    hits = 0
    for p in pred:
        i = int(np.argmin(np.abs(truth - p)))
        if abs(truth[i] - p) <= TOL and not used[i]:
            used[i] = True
            hits += 1
    precision, recall = hits / len(pred), hits / len(truth)
    return 0.0 if hits == 0 else 2 * precision * recall / (precision + recall)


def main() -> None:
    run = json.load(open(sys.argv[1]))
    ann = sys.argv[2]
    start = float(sys.argv[sys.argv.index('--from') + 1]) if '--from' in sys.argv else 10.0
    genres = {}
    if '--genres' in sys.argv:
        for line in open(sys.argv[sys.argv.index('--genres') + 1]):
            parts = line.split()
            if len(parts) == 2:
                genres[parts[0]] = parts[1]
    rows = defaultdict(list)
    offsets = []
    for r in run['runs']:
        path = os.path.join(ann, f"{r['id']}.beats")
        if not os.path.exists(path):
            continue
        truth = np.loadtxt(path, ndmin=2)
        if truth[:, 1].max() != 4:
            continue
        beats = np.array([b[0] for b in r['beats'] if b[0] >= start])
        ones = np.array([b[0] for b in r['beats'] if b[0] >= start and b[1] == 1])
        t_beats = truth[truth[:, 0] >= start, 0]
        t_ones = truth[(truth[:, 0] >= start) & (truth[:, 1] == 1), 0]
        if len(t_beats) < 4:
            continue
        period = float(np.median(np.diff(truth[:, 0])))
        variants = [t_beats, np.sort(np.concatenate([t_beats, t_beats[:-1] + np.diff(t_beats) / 2])), t_beats[::2], t_beats[1::2],
                    t_beats[:-1] + np.diff(t_beats) / 2]
        beat_f = f_measure(beats, t_beats)
        any_f = max(f_measure(beats, v) for v in variants)
        down_f = f_measure(ones, t_ones)
        if len(beats):
            near = [p - t_beats[int(np.argmin(np.abs(t_beats - p)))] for p in beats]
            offsets += [d for d in near if abs(d) < period / 4]
        bar_right = float(beat_f > 0.7 and down_f > 0.5)
        row = dict(beat_f=beat_f, any_f=any_f, down_f=down_f, bar_right=bar_right)
        rows['all'].append(row)
        rows[genres.get(r['id'], '?')].append(row)
    print(f"median offset {np.median(offsets) * 1000:.0f} ms (predicted minus marked; positive is late), n={len(offsets)}")
    for name, rs in sorted(rows.items(), key=lambda kv: (kv[0] != 'all', -len(kv[1]))):
        m = {k: np.mean([x[k] for x in rs]) for k in rs[0]}
        print(f"{name:16s} n={len(rs):3d}  beat F {m['beat_f']:.2f}  beat F any level {m['any_f']:.2f}  downbeat F {m['down_f']:.2f}  bar right {m['bar_right']:.2f}")


if __name__ == '__main__':
    main()

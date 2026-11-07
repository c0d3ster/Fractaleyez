"""Scores bpm-eval.mts readings against labelled tempos.

    python bpm-score.py <readings.json> <gt.json> [--by-genre]

gt.json: { "bpm": { id: bpm }, "genre": { id: genre } } (the GiantSteps tempo set, v2 annotations).
Every reading after WARMUP_S counts:
  acc1     within 4% of the labelled tempo (the MIREX tolerance)
  acc2     within 4% of it, or of half, double, a third or three times it (the right beat, the wrong level)
  shown    share of readings that show a tempo at all
  changes  how often the shown number (rounded, as the HUD shows it) changes, per minute
  jumps    how often it moves by more than 4% from one reading to the next, per minute (a visible jump, not rounding)
  track    share of tracks whose most common reading (after warm-up) is within 4% (what a person glancing at it would call right)
"""
import json
import sys
from collections import Counter, defaultdict

import numpy as np

WARMUP_S = 12
TOL = 0.04
OCTAVES = (1, 2, 0.5, 3, 1 / 3)


def near(a: float, b: float, factors=(1,)) -> bool:
    return any(abs(a - b * f) <= b * f * TOL for f in factors)


def main() -> None:
    run = json.load(open(sys.argv[1]))
    gt = json.load(open(sys.argv[2]))
    every = run['readEveryMs'] / 1000
    groups: dict[str, list] = defaultdict(list)
    for r in run['runs']:
        truth = gt['bpm'].get(r['id'])
        # Three excerpts are labelled 0 BPM (no tempo): nothing to score.
        if truth is None or truth <= 0:
            continue
        readings = r['readings'][int(WARMUP_S / every):]
        if not readings:
            continue
        shown = [x for x in readings if x is not None]
        acc1 = np.mean([near(x, truth) for x in shown]) if shown else 0.0
        acc2 = np.mean([near(x, truth, OCTAVES) for x in shown]) if shown else 0.0
        rounded = [None if x is None else round(x) for x in readings]
        changes = sum(1 for a, b in zip(rounded, rounded[1:]) if a != b)
        jumps = sum(1 for a, b in zip(readings, readings[1:]) if a is not None and b is not None and abs(b - a) > a * TOL)
        minutes = len(readings) * every / 60
        mode = Counter(round(x) for x in shown).most_common(1)[0][0] if shown else None
        row = dict(acc1=acc1, acc2=acc2, shown=len(shown) / len(readings), changes=changes / minutes, jumps=jumps / minutes,
                   track=float(mode is not None and near(mode, truth)))
        groups['all'].append(row)
        if '--by-genre' in sys.argv:
            groups[gt['genre'].get(r['id'], '?')].append(row)
    if '--summary' in sys.argv:
        rows = groups['all']
        print(json.dumps({k: round(float(np.mean([row[k] for row in rows])), 3) for k in rows[0]}))
        return
    for name, rows in sorted(groups.items(), key=lambda kv: (kv[0] != 'all', -len(kv[1]))):
        if name != 'all' and len(rows) < 10:
            continue
        m = {k: np.mean([row[k] for row in rows]) for k in rows[0]}
        print(f"{name:22s} n={len(rows):3d}  acc1 {m['acc1']:.2f}  acc2 {m['acc2']:.2f}  track {m['track']:.2f}  shown {m['shown']:.2f}"
              f"  changes/min {m['changes']:5.1f}  jumps/min {m['jumps']:5.1f}")


if __name__ == '__main__':
    main()

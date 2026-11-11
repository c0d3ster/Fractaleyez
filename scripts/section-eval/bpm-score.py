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
  octave   share of shown readings at the wrong level: within 4% of half, double, a third or three times it, but not of it
  lock_s   median time from the start of the track until the reading is within 4% and stays there for LOCK_HOLD_S (from the
           first reading, no warm-up; a track that never locks counts as its full length)
  locked   share of tracks that lock at all
"""
import json
import sys
from collections import Counter, defaultdict

import numpy as np

WARMUP_S = 12
LOCK_HOLD_S = 5
TOL = 0.04
OCTAVES = (1, 2, 0.5, 3, 1 / 3)


def near(a: float, b: float, factors=(1,)) -> bool:
    return any(abs(a - b * f) <= b * f * TOL for f in factors)


def stat(key: str):
    # Lock time is skewed by tracks that never lock (they count their full length), so it is the median; the rest are means.
    return np.median if key == 'lock_s' else np.mean


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
        # Readings from the first to the last of the hold, inclusive: 11 at 500 ms span the full 5 s.
        hold = int(np.ceil(LOCK_HOLD_S / every - 1e-9)) + 1
        allr = r['readings']
        right = [x is not None and near(x, truth) for x in allr]
        lock_at = next((i for i in range(len(right) - hold + 1) if all(right[i:i + hold])), None)
        lock_s = (lock_at + 1) * every if lock_at is not None else len(allr) * every
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
                   track=float(mode is not None and near(mode, truth)),
                   octave=np.mean([near(x, truth, OCTAVES[1:]) and not near(x, truth) for x in shown]) if shown else 0.0,
                   lock_s=lock_s, locked=float(lock_at is not None))
        groups['all'].append(row)
        if '--by-genre' in sys.argv:
            groups[gt['genre'].get(r['id'], '?')].append(row)
    if '--summary' in sys.argv:
        rows = groups['all']
        print(json.dumps({k: round(float(stat(k)([row[k] for row in rows])), 3) for k in rows[0]}))
        return
    for name, rows in sorted(groups.items(), key=lambda kv: (kv[0] != 'all', -len(kv[1]))):
        if name != 'all' and len(rows) < 10:
            continue
        m = {k: stat(k)([row[k] for row in rows]) for k in rows[0]}
        print(f"{name:22s} n={len(rows):3d}  acc1 {m['acc1']:.2f}  acc2 {m['acc2']:.2f}  track {m['track']:.2f}  shown {m['shown']:.2f}"
              f"  changes/min {m['changes']:5.1f}  jumps/min {m['jumps']:5.1f}  octave {m['octave']:.2f}  lock {m['lock_s']:4.1f}s"
              f"  locked {m['locked']:.2f}")


if __name__ == '__main__':
    main()

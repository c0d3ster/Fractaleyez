"""Scores pattern-eval.mts pattern names against pattern-labels.py proxy labels.

    python pattern-score.py <run.json>[,<run.json>...] <labels.json> [--folds 6,7] [--half tune|test] [--drops] [--shown] [--json]

Every reading from WARMUP_S on counts (the first 12 s window has to fill). --drops keeps only readings whose whole 12 s window is inside a
labelled drop (Raveform), where the full drum pattern plays. --shown applies the Beat HUD's hold (a change of name shows only after it has
been read 6 times in a row). --half splits by a stable hash of the id (tune: even, test: odd), for sets without folds.

Prints, per proxy class, the share of readings given each name (a confusion matrix, rows sum to 1), then:
  right     share of readings named as the proxy says (breakbeat: "syncopated", "breakbeat" or "two-step"), unnamed readings counting as wrong
  balanced  the mean of right over the three classes, so techno's numbers do not drown the others
  named     share of readings with any name
  precise   right among named readings
  track     share of tracks whose most common name (unnamed left out) is right
Classes with no proxy (and Ballroom's dances) are listed by genre as they are, unscored.
"""
import hashlib
import json
import sys
from collections import Counter, defaultdict

import numpy as np

WARMUP_S = 12
WINDOW_S = 12
HOLD = 6
RIGHT = {'four on the floor': {'four on the floor'}, 'half time': {'half time'}, 'breakbeat': {'syncopated', 'breakbeat', 'two-step'}}
CLASSES = list(RIGHT)


def stable_half(key: str) -> str:
    return 'tune' if int(hashlib.md5(key.encode()).hexdigest(), 16) % 2 == 0 else 'test'


def held(readings: list) -> list:
    shown, candidate, streak, out = None, None, 0, []
    for reading in readings:
        if reading == shown:
            candidate, streak = reading, 0
        else:
            streak = streak + 1 if reading == candidate else 1
            candidate = reading
            if shown is None or streak >= HOLD:
                shown = reading
        out.append(shown)
    return out


def main() -> None:
    runs = [r for path in sys.argv[1].split(',') for r in json.load(open(path))['runs']]
    labels = json.load(open(sys.argv[2]))
    argv = sys.argv
    folds = set(int(x) for x in argv[argv.index('--folds') + 1].split(',')) if '--folds' in argv else None
    half = argv[argv.index('--half') + 1] if '--half' in argv else None
    every = 0.5
    matrix: dict[str, Counter] = defaultdict(Counter)
    tracks: dict[str, list] = defaultdict(list)
    for run in runs:
        label = labels.get(run['id'])
        if label is None:
            continue
        if folds is not None and label.get('fold') not in folds:
            continue
        if half is not None and stable_half(run['id']) != half:
            continue
        readings = held(run['patterns']) if '--shown' in argv else run['patterns']
        keep = []
        for i, name in enumerate(readings):
            t = (i + 1) * every
            if t < WARMUP_S:
                continue
            if '--drops' in argv and not any(s + WINDOW_S <= t <= e for s, e in label.get('drops', [])):
                continue
            keep.append(name)
        if not keep:
            continue
        row = label['proxy'] or f'({label["genre"]})'
        matrix[row].update(keep)
        named = [n for n in keep if n is not None]
        mode = Counter(named).most_common(1)[0][0] if named else None
        tracks[row].append(mode)
    names = sorted({n for c in matrix.values() for n in c if n is not None}) + [None]
    summary = {}
    if '--json' not in argv:
        print(f'{"":22s} {"n":>6s} ' + ' '.join(f'{(n or "none")[:11]:>11s}' for n in names))
    for row in CLASSES + sorted(r for r in matrix if r not in CLASSES):
        counts = matrix.get(row)
        if not counts:
            continue
        total = sum(counts.values())
        if '--json' not in argv:
            print(f'{row[:22]:22s} {len(tracks[row]):6d} ' + ' '.join(f'{counts[n] / total:11.2f}' for n in names))
        if row in RIGHT:
            right = sum(counts[n] for n in RIGHT[row]) / total
            named = 1 - counts[None] / total
            summary[row] = dict(right=right, named=named, precise=right / named if named else 0.0,
                                track=float(np.mean([m in RIGHT[row] for m in tracks[row]])), tracks=len(tracks[row]))
    scored = [summary[c] for c in CLASSES if c in summary]
    if scored:
        summary['balanced'] = float(np.mean([s['right'] for s in scored]))
        summary['balanced_track'] = float(np.mean([s['track'] for s in scored]))
    if '--json' in argv:
        print(json.dumps({k: (round(v, 3) if isinstance(v, float) else {a: round(b, 3) for a, b in v.items()}) for k, v in summary.items()}))
        return
    print()
    for c in CLASSES:
        if c in summary:
            s = summary[c]
            print(f'{c:18s} right {s["right"]:.2f}  named {s["named"]:.2f}  precise {s["precise"]:.2f}  track {s["track"]:.2f}  ({s["tracks"]} tracks)')
    if 'balanced' in summary:
        print(f'balanced right {summary["balanced"]:.3f}, balanced track {summary["balanced_track"]:.3f}')


if __name__ == '__main__':
    main()

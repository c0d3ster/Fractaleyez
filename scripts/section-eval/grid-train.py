"""Fits BeatGrid's downbeat and phrase cues on Raveform's marked beats and bars, and exports them (packages/soundsense/src/beat-grid-model.json).

    python grid-train.py <levels dir> <structures dir> [--folds 0,1,2,3,4,5] [--validate 4,5] [--export ../../packages/soundsense/src/beat-grid-model.json]

Levels are levels.py output (float32, frames x 5, 60 fps); structures is Raveform's raveform/structures (segments.json and beats/).

Both are the same kind of model, a conditional logit over the places a line can be. For each beat (or bar) a few cues are measured, the
way BeatGrid measures them when that beat is past; they are summed per position in the cycle (4 beats in a bar, 8 bars in a phrase) over a
window, each cue divided by its mean over the positions, and a hypothesis "position d is the line" scores sum over r and cue of
weight[r][cue] * sum[(d + r) % size][cue]. The weights are fitted so the true line scores highest.

Beat cues, for beat j with I(j) the mean level (dB, per band) from beat j to the next:
  rise    the largest rise of each band from a quarter beat before to half a beat after (a hit on the beat: kick, clap, crash)
  change1 |I(j) - I(j - 1)| per band                         (bar lines change most: a new bass note, a new loop)
  change2 |mean of I(j), I(j + 1) - mean of I(j - 2), I(j - 1)| per band
Bar cues, for bar i with B(i) its mean level: the rise on its first beat, and |B| changes over 1, 2 and 4 bars on each side of its line.

With --validate, the folds listed there are left out of the fit and scored (the share of windows where the true line wins). Raveform's own
folds are used for every split: tune on 0 to 5, report on 6 and 7.
"""
import argparse
import json
import os
from concurrent.futures import ProcessPoolExecutor

import numpy as np

FPS = 60
BANDS = 5
FLOOR_DB = -60
BEAT_WINDOW_BARS = 16
PHRASE_WINDOW_BARS = 32


def to_db(levels: np.ndarray) -> np.ndarray:
    return np.maximum(FLOOR_DB, 20 * np.log10(np.maximum(levels, 1e-6)))


def rises(db: np.ndarray) -> np.ndarray:
    follower = np.full(BANDS, float(FLOOR_DB))
    out = np.zeros_like(db)
    for i in range(len(db)):
        out[i] = np.maximum(0, db[i] - follower)
        follower += (db[i] - follower) * 0.4
    return out


def load_marks(path: str) -> tuple[np.ndarray, np.ndarray]:
    rows = [line.strip().split(',') for line in open(path)][1:]
    rows = [r for r in rows if r and r[0]]
    return np.array([float(r[0]) for r in rows]), np.array([int(r[1]) for r in rows])


def track_features(job: tuple[str, str, str]) -> tuple[str, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    levels_path, marks_path, key = job
    db = to_db(np.fromfile(levels_path, '<f4').reshape(-1, BANDS))
    rise = rises(db)
    n = len(db)
    times, positions = load_marks(marks_path)
    frames = np.round(times * FPS).astype(int)
    ok = frames < n
    times, positions, frames = times[ok], positions[ok], frames[ok]
    interval = np.array([db[frames[j]:frames[j + 1]].mean(0) for j in range(len(frames) - 1)])
    beat_rise = []
    for j in range(len(frames) - 1):
        period = frames[j + 1] - frames[j]
        lo, hi = max(0, int(frames[j] - period / 4)), int(frames[j] + period / 2) + 1
        beat_rise.append(rise[lo:hi].max(0))
    beat_x, beat_p = [], []
    for j in range(2, len(interval) - 1):
        change1 = np.abs(interval[j] - interval[j - 1])
        change2 = np.abs(interval[j:j + 2].mean(0) - interval[j - 2:j].mean(0))
        beat_x.append(np.concatenate([beat_rise[j], change1, change2]))
        beat_p.append(positions[j] - 1)
    ones = np.flatnonzero(positions == 1)
    ones = ones[ones < len(interval)]
    bars = [interval[ones[i]:ones[i + 1]].mean(0) for i in range(len(ones) - 1)]
    bar_x, bar_p = [], []
    for i in range(4, len(bars) - 4):
        b = np.array(bars)
        bar_x.append(np.concatenate([beat_rise[ones[i]], np.abs(b[i] - b[i - 1]), np.abs(b[i:i + 2].mean(0) - b[i - 2:i].mean(0)),
                                     np.abs(b[i:i + 4].mean(0) - b[i - 4:i].mean(0))]))
        bar_p.append(i % 8)
    return key, np.array(beat_x), np.array(beat_p, dtype=int), np.array(bar_x), np.array(bar_p, dtype=int)


def windows(tracks: list, size: int, window: int) -> np.ndarray:
    """Per window: n x size hypotheses x (size relative slots x cues)."""
    sums = []
    for x, p in tracks:
        for start in range(0, len(p) - window, window):
            s = np.zeros((size, x.shape[1]))
            np.add.at(s, p[start:start + window], x[start:start + window])
            sums.append(s / np.maximum(s.mean(0, keepdims=True), 1e-6))
    s = np.array(sums)
    return np.stack([np.concatenate([s[:, (d + r) % size] for r in range(size)], 1) for d in range(size)], 1)


def fit(h: np.ndarray, steps: int = 3000, rate: float = 0.05, l2: float = 1e-3) -> np.ndarray:
    w = np.zeros(h.shape[2])
    for _ in range(steps):
        z = h @ w
        z -= z.max(1, keepdims=True)
        p = np.exp(z)
        p /= p.sum(1, keepdims=True)
        w -= rate * (((h * p[:, :, None]).sum(1) - h[:, 0]).mean(0) + l2 * w)
    return w


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('levels')
    parser.add_argument('structures')
    parser.add_argument('--folds', default='0,1,2,3,4,5')
    parser.add_argument('--validate', default='')
    parser.add_argument('--export')
    args = parser.parse_args()
    folds = {int(f) for f in args.folds.split(',')}
    held = {int(f) for f in args.validate.split(',') if f}
    segments = {s['key']: s for s in json.load(open(os.path.join(args.structures, 'segments.json')))}
    jobs = []
    for name in sorted(os.listdir(args.levels)):
        key = name[:-4]
        if name.endswith('.f32') and key in segments and segments[key]['fold'] in folds | held:
            jobs.append((os.path.join(args.levels, name), os.path.join(args.structures, 'beats', f'{key}.beat.csv'), key))
    with ProcessPoolExecutor() as pool:
        feats = list(pool.map(track_features, jobs, chunksize=8))
    train = [f for f in feats if segments[f[0]]['fold'] in folds - held]
    test = [f for f in feats if segments[f[0]]['fold'] in held]
    model = {'trainedOn': f'Raveform folds {",".join(map(str, sorted(folds - held)))}, {len(train)} tracks'}
    for name, size, window, xi, pi in (('downbeat', 4, BEAT_WINDOW_BARS * 4, 1, 2), ('phrase', 8, PHRASE_WINDOW_BARS, 3, 4)):
        h = windows([(f[xi], f[pi]) for f in train], size, window)
        w = fit(h)
        line = f'{name}: train {np.mean((h @ w).argmax(1) == 0):.3f} (n {len(h)})'
        if test:
            ht = windows([(f[xi], f[pi]) for f in test], size, window)
            line += f', validate {np.mean((ht @ w).argmax(1) == 0):.3f} (n {len(ht)})'
        print(line)
        model[name] = [[round(float(v), 4) for v in row] for row in w.reshape(size, -1)]
    if args.export:
        rows = lambda name: ',\n'.join('  [' + ', '.join(f'{v:g}' for v in row) + ']' for row in model[name])
        with open(args.export, 'w') as f:
            f.write('{\n "trainedOn": %s,\n "downbeat": [\n%s\n ],\n "phrase": [\n%s\n ]\n}\n' % (json.dumps(model['trainedOn']), rows('downbeat'),
                                                                                                    rows('phrase')))


if __name__ == '__main__':
    main()

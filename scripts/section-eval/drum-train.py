"""Trains the drum hit classifier (src/audioanalysis/drum-hit-model.json) on drum-eval.mts --features output from drum-gen.py clips.

    python drum-train.py <eval.json>[,<eval.json>...] [--hidden 32] [--save drum-hit-model.json] [--parity parity.json]

Each true hit (kick, hat, snare, clap) makes the earliest candidate from 20 ms before it to 60 ms after it that drum; a candidate can be
several (a clap with the kick). Five folds by the clips' sample folds, so a fold's samples are never heard in training. Each drum's threshold
is the one with the best F0.5 (precision counted twice) on the held-out folds. Prints, per drum, the share of its hits called and false calls
a minute (calls that are no hit of that drum), overall and by mic; then fits on everything and, with --save, writes the model with each
drum's thresholds.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mlp  # noqa: E402

args = sys.argv[1:]
opt = lambda name, d: args[args.index(name) + 1] if name in args else d  # noqa: E731
KINDS = ['kick', 'hat', 'snare', 'clap']
EARLY, LATE = 20, 60
HIDDEN = int(opt('--hidden', '32'))

rows = [r for path in args[0].split(',') for r in json.load(open(path))['results']]
X, Y, fold, clip, mic = [], [], [], [], []
seconds = 0.0
seconds_by_mic: dict[str, float] = {}
for ci, r in enumerate(rows):
    cands = [c for c in r['candidates'] if c['t'] >= 1000]
    ts = np.array([c['t'] for c in cands])
    labels = np.zeros((len(cands), len(KINDS)), dtype=int)
    for k, kind in enumerate(KINDS):
        for h in r['hits'][kind]:
            near = np.where((ts >= h * 1000 - EARLY) & (ts <= h * 1000 + LATE))[0]
            if len(near):
                labels[near[0], k] = 1
    X += [c['f'] for c in cands]
    Y += labels.tolist()
    fold += [r['fold']] * len(cands)
    clip += [ci] * len(cands)
    mic += [r['mic']] * len(cands)
    span = r['seconds'] - 1.0
    seconds += span
    seconds_by_mic[r['mic']] = seconds_by_mic.get(r['mic'], 0.0) + span
X, Y, fold, clip, mic = np.array(X), np.array(Y), np.array(fold), np.array(clip), np.array(mic)
truth = {kind: sum(len(r['hits'][kind]) for r in rows) for kind in KINDS}
truth_by_mic = {m: {kind: sum(len(r['hits'][kind]) for r in rows if r['mic'] == m) for kind in KINDS} for m in seconds_by_mic}
print(f'{len(rows)} clips, {len(X)} candidates, {seconds / 60:.0f} min; hits: ' + ', '.join(f'{k} {truth[k]}' for k in KINDS), file=sys.stderr)

pos = Y.mean(0)
pos_weight = (1 - pos) / np.maximum(pos, 1e-6)
P = np.zeros(Y.shape)
for f in range(5):
    tr, te = fold != f, fold == f
    P[te] = mlp.predict(mlp.fit(X[tr], Y[tr], HIDDEN, pos_weight), X[te])
    print(f'fold {f} done', file=sys.stderr)


def f_beta(p: np.ndarray, y: np.ndarray, thr: float, beta: float = 0.5) -> float:
    call = p > thr
    tp = np.sum(call & (y == 1))
    prec = tp / max(1, call.sum())
    rec = tp / max(1, (y == 1).sum())
    return (1 + beta ** 2) * prec * rec / max(1e-9, beta ** 2 * prec + rec)


thresholds = []
print('\nheld out (by sample fold)        caught   false/min   threshold')
for k, kind in enumerate(KINDS):
    grid = np.arange(0.3, 0.96, 0.025)
    thr = float(grid[np.argmax([f_beta(P[:, k], Y[:, k], t) for t in grid])])
    thresholds.append(round(thr, 3))
    call = P[:, k] > thr
    print(f'  {kind:6s}                         {100 * np.sum(call & (Y[:, k] == 1)) / truth[kind]:5.1f}%    {60 * np.sum(call & (Y[:, k] == 0)) / seconds:7.1f}     {thr:.3f}')
    for m in sorted(seconds_by_mic):
        sel = mic == m
        print(f'      {m:8s}                   {100 * np.sum(call & sel & (Y[:, k] == 1)) / max(1, truth_by_mic[m][kind]):5.1f}%    {60 * np.sum(call & sel & (Y[:, k] == 0)) / seconds_by_mic[m]:7.1f}')

model = mlp.fit(X, Y, HIDDEN, pos_weight)

# drumFeatures' order (drum-hits.ts).
BANDS = ['bass', 'lo', 'mid', 'hi', 'air']
per_band = lambda name: [f'{name}_{b}' for b in BANDS]  # noqa: E731
names = (per_band('rise') + per_band('level') + per_band('share') + ['size'] + per_band('overBed') + per_band('edge') + per_band('peakOverBed')
         + per_band('peakShare'))
assert len(names) == X.shape[1], f'{X.shape[1]} features in the eval files, {len(names)} named: replay the clips with drum-eval.mts again'
if '--save' in args:
    json.dump({'kinds': KINDS, 'features': names, **mlp.to_json(model), 'thresholds': thresholds}, open(opt('--save', ''), 'w'))
    print('saved', opt('--save', ''))
if '--parity' in args:
    idx = np.linspace(0, len(X) - 1, 4).astype(int)
    json.dump({'features': X[idx].round(6).tolist(), 'p': mlp.predict(model, X[idx]).round(6).tolist()}, open(opt('--parity', ''), 'w'))

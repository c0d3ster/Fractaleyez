"""Trains the riser detector (src/audioanalysis/riser-model.json) on drum-eval.mts --features output from drum-gen.py clips.

    python riser-train.py <eval.json>[,<eval.json>...] [--hidden 16] [--save riser-model.json] [--parity parity.json] [--real real-eval.json]
        [--real-negatives eval.json[,...]]

A 100 ms slot is a riser from 1 s into one to its end; the second around each edge is left out, the rest of every clip is not a riser. Five
folds by the clips' sample folds. Scored after the app's smoothing (a 400 ms follower) at 0.5: the share of risers shown at some point and of
riser time shown, and riser time shown a minute where there is none, overall and on each look-alike (a fade-in of the mix, steady noise, a
downlifter). With --real (drum-eval.mts on real songs whose truth lines carry Raveform sections) it prints the mean score per section kind.

--real-negatives (drum-eval.mts --riser-features on other real songs with Raveform sections) adds real music the synthetic clips do not
have: the middle of drops (from 4 s in to 8 s before the end) and the first 60% of breakdowns, where the kick and bass drop out and the highs
stand out (which the synthetic risers alone taught the model to read as rising), as not risers. Buildups and everything else are left out.
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mlp  # noqa: E402

args = sys.argv[1:]
opt = lambda name, d: args[args.index(name) + 1] if name in args else d  # noqa: E731
HIDDEN = int(opt('--hidden', '16'))
EDGE_S = 1.0
SMOOTH_MS = 400
SHOWN = 0.5

KEEP = ('id', 'type', 'fold', 'layers', 'risers', 'riser', 'riserFeatures', 'sections')


def load(path: str) -> list[dict]:
    # One file at a time, keeping only what this script reads (drum-eval.mts --features also carries every drum candidate).
    return [{k: r[k] for k in KEEP if k in r} for r in json.load(open(path))['results']]


rows = [r for path in args[0].split(',') for r in load(path)]
X, Y, fold, clip = [], [], [], []
for ci, r in enumerate(rows):
    for (t, _), f in zip(r['riser'], r['riserFeatures']):
        s = t / 1000
        label = 0
        for a, b in r['risers']:
            if a + EDGE_S <= s <= b:
                label = 1
            elif a <= s < a + EDGE_S or b < s <= b + EDGE_S:
                label = -1
        X.append(f)
        Y.append([label])
        fold.append(r['fold'])
        clip.append(ci)
n_synthetic = len(X)
if '--real-negatives' in args:
    for path in opt('--real-negatives', '').split(','):
        for r in load(path):
            ci = len(rows)
            rows.append(r)
            spans = [(sec['start'] + 4, sec['end'] - 8) for sec in r['sections'] if sec['name'] == 'drop'] +                     [(sec['start'], sec['start'] + 0.6 * (sec['end'] - sec['start'])) for sec in r['sections'] if sec['name'] == 'breakdown']
            for (t, _), f in zip(r['riser'], r['riserFeatures']):
                s = t / 1000
                if any(a <= s <= b for a, b in spans):
                    X.append(f)
                    Y.append([0])
                    fold.append(r['fold'])
                    clip.append(ci)
X, Y, fold, clip = np.array(X), np.array(Y), np.array(fold), np.array(clip)
print(f'{len(X) - n_synthetic} real negative slots', file=sys.stderr)
print(f'{len(rows)} clips, {len(X)} slots, {int((Y == 1).sum())} riser slots', file=sys.stderr)
pos = (Y == 1).sum() / max(1, (Y >= 0).sum())
pos_weight = np.array([(1 - pos) / pos])
P = np.zeros(len(X))
for f in range(5):
    tr, te = fold != f, fold == f
    P[te] = mlp.predict(mlp.fit(X[tr], Y[tr], HIDDEN, pos_weight), X[te])[:, 0]
    print(f'fold {f} done', file=sys.stderr)


def smooth(t_ms: np.ndarray, p: np.ndarray) -> np.ndarray:
    out, score, last = np.zeros(len(p)), 0.0, None
    for i, (t, v) in enumerate(zip(t_ms, p)):
        dt = 100 if last is None else t - last
        last = t
        score += (v - score) * (1 - np.exp(-dt / SMOOTH_MS))
        out[i] = score
    return out


caught = total = 0
riser_s = riser_shown_s = 0.0
false_s: dict[str, float] = defaultdict(float)
span_s: dict[str, float] = defaultdict(float)
for ci, r in enumerate(rows):
    if r.get('type') == 'real':
        continue
    sel = clip == ci
    t = np.array([s[0] for s in r['riser']])
    shown = smooth(t, P[sel]) > SHOWN
    lab = Y[sel, 0]
    kind = r['layers'].get('lookalike') if r['type'] == 'plain' else ('drums' if r['type'] == 'drums' else None)
    for a, b in r['risers']:
        inside = (t / 1000 >= a + EDGE_S) & (t / 1000 <= b)
        total += 1
        caught += bool(shown[inside].any())
        riser_s += inside.sum() * 0.1
        riser_shown_s += (shown & inside).sum() * 0.1
    none = lab == 0
    for key in ([kind] if kind else []) + ['ALL']:
        false_s[key] += (shown & none).sum() * 0.1
        span_s[key] += none.sum() * 0.1
print(f'\nheld out: risers shown {100 * caught / total:.1f}% ({caught}/{total}), riser time shown {100 * riser_shown_s / riser_s:.1f}%')
print('riser shown where there is none (seconds a minute):')
for key in sorted(span_s):
    print(f'  {key:10s} {60 * false_s[key] / max(1e-9, span_s[key]):5.1f}')

model = mlp.fit(X, Y, HIDDEN, pos_weight)
names = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'audioanalysis', 'riser-model.json')))['features']
if '--save' in args:
    json.dump({'features': names, **mlp.to_json(model)}, open(opt('--save', ''), 'w'))
    print('saved', opt('--save', ''))
if '--parity' in args:
    idx = np.linspace(0, len(X) - 1, 4).astype(int)
    json.dump({'features': X[idx].round(6).tolist(), 'p': mlp.predict(model, X[idx])[:, 0].round(6).tolist()}, open(opt('--parity', ''), 'w'))
if '--real' in args:
    real = json.load(open(opt('--real', '')))['results']
    by: dict[str, list] = defaultdict(list)
    for r in real:
        t = np.array([s[0] for s in r['riser']]) / 1000
        sc = smooth(t * 1000, np.array([s[1] for s in r['riser']]))
        for sec in r.get('sections', []):
            m = (t >= sec['start']) & (t < sec['end'])
            if m.any():
                by[sec['name']].append((sc[m].mean(), (sc[m] > SHOWN).mean()))
    print('\nreal songs (scored by the model the app has now): section   mean score   share of time shown')
    for name, v in sorted(by.items(), key=lambda kv: -np.mean([x[0] for x in kv[1]])):
        print(f'  {name:10s} {np.mean([x[0] for x in v]):.3f}   {100 * np.mean([x[1] for x in v]):5.1f}%   (n={len(v)})')

"""Trains the riser detector (src/audioanalysis/riser-model.json) on drum-eval.mts --features output from drum-gen.py clips.

    python riser-train.py <eval.json>[,<eval.json>...] [--hidden 16] [--features base|short|all|highs|<name,...>] [--save riser-model.json]
        [--parity parity.json] [--real-negatives eval.json[,...]] [--real-folds 0,1,2] [--real-every 3] [--buildups] [--buildup-weight 0.5]
        [--negative-weight 1] [--intros] [--cv full|quick|none]

A 100 ms slot is a riser from 1 s into one to its end; the second around each edge is left out, the rest of every clip is not a riser. Five
folds by the clips' sample folds (--cv quick holds out only the first, none skips it). Scored after the app's smoothing (a 400 ms follower)
at 0.5: the share of risers shown at some point and of riser time shown, and riser time shown a minute where there is none, overall and on
each look-alike (a fade-in of the mix, steady noise, a downlifter, a breakdown). Real songs are scored by section with riser-score.py.

--features picks the model's inputs from riser.ts's RISER_FEATURE_NAMES: base (the first model's 28), short (the 40 that read only the last
8 s), all (with the 32 s context), highs (only what does not move when the lows drop out: the mid, hi and air bands' own slopes in dB and how
they climb, nothing from the bass or the whole mix) or a list of names.

--real-negatives (drum-eval.mts --riser-features on real songs with Raveform sections) adds real music the synthetic clips do not have: the
middle of drops (from 4 s in to 8 s before the end) and the first 60% of breakdowns, where the kick and bass drop out and the highs stand
out, as not risers; --intros adds intros too (from 2 s in to 4 s before the end), and --negative-weight counts each real negative that
much. --buildups also takes the last half of each buildup as a riser, counted --buildup-weight as much as a synthetic one (a weak label: a
buildup is not always a riser), which makes the model a buildup detector more than a riser detector. Everything else in a real song is
left out. --real-folds keeps only songs in those Raveform folds (to hold some out for choosing settings); --real-every keeps every n-th
real slot (neighbouring slots are nearly the same, and all of them take a lot of memory).
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mlp  # noqa: E402
from riserlib import feature_names, smooth  # noqa: E402

args = sys.argv[1:]
opt = lambda name, d: args[args.index(name) + 1] if name in args else d  # noqa: E731
HIDDEN = int(opt('--hidden', '16'))
EDGE_S = 1.0
SHOWN = 0.5
REAL_EVERY = int(opt('--real-every', '1'))
BUILDUP_WEIGHT = float(opt('--buildup-weight', '0.5'))
NEGATIVE_WEIGHT = float(opt('--negative-weight', '1'))
REAL_FOLDS = {int(f) for f in opt('--real-folds', '').split(',') if f}
CV = opt('--cv', 'full')

ALL = feature_names()
LOWS = ('bass', 'lo', 'centroid', 'tilt', 'total')
PRESETS = {'base': ALL[:28], 'short': ALL[:40], 'all': ALL, 'highs': [n for n in ALL if not set(n.split('_')) & set(LOWS)]}
NAMES = PRESETS.get(opt('--features', 'base')) or opt('--features', '').split(',')
COLS = [ALL.index(n) for n in NAMES]
print(f'{len(NAMES)} inputs: {" ".join(NAMES)}', file=sys.stderr)

KEEP = ('id', 'type', 'fold', 'layers', 'risers', 'riser', 'riserFeatures', 'sections')


def load(path: str) -> list[dict]:
    # One file at a time, keeping only what this script reads (drum-eval.mts --features also carries every drum candidate).
    return [{k: r[k] for k in KEEP if k in r} for r in json.load(open(path))['results']]


rows = [r for path in args[0].split(',') for r in load(path)]
X, Y, weight, fold, clip = [], [], [], [], []
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
        Y.append(label)
        fold.append(r['fold'])
        clip.append(ci)
    r.pop('riserFeatures')
n_synthetic = len(X)
weight = [1.0] * n_synthetic
real_pos = 0
for path in opt('--real-negatives', '').split(',') if '--real-negatives' in args else []:
    for r in load(path):
        if REAL_FOLDS and r['fold'] not in REAL_FOLDS:
            continue
        ci = len(rows)
        rows.append({'type': 'real'})
        sections = r['sections']
        spans = [(sec['start'] + 4, sec['end'] - 8, 0) for sec in sections if sec['name'] == 'drop'] + \
            [(sec['start'], sec['start'] + 0.6 * (sec['end'] - sec['start']), 0) for sec in sections if sec['name'] == 'breakdown']
        if '--intros' in args:
            spans += [(sec['start'] + 2, sec['end'] - 4, 0) for sec in sections if sec['name'] == 'intro']
        if '--buildups' in args:
            spans += [((sec['start'] + sec['end']) / 2, sec['end'], 1) for sec in sections if sec['name'] == 'buildup']
        for i, ((t, _), f) in enumerate(zip(r['riser'], r['riserFeatures'])):
            if i % REAL_EVERY:
                continue
            s = t / 1000
            label = next((lab for a, b, lab in spans if a <= s <= b), None)
            if label is None:
                continue
            X.append(f)
            Y.append(label)
            weight.append(BUILDUP_WEIGHT if label == 1 else NEGATIVE_WEIGHT)
            # Real songs go in every training fold (5 is never held out): only the synthetic clips are scored here.
            fold.append(5)
            clip.append(ci)
            real_pos += label
X = np.array(X, dtype=np.float32)
Y, weight, fold, clip = np.array(Y)[:, None], np.array(weight), np.array(fold), np.array(clip)
Xm = X[:, COLS].astype(np.float64)
print(f'{len(X) - n_synthetic} real slots ({real_pos} buildup), {len(rows)} clips, {len(X)} slots, {int((Y == 1).sum())} riser slots', file=sys.stderr)


def fit(sel: np.ndarray) -> dict:
    pos = (weight[sel] * (Y[sel, 0] == 1)).sum() / max(1e-9, (weight[sel] * (Y[sel, 0] >= 0)).sum())
    return mlp.fit(Xm[sel], Y[sel], HIDDEN, np.array([(1 - pos) / pos]), sample_weight=weight[sel])


held = {'full': range(5), 'quick': range(1), 'none': range(0)}[CV]
P = np.full(len(X), np.nan)
for f in held:
    P[fold == f] = mlp.predict(fit(fold != f), Xm[fold == f])[:, 0]
    print(f'fold {f} done', file=sys.stderr)

if len(held):
    caught = total = 0
    riser_s = riser_shown_s = 0.0
    false_s: dict[str, float] = defaultdict(float)
    span_s: dict[str, float] = defaultdict(float)
    for ci, r in enumerate(rows):
        if r.get('type') == 'real' or r['fold'] not in held:
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

if '--save' in args or '--parity' in args:
    model = fit(np.ones(len(X), dtype=bool))
    if '--save' in args:
        json.dump({'features': NAMES, **mlp.to_json(model)}, open(opt('--save', ''), 'w'))
        print('saved', opt('--save', ''))
    if '--parity' in args:
        # Every input (as riserProbability takes them) and what this fit gives, for riser.fixture.json.
        idx = np.linspace(0, n_synthetic - 1, 4).astype(int)
        p = mlp.predict(model, Xm[idx])[:, 0]
        json.dump({'features': X[idx].astype(np.float64).round(6).tolist(), 'p': p.round(6).tolist()}, open(opt('--parity', ''), 'w'))

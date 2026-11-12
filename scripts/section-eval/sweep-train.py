"""Trains the sweep detector (packages/beatsense/src/risers/sweep-model.json) on sweep-eval.mts --features output: synthetic clips (drum-gen.py
--spectrum) and real songs with SSME labels, and scores it on both out of fold.

    python sweep-train.py <clips eval.json>[,...] [--real eval.json[,...] --gt gt.json] [--hidden 16] [--real-every 2] [--features <names>]
        [--negative-weight 1] [--save sweep-model.json] [--parity parity.json] [--scores out.json]

Synthetic clips: a slot is a sweep from 1 s into a riser to its end, the second around each edge is left out, the rest is not. Real songs
(SSME, id mod 5 folds): the full-energy part after each drop (from 4 s in, up to 30 s or the next build or break) and the first 60% of
each break are not sweeps; builds and the rest are left out, since nobody has marked where in them a riser plays. Five fits, fit f
holding out synthetic sample fold f and SSME fold f, so every clip and song is scored by a model that never saw it.

Printed: on held-out clips, risers shown (the 400 ms follower over 0.5) and time shown where there is none; on held-out songs, by SSME
section, the share of time shown and the mean score, builds shown at some point, and the AUC of the last half of builds against breaks.
--scores writes each held-out song's smoothed scores per slot, for riser-section-features.py's comparison.
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mlp  # noqa: E402
from riserlib import smooth  # noqa: E402

args = sys.argv[1:]
opt = lambda name, d: args[args.index(name) + 1] if name in args else d  # noqa: E731
HIDDEN = int(opt('--hidden', '16'))
REAL_EVERY = int(opt('--real-every', '2'))
NEG_WEIGHT = float(opt('--negative-weight', '1'))
EDGE_S = 1.0
FOLDS = 5
DROP_FROM_S, DROP_MAX_S = 4.0, 30.0


def sweep_names() -> list[str]:
    import subprocess
    code = "import { SWEEP_FEATURE_NAMES } from './sweep.ts'; console.log(JSON.stringify(SWEEP_FEATURE_NAMES))"
    audio = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'beatsense', 'src', 'risers')
    out = subprocess.run(['npx', 'tsx', '--eval', code], cwd=audio, capture_output=True, text=True, check=True, shell=os.name == 'nt')
    return json.loads(out.stdout.strip().splitlines()[-1])


ALL = sweep_names()
NAMES = opt('--features', '').split(',') if '--features' in args else ALL
COLS = [ALL.index(n) for n in NAMES]


def load(paths: str) -> list[dict]:
    return [r for p in paths.split(',') for r in json.load(open(p))['results']]


def real_spans(truth: dict) -> list[tuple[float, float, int]]:
    """(from s, to s, label) for an SSME song: 0 for not a sweep."""
    starts = sorted(truth['build_start'] + truth['break_start'])
    spans = []
    for d in truth['drop']:
        nxt = min([s for s in starts if s > d] + [d + DROP_MAX_S])
        spans.append((d + DROP_FROM_S, min(nxt, d + DROP_MAX_S), 0))
    spans += [(s, s + 0.6 * (e - s), 0) for s, e in zip(truth['break_start'], truth['break_end'])]
    return spans


X, Y, W, syn_fold, song_fold, clip = [], [], [], [], [], []
clips = load(args[0])
for ci, r in enumerate(clips):
    for (t, _), f in zip(r['sweep'], r['sweepFeatures']):
        s = t / 1000
        label = 0
        for a, b in r['risers']:
            if a + EDGE_S <= s <= b:
                label = 1
            elif a <= s < a + EDGE_S or b < s <= b + EDGE_S:
                label = -1
        X.append(f); Y.append(label); W.append(1.0); syn_fold.append(r['fold']); song_fold.append(-1); clip.append(ci)
    r.pop('sweepFeatures')
n_syn = len(X)
songs = [{**r, 'cond': c} for c, path in enumerate(opt('--real', '').split(',')) if '--real' in args for r in load(path)]
gt = json.load(open(opt('--gt', ''))) if songs else {}
real_feats: list[np.ndarray] = []
for si, r in enumerate(songs):
    feats = np.array(r.pop('sweepFeatures'), dtype=np.float32)
    real_feats.append(feats)
    t = np.array([s[0] for s in r['sweep']]) / 1000
    for a, b, lab in real_spans(gt[r['id']]):
        for i in np.where((t >= a) & (t <= b))[0][::REAL_EVERY]:
            X.append(feats[i]); Y.append(lab); W.append(NEG_WEIGHT); syn_fold.append(-1); song_fold.append(int(r['id']) % FOLDS); clip.append(-1)
X = np.array(X, dtype=np.float32)[:, COLS].astype(np.float64)
Y, W, syn_fold, song_fold, clip = np.array(Y)[:, None], np.array(W), np.array(syn_fold), np.array(song_fold), np.array(clip)
print(f'{len(NAMES)} inputs, {n_syn} clip slots ({int((Y[:n_syn] == 1).sum())} sweep), {len(X) - n_syn} real negative slots', file=sys.stderr)


def fit(sel: np.ndarray) -> dict:
    pos = (W[sel] * (Y[sel, 0] == 1)).sum() / max(1e-9, (W[sel] * (Y[sel, 0] >= 0)).sum())
    return mlp.fit(X[sel], Y[sel], HIDDEN, np.array([(1 - pos) / pos]), sample_weight=W[sel])


P_syn = np.zeros(n_syn)
song_scores: dict[str, np.ndarray] = {}
for f in range(FOLDS):
    model = fit((syn_fold != f) & (song_fold != f))
    held = syn_fold[:n_syn] == f
    P_syn[held] = mlp.predict(model, X[:n_syn][held])[:, 0]
    for r, feats in zip(songs, real_feats):
        if int(r['id']) % FOLDS == f:
            t = np.array([s[0] for s in r['sweep']], dtype=float)
            song_scores[f"{r['cond']}/{r['id']}"] = smooth(t, mlp.predict(model, feats[:, COLS].astype(np.float64))[:, 0]) if len(t) else np.zeros(0)
    print(f'fold {f} done', file=sys.stderr)

caught = total = 0
false_s: dict[str, float] = defaultdict(float)
span_s: dict[str, float] = defaultdict(float)
for ci, r in enumerate(clips):
    sel = clip[:n_syn] == ci
    t = np.array([s[0] for s in r['sweep']]) / 1000
    shown = smooth(t * 1000, P_syn[sel]) > 0.5
    lab = Y[:n_syn][sel, 0]
    for a, b in r['risers']:
        total += 1
        caught += bool(shown[(t >= a + EDGE_S) & (t <= b)].any())
    kind = r['layers'].get('lookalike') if r['type'] == 'plain' else r['type']
    for key in (kind, 'ALL'):
        false_s[key] += (shown & (lab == 0)).sum() * 0.1
        span_s[key] += (lab == 0).sum() * 0.1
print(f'\nclips, held out: risers shown {100 * caught / max(1, total):.1f}% ({caught}/{total})')
print('shown where there is none (seconds a minute): ' + ', '.join(f'{k} {60 * false_s[k] / max(1e-9, span_s[k]):.1f}' for k in sorted(span_s)))


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    if not len(pos) or not len(neg):
        return float('nan')
    ranks = np.concatenate([pos, neg]).argsort(kind='stable').argsort() + 1
    return float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


if songs:
    for cond in sorted({r['cond'] for r in songs}):
        by: dict[str, list] = defaultdict(list)
        late, brk, built = [], [], []
        for r in [r for r in songs if r['cond'] == cond]:
            sc = song_scores[f"{cond}/{r['id']}"]
            t = np.array([s[0] for s in r['sweep']]) / 1000
            truth = gt[r['id']]
            drops = [(a, b) for a, b, _ in real_spans({**truth, 'break_start': [], 'break_end': []})]
            for name, spans in (('build', list(zip(truth['build_start'], truth['build_end']))),
                                ('break', list(zip(truth['break_start'], truth['break_end']))), ('drop', drops)):
                for a, b in spans:
                    m = (t >= a) & (t < b)
                    if not m.any():
                        continue
                    by[name].append((sc[m].mean(), (sc[m] > 0.5).mean()))
                    if name == 'build':
                        built.append(bool((sc[m] > 0.5).any()))
                        late.append(sc[(t >= (a + b) / 2) & (t < b)])
                    if name == 'break':
                        brk.append(sc[m])
        print(f'\nsongs, held out (SSME, condition {cond}): section   shown   mean score')
        for name in ('build', 'break', 'drop'):
            v = by[name]
            print(f'  {name:6s} {100 * np.mean([x[1] for x in v]):5.1f}%  {np.mean([x[0] for x in v]):.3f}  (n={len(v)})')
        print(f'  builds shown at some point {100 * np.mean(built):.1f}%, AUC last half of builds against breaks '
              f'{auc(np.concatenate(late), np.concatenate(brk)):.3f}')
if songs and '--scores' in args:
    json.dump({k: v.round(4).tolist() for k, v in song_scores.items()}, open(opt('--scores', ''), 'w'))

if '--save' in args or '--parity' in args:
    model = fit(np.ones(len(X), dtype=bool))
    if '--save' in args:
        json.dump({'features': NAMES, **mlp.to_json(model)}, open(opt('--save', ''), 'w'))
        print('saved', opt('--save', ''))
    if '--parity' in args:
        idx = np.linspace(0, n_syn - 1, 4).astype(int)
        full = np.zeros((len(idx), len(ALL)))
        full[:, COLS] = X[idx]
        json.dump({'features': full.round(6).tolist(), 'p': mlp.predict(model, X[idx])[:, 0].round(6).tolist()}, open(opt('--parity', ''), 'w'))

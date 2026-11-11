"""Scores a riser model on real songs by Raveform section, from drum-eval.mts --riser-features output (features per slot), the way the app
shows it: the model's probability, the 400 ms follower, shown above 0.5.

    python riser-score.py <model.json> <eval.json>[,<eval.json>...] [--from-eval] [--folds 5]

Per section kind (buildup, breakdown, drop, ...): the share of its time shown (averaged over sections), the mean score, and for buildups the
share shown at some point and the share of their last half shown. Then how well the score ranks the last half of buildups above breakdowns
and above drops (AUC over slots, 0.5 is chance), which does not depend on the 0.5 threshold. --from-eval reads the probabilities drum-eval.mts wrote (the model the
app had when it ran) instead of running <model.json> on the features. --folds scores only songs in those Raveform folds.
"""
import json
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from riserlib import load_model, predict, smooth  # noqa: E402

args = sys.argv[1:]
folds = {int(f) for f in args[args.index('--folds') + 1].split(',')} if '--folds' in args else None
model = None if '--from-eval' in args else load_model(args[0])
by: dict[str, list] = defaultdict(list)
caught = []
# Smoothed scores in the last half of buildups, in breakdowns and in drops, for how well the score ranks them apart, whatever the threshold.
late: list[np.ndarray] = []
other: dict[str, list[np.ndarray]] = defaultdict(list)
for path in args[1].split(','):
    for r in json.load(open(path))['results']:
        if folds is not None and r['fold'] not in folds:
            continue
        t = np.array([s[0] for s in r['riser']], dtype=float)
        p = np.array([s[1] for s in r['riser']]) if model is None else predict(model, np.array(r['riserFeatures'], dtype=float))
        sc = smooth(t, p)
        ts = t / 1000
        for sec in r.get('sections', []):
            m = (ts >= sec['start']) & (ts < sec['end'])
            if not m.any():
                continue
            by[sec['name']].append((sc[m].mean(), (sc[m] > 0.5).mean()))
            if sec['name'] in ('breakdown', 'drop'):
                other[sec['name']].append(sc[m])
            if sec['name'] == 'buildup':
                half = (ts >= (sec['start'] + sec['end']) / 2) & (ts < sec['end'])
                caught.append((bool((sc[m] > 0.5).any()), (sc[half] > 0.5).mean() if half.any() else 0.0))
                late.append(sc[half])


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    ranks = np.concatenate([pos, neg]).argsort(kind='stable').argsort() + 1
    return float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


late_all = np.concatenate(late)
aucs = {name: auc(late_all, np.concatenate(v)) for name, v in other.items()}
row = {name: (100 * np.mean([x[1] for x in v]), np.mean([x[0] for x in v]), len(v)) for name, v in by.items()}
for name in ('buildup', 'breakdown', 'drop', 'intro', 'outro', 'cooldown'):
    if name in row:
        share, mean, n = row[name]
        print(f'  {name:10s} shown {share:5.1f}%  mean {mean:.3f}  (n={n})')
print(f'  buildups shown at some point {100 * np.mean([c[0] for c in caught]):.1f}%, last half shown {100 * np.mean([c[1] for c in caught]):.1f}%')
print(f"  AUC, last half of buildups against breakdowns {aucs['breakdown']:.3f}, against drops {aucs['drop']:.3f}")
print(json.dumps({'auc_breakdown': round(aucs['breakdown'], 3), 'auc_drop': round(aucs['drop'], 3), 'buildup': round(row['buildup'][0], 1), 'breakdown': round(row['breakdown'][0], 1), 'drop': round(row['drop'][0], 1),
                  'buildup_any': round(100 * np.mean([c[0] for c in caught]), 1), 'mean_buildup': round(row['buildup'][1], 3),
                  'mean_breakdown': round(row['breakdown'][1], 3), 'mean_drop': round(row['drop'][1], 3)}))

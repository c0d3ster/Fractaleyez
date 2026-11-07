"""Fits the rhythm models (src/audioanalysis/rhythm-model.json) behind nameRhythm's confidence.

    python rhythm-fit.py <sets.json> [--export ../../src/audioanalysis/rhythm-model.json]

<sets.json> as for rhythm-names.py (features from rhythm-features.mts, with the level features). Two logistic regressions over the
standardized features (every band's hits per beat and repeat shares, the hats' phases after the kick, and the bass, lo and mid levels'
sustain, crest and envelope autocorrelation at wobble rates):
  main  classes four on the floor, breakbeat (drum and bass, breaks) and half time (dubstep), without the BPM, so the name says what the
        drums do rather than guessing the genre from the tempo. Half time is a class here so dubstep-like readings have somewhere to go.
  half  dubstep against every other genre with a proxy, only over readings at 130 to 150 BPM: the half time name, gated on that tempo.
Fitted on the tune halves only (Raveform folds 0 to 3, the even md5 half of GiantSteps tempo and MTG key, clean and laptop): main on every
fourth reading with each set and class weighted equally, half on every second reading in its tempo range, weighted the same way.

Prints, on the held-out halves, the precision and share of readings at a range of confidence thresholds (unheld; rhythm-names.py scores
the shipped label, held). The thresholds in rhythm-pattern.ts were chosen from the tune half the same way.
"""
import importlib.util
import json
import os
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression

CLASSES = ['four on the floor', 'breakbeat', 'half time']
STEP = 4
HALF_STEP = 2
HALF_BPM = [130, 150]


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location('rhythm_names', os.path.join(here, 'rhythm-names.py'))
    names = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(names)
    d = names.load(json.load(open(sys.argv[1])))
    X, cols = d['X'], d['columns']
    features = [n for n in cols if n not in ('t', 'bpm')]
    Xf = X[:, [cols.index(f) for f in features]]
    has_tempo = np.isfinite(X[:, cols.index('bpm')])
    y = np.array([CLASSES.index(p) if p in CLASSES else -1 for p in d['proxy']])
    tune = has_tempo & (y >= 0) & (d['half'] == 'tune')
    weight = np.zeros(len(y))
    for s in set(d['set']):
        for k in range(len(CLASSES)):
            m = tune & (d['set'] == s) & (y == k)
            if m.any():
                weight[m] = 1.0 / m.sum()
    rows = np.flatnonzero(tune)[::STEP]
    mean, scale = Xf[rows].mean(0), Xf[rows].std(0) + 1e-6
    Z = np.nan_to_num((Xf - mean) / scale)
    model = LogisticRegression(max_iter=3000, C=1.0)
    model.fit(Z[rows], y[rows], sample_weight=weight[rows] * 1e6)
    P = model.predict_proba(Z)
    test = has_tempo & (d['half'] == 'test')
    for s in sorted(set(d['set']) - {'ballroom'}):
        scored = (d['half'] == 'test') & (d['set'] == s) & (d['proxy'] != '')
        for k, name in enumerate(CLASSES[:2]):
            for thr in (0.6, 0.7, 0.8, 0.85, 0.9, 0.95):
                shown = test & scored & (P[:, k] >= thr)
                print(f'{s:10s} {name:18s} {thr:.2f}  precision {(y[shown] == k).mean():.3f}  shown {shown.sum() / scored.sum():.3f}')
    bpm = X[:, cols.index('bpm')]
    gate = has_tempo & (bpm >= HALF_BPM[0]) & (bpm < HALF_BPM[1]) & (d['proxy'] != '')
    yh = (d['proxy'] == 'half time').astype(int)
    tune_h = gate & (d['half'] == 'tune')
    wh = np.zeros(len(yh))
    for s in set(d['set']):
        for k in (0, 1):
            m = tune_h & (d['set'] == s) & (yh == k)
            if m.any():
                wh[m] = 1.0 / m.sum()
    rows_h = np.flatnonzero(tune_h)[::HALF_STEP]
    mean_h, scale_h = Xf[rows_h].mean(0), Xf[rows_h].std(0) + 1e-6
    Zh = np.nan_to_num((Xf - mean_h) / scale_h)
    half = LogisticRegression(max_iter=4000, C=1.0)
    half.fit(Zh[rows_h], yh[rows_h], sample_weight=wh[rows_h] / wh[rows_h].mean())
    ph = np.where(gate, half.predict_proba(Zh)[:, 1], 0)
    for s in sorted(set(d['set']) - {'ballroom', 'raveform'}):
        scored = (d['half'] == 'test') & (d['set'] == s) & (d['proxy'] != '')
        for thr in (0.7, 0.8, 0.9):
            shown = scored & (ph >= thr)
            print(f'{s:10s} {"half time (gated)":18s} {thr:.2f}  precision {yh[shown].mean():.3f}  shown {shown.sum() / scored.sum():.3f}')
    if '--export' in sys.argv:
        out = dict(
            main=dict(classes=CLASSES, features=features, mean=mean.round(5).tolist(), scale=scale.round(5).tolist(),
                      coef=model.coef_.round(4).tolist(), intercept=model.intercept_.round(4).tolist()),
            half=dict(features=features, mean=mean_h.round(5).tolist(), scale=scale_h.round(5).tolist(),
                      coef=half.coef_[0].round(4).tolist(), intercept=round(float(half.intercept_[0]), 4), bpm=HALF_BPM),
        )
        json.dump(out, open(sys.argv[sys.argv.index('--export') + 1], 'w'))


if __name__ == '__main__':
    main()

"""Chooses each drum's threshold on real music: the beat proxies of drum-real-score.py, on some Raveform folds, checked on the others.

    python drum-real-score.py truth <segments.json> <levels dir>
    tsx drum-candidates.mts <levels dir> <prefix-k> --shard k/n            # each shard
    python drum-real-thresholds.py <prefix-0,...> <beats dir> [--model drum-hit-model.json] [--tune-folds 0,1,2,3,4,5] [--beta 0.5]
        [--write out-model.json]

In the drops of four-on-the-floor tracks, per drum and threshold: the share of calls on the drum's grid (a precision proxy: kicks on a beat,
snares and claps on 2 or 4, hats on a beat or an off-beat) and the share of its grid points with a call (a recall proxy: every beat, 2 and 4,
the off-beats). The threshold is the one with the best F-beta of the two on the tune folds (snare and clap together, as their grid is the
same); the other folds report it against the model's own thresholds. --write saves the model with the chosen thresholds.

The proxies are not drum labels: a real drop has off-beat kicks, sixteenth hats and kick-less bars, so neither share reaches 100%. Calls are
the candidates over the threshold, without DrumHits' merge of one drum's calls within 45 ms, which is rare at these thresholds.
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drum_real as R  # noqa: E402

KICK, HAT, SNARE, CLAP = range(4)
ON_GRID_MS = {'kick': 50, 'hat': 30, 'backbeat': 50}
TARGET_MS = 50
GRID = np.round(np.arange(0.3, 0.96, 0.025), 3)


def max_near(t: np.ndarray, p: np.ndarray, targets: np.ndarray, ms: float) -> np.ndarray:
    """For each target, the highest p of the candidates within `ms` of it (0 when none)."""
    order = np.argsort(t)
    t, p = t[order], p[order]
    lo, hi = np.searchsorted(t, targets - ms), np.searchsorted(t, targets + ms, side='right')
    return np.array([p[a:b].max() if b > a else 0.0 for a, b in zip(lo, hi)])


def collect(c: R.Candidates, beats_dir: str) -> dict:
    """Per drum: in-drop calls' (p, on grid, fold) and grid points' (best p near, fold); and drop minutes per fold."""
    out = {name: {'p': [], 'on': [], 'fold': [], 'target': [], 'target_fold': []} for name in ('kick', 'hat', 'backbeat')}
    minutes: dict[int, float] = {}
    for i, track in enumerate(c.tracks):
        g = R.grid(beats_dir, track)
        if g is None:
            continue
        fold = int(track.get('fold', -1))
        mine = c.track == i
        t, p = c.t[mine], c.p[mine]
        inside = g.in_drop(t)
        steps = np.diff(g.beats)
        minutes[fold] = minutes.get(fold, 0.0) + steps[g.drop[:-1]].sum() / 60000
        off = g.off_beats[g.drop[:-1]]
        backbeat = g.beats[(g.place == 2) | (g.place == 4)]
        grids = {
            'kick': (p[:, KICK], R.distance(t, g.beats) <= ON_GRID_MS['kick'], max_near(t, p[:, KICK], g.beats[g.drop], TARGET_MS)),
            'hat': (p[:, HAT], R.distance(t, np.sort(np.concatenate([g.beats, g.off_beats]))) <= ON_GRID_MS['hat'],
                    max_near(t, p[:, HAT], off, TARGET_MS)),
            'backbeat': (p[:, [SNARE, CLAP]], R.distance(t, backbeat) <= ON_GRID_MS['backbeat'],
                         np.stack([max_near(t, p[:, k], g.beats[g.drop & ((g.place == 2) | (g.place == 4))], TARGET_MS) for k in (SNARE, CLAP)], 1)),
        }
        for name, (prob, on, best) in grids.items():
            out[name]['p'].append(prob[inside])
            out[name]['on'].append(on[inside])
            out[name]['fold'].append(np.full(inside.sum(), fold))
            out[name]['target'].append(best)
            out[name]['target_fold'].append(np.full(len(best), fold))
    return {name: {k: np.concatenate(v) for k, v in d.items()} for name, d in out.items()} | {'minutes': minutes}


def shares(d: dict, folds: np.ndarray, thr: tuple[float, ...], minutes: float) -> tuple[float, float, float]:
    """On-grid share of calls, share of grid points called, calls a minute of drop."""
    sel, tsel = np.isin(d['fold'], folds), np.isin(d['target_fold'], folds)
    p, best = d['p'][sel], d['target'][tsel]
    if p.ndim == 1:
        call, hit = p > thr[0], best > thr[0]
    else:
        call = (p[:, 0] > thr[0]) | (p[:, 1] > thr[1])
        hit = (best[:, 0] > thr[0]) | (best[:, 1] > thr[1])
    precision = d['on'][sel][call].mean() if call.any() else 0.0
    return float(precision), float(hit.mean()) if len(hit) else 0.0, float(call.sum() / max(minutes, 1e-9))


def f_beta(precision: float, recall: float, beta: float) -> float:
    return (1 + beta ** 2) * precision * recall / max(1e-9, beta ** 2 * precision + recall)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('prefixes')
    ap.add_argument('beats')
    ap.add_argument('--model', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'audioanalysis', 'drum-hit-model.json'))
    ap.add_argument('--tune-folds', default='0,1,2,3,4,5')
    ap.add_argument('--beta', type=float, default=0.5)
    ap.add_argument('--write')
    args = ap.parse_args()
    model = json.load(open(args.model))
    current = model['thresholds']
    data = collect(R.load(args.prefixes), args.beats)
    tune = np.array([int(f) for f in args.tune_folds.split(',')])
    test = np.array([f for f in data['minutes'] if f not in tune])
    minutes = lambda folds: sum(data['minutes'].get(int(f), 0.0) for f in folds)  # noqa: E731
    chosen = list(current)
    print(f'drops of four-on-the-floor tracks: {minutes(tune):.0f} min to tune on (folds {",".join(map(str, tune))}), '
          f'{minutes(test):.0f} min to check on (folds {",".join(map(str, sorted(test)))})')
    print('                    threshold   on grid   grid called   calls a minute    (checked on the other folds)')
    for name, kinds in (('kick', [KICK]), ('hat', [HAT]), ('backbeat', [SNARE, CLAP])):
        d = data[name]
        options = [(t,) for t in GRID] if len(kinds) == 1 else [(a, b) for a in GRID for b in GRID]
        best = max(options, key=lambda thr: f_beta(*shares(d, tune, thr, minutes(tune))[:2], args.beta))
        for label, thr in (('now', tuple(current[k] for k in kinds)), ('chosen', best)):
            p, r, rate = shares(d, test, thr, minutes(test))
            print(f'  {name:9s} {label:7s} {"/".join(f"{v:.3f}" for v in thr):>11s}   {100 * p:6.1f}%   {100 * r:9.1f}%   {rate:12.0f}')
        for k, v in zip(kinds, best):
            chosen[k] = float(v)
    if args.write:
        json.dump({**model, 'thresholds': chosen}, open(args.write, 'w'))
        print('saved', args.write, chosen)


if __name__ == '__main__':
    main()

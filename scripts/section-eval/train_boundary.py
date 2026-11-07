"""Trains the song change detector on playlists (dump-playlists.mts) and scores it out of fold, then adds it to a model file.

    python train_boundary.py <playlists dir>[,<dir>...] <single-song features dir> [--export model.json] [--export-folds <fold models dir>]

Positive slots are the first seconds of each next song (after a gap) or the second half of a crossfade and a few seconds after it.
Out-of-fold scores are printed for the decoder the tracker uses (fire over THRESHOLD, not within MIN_SONG_S of the last change,
or after SILENCE_S of silence), on the playlists (found and invented changes) and on the single songs (every change is wrong).
"""
import json
import os
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

SLOT = 0.25
FOLDS = 5
PARAMS = dict(max_iter=150, learning_rate=0.08, max_leaf_nodes=15, min_samples_leaf=100, l2_regularization=1.0)
MIN_SONG_S = 45
SILENCE_S = 6
THRESHOLDS = (0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1.01)


def labels(meta: dict) -> tuple[np.ndarray, np.ndarray]:
    n = meta['slots']
    t = (np.arange(n) + 1) * SLOT
    y = np.zeros(n, dtype=np.int64)
    ignore = np.zeros(n, dtype=bool)
    fade = meta['crossfadeSeconds']
    for s in meta['starts'][1:]:
        lo, hi = (s + 0.5, s + 5) if fade == 0 else (s + fade / 2, s + fade + 4)
        ignore |= (t >= s - 10) & (t <= s + fade + 10)
        y[(t >= lo) & (t <= hi)] = 1
    return y, ignore & (y == 0)


def decode(p: np.ndarray, silence: np.ndarray, threshold: float) -> list[float]:
    changes, start, armed = [], 0.0, False
    for i in range(len(p)):
        t = (i + 1) * SLOT
        if silence[i] >= SILENCE_S:
            armed = True
        if armed and silence[i] == 0:
            changes.append(t); start = t; armed = False
        elif p[i] >= threshold and t - start >= MIN_SONG_S:
            changes.append(t); start = t
    return changes


def main() -> None:
    pl_dirs = sys.argv[1].split(',')
    single = sys.argv[2]
    names = json.load(open(os.path.join(single, 'names.json')))
    sil = names.index('silenceNow')
    xs, ys, ig, fold, metas = [], [], [], [], []
    for d in pl_dirs:
        for i, meta in enumerate(json.load(open(os.path.join(d, 'playlists.json')))):
            x = np.fromfile(os.path.join(d, f'pl{i}.feat'), dtype='<f4').reshape(-1, len(names))
            y, ignore = labels({**meta, 'slots': len(x)})
            xs.append(x); ys.append(y); ig.append(ignore); fold.append(np.full(len(x), meta['fold'])); metas.append({**meta, 'slots': len(x)})
    X, Y, IG, FO = map(np.concatenate, (xs, ys, ig, fold))
    lengths = np.cumsum([0] + [len(x) for x in xs])
    print(f'{len(xs)} playlists, {len(X)} slots, {int(Y.sum())} positive')

    singles = {k[:-5]: np.fromfile(os.path.join(single, k), dtype='<f4').reshape(-1, len(names)) for k in os.listdir(single) if k.endswith('.feat')}
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from train import export_hgb
    fold_dir = sys.argv[sys.argv.index('--export-folds') + 1] if '--export-folds' in sys.argv else None
    p_pl = np.zeros(len(X))
    p_single: dict[str, np.ndarray] = {}
    for f in range(FOLDS):
        train = (FO != f) & ~IG
        model = HistGradientBoostingClassifier(**PARAMS, random_state=0).fit(X[train], Y[train])
        if fold_dir:
            # Each fold's section model gets the boundary model that did not see that fold, for the TypeScript check.
            path = os.path.join(fold_dir, f'fold{f}.json')
            data = json.load(open(path))
            data['boundary'] = export_hgb(model)
            json.dump(data, open(path, 'w'), separators=(',', ':'))
        test = FO == f
        p_pl[test] = model.predict_proba(X[test])[:, 1]
        for k, x in singles.items():
            if int(k) % FOLDS == f:
                p_single[k] = model.predict_proba(x)[:, 1]

    for threshold in THRESHOLDS:
        found = total = invented = 0
        hours = 0.0
        by_join: dict[str, list[int]] = {}
        for j, meta in enumerate(metas):
            a, b = lengths[j], lengths[j + 1]
            changes = decode(p_pl[a:b], X[a:b, sil], threshold)
            used = set()
            join = 'crossfade' if meta['crossfadeSeconds'] else f"gap{meta['gapSeconds']:g}"
            for s in meta['starts'][1:]:
                total += 1
                hit = [c for c in range(len(changes)) if c not in used and s - 5 <= changes[c] <= s + meta['crossfadeSeconds'] + 25]
                if hit:
                    used.add(hit[0]); found += 1
                by_join.setdefault(join, []).append(1 if hit else 0)
            invented += len(changes) - len(used)
            hours += (b - a) * SLOT / 3600
        false_single = sum(len(decode(p, singles[k][:, sil], threshold)) for k, p in p_single.items())
        joins = ' '.join(f'{k}:{np.mean(v):.2f}' for k, v in sorted(by_join.items()))
        print(f'threshold {threshold}: found {found}/{total} ({found / total:.2f}), invented {invented / hours:.2f}/h on playlists,'
              f' {false_single / len(p_single):.3f} false changes per single song | {joins}')

    if '--export' in sys.argv:
        path = sys.argv[sys.argv.index('--export') + 1]
        model = HistGradientBoostingClassifier(**PARAMS, random_state=0).fit(X[~IG], Y[~IG])
        data = json.load(open(path))
        data['boundary'] = export_hgb(model)
        json.dump(data, open(path, 'w'), separators=(',', ':'))
        print('added the boundary model to', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()

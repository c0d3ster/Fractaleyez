"""Trains the section model on expert labels, with track-level cross-validation, and exports it for section-model.ts.

    python train.py <features dir>[,<features dir>...] <gt.json>[,<gt.json>...] <out dir> [--export model.json] [--export-folds]
        [--folds folds.json] [--no-grid] [--dir-weights 1,1,1,0.5]

Stage 1, per 250 ms slot: other / build / break, from the features alone.
Stage 2, per slot: "a drop just happened" (within the last second or so), from the features plus a short memory of stage 1
(how much build and break it saw over the last 4, 10 and 20 s), trained on stage 1's out-of-fold output so it learns from the
same imperfect stage 1 it will get at run time.
Every number printed is out of fold (a track is never scored by a model that saw it), and the out-of-fold probabilities are
saved to <out dir>/oof.npz for tuning the decoder (decode.py).
Several feature dirs (clean, room, laptop) are pooled for training, each track's copies kept in the same fold.
A track's fold is its id mod 5, or its entry in --folds ({ id: fold }, how Raveform's tracks join SSME's five folds). Several label files
are merged (SSME's and Raveform's mapped ones, raveform-sections.py). --no-grid trains on the features before the grid columns (the model
before the grid); --dir-weights weighs each feature dir's slots in training (to balance a large set against a small one).
"""
import json
import os
import sys

import numpy as np
from scipy.ndimage import maximum_filter1d
from sklearn.ensemble import HistGradientBoostingClassifier

SLOT = 0.25
FOLDS = 5
DROP_POS = (-0.5, 1.25)
DROP_IGNORE = (-2.0, 3.0)
STAGE1 = dict(max_iter=120, learning_rate=0.08, max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=1.0)
STAGE2 = dict(max_iter=120, learning_rate=0.08, max_leaf_nodes=15, min_samples_leaf=100, l2_regularization=1.0)
MEMORY_S = (4, 10, 20)


def labels_for(truth: dict, n: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    t = (np.arange(n) + 1) * SLOT
    y = np.zeros(n, dtype=np.int64)
    for s, e in zip(truth['break_start'], truth['break_end']):
        y[(t > s) & (t <= e)] = 2
    for s, e in zip(truth['build_start'], truth['build_end']):
        y[(t > s) & (t <= e)] = 1
    drop = np.zeros(n, dtype=np.int64)
    ignore = np.zeros(n, dtype=bool)
    for d in truth['drop']:
        ignore |= (t >= d + DROP_IGNORE[0]) & (t <= d + DROP_IGNORE[1])
        drop[(t >= d + DROP_POS[0]) & (t <= d + DROP_POS[1])] = 1
    ignore &= drop == 0
    return y, drop, ignore


def memory(p: np.ndarray, starts: np.ndarray) -> np.ndarray:
    """Per slot: the mean and max of stage-1 build and break probability over the last few seconds, within each track (causal)."""
    out = []
    for a, b in zip(starts[:-1], starts[1:]):
        seg = p[a:b]
        cols = []
        for seconds in MEMORY_S:
            w = int(seconds / SLOT)
            for c in (1, 2):
                x = seg[:, c]
                csum = np.concatenate([[0], np.cumsum(x)])
                idx = np.arange(len(x))
                lo = np.maximum(0, idx - w + 1)
                cols.append((csum[idx + 1] - csum[lo]) / (idx + 1 - lo))
                mx = maximum_filter1d(x, size=w, origin=(w - 1) // 2, mode='nearest')
                cols.append(mx)
        out.append(np.stack(cols, axis=1))
    return np.concatenate(out)


def load(dirs: list[str], gt: dict, grid: bool = True) -> dict:
    names = json.load(open(os.path.join(dirs[0], 'names.json')))
    width = len(names)
    if not grid and 'gridLocked' in names:
        names = names[:names.index('gridLocked')]
    xs, ys, drops, ignores, groups, ids, conds = [], [], [], [], [], [], []
    keys = sorted(k for k, v in gt.items() if v['drop'] or v['build_start'] or v['break_start'])
    for c, d in enumerate(dirs):
        for g, k in enumerate(keys):
            path = os.path.join(d, f'{k}.feat')
            if not os.path.exists(path):
                continue
            x = np.fromfile(path, dtype='<f4').reshape(-1, width)[:, :len(names)]
            y, drop, ignore = labels_for(gt[k], len(x))
            xs.append(x); ys.append(y); drops.append(drop); ignores.append(ignore)
            groups.append(np.full(len(x), g)); ids.append(k); conds.append(c)
    lengths = [len(x) for x in xs]
    return {
        'names': names, 'X': np.concatenate(xs), 'y': np.concatenate(ys), 'drop': np.concatenate(drops),
        'ignore': np.concatenate(ignores), 'groups': np.concatenate(groups), 'ids': ids, 'conds': conds,
        'starts': np.concatenate([[0], np.cumsum(lengths)]),
    }


def groups_to_track(data: dict) -> np.ndarray:
    """For every slot, the index of the track copy it belongs to."""
    return np.repeat(np.arange(len(data['ids'])), np.diff(data['starts']))


def slot_f1(y: np.ndarray, pred: np.ndarray, c: int) -> tuple[float, float, float]:
    tp = np.sum((y == c) & (pred == c)); p = tp / max(1, np.sum(pred == c)); r = tp / max(1, np.sum(y == c))
    return p, r, 0 if p + r == 0 else 2 * p * r / (p + r)


def export_hgb(model: HistGradientBoostingClassifier) -> dict:
    """Trees as flat node lists: an internal node is [feature, threshold, left, right], a leaf is [value]. Missing values never occur."""
    trees = []
    for iteration in model._predictors:
        for predictor in iteration:
            trees.append([[float(f"{float(n['value']):.6g}")] if n['is_leaf'] else
                          [int(n['feature_idx']), float(f"{float(n['num_threshold']):.7g}"), int(n['left']), int(n['right'])]
                          for n in predictor.nodes])
    per_iter = len(model._predictors[0])
    return {'baseline': [float(v) for v in np.ravel(model._baseline_prediction)], 'treesPerIteration': per_iter, 'trees': trees}


def main() -> None:
    dirs = sys.argv[1].split(',')
    gt = {k: v for path in sys.argv[2].split(',') for k, v in json.load(open(path)).items()}
    out = sys.argv[3]
    os.makedirs(out, exist_ok=True)
    data = load(dirs, gt, grid='--no-grid' not in sys.argv)
    fold_of = json.load(open(sys.argv[sys.argv.index('--folds') + 1])) if '--folds' in sys.argv else {}
    dir_weights = [float(w) for w in sys.argv[sys.argv.index('--dir-weights') + 1].split(',')] if '--dir-weights' in sys.argv else [1.0] * len(dirs)
    weight = np.array(dir_weights)[np.array(data['conds'])][groups_to_track(data)]
    X, y, groups, starts = data['X'], data['y'], data['groups'], data['starts']
    print(f"{len(data['ids'])} track copies, {len(X)} slots, classes {np.bincount(y)}")

    # The fold of a track is its id mod 5, the same everywhere (the song change detector's playlists and the TypeScript check use it too).
    track_fold = np.array([fold_of.get(k, int(k) % FOLDS if k.isdigit() else 0) for k in data['ids']])
    slot_fold = track_fold[groups_to_track(data)]
    folds = [(np.where(slot_fold != f)[0], np.where(slot_fold == f)[0]) for f in range(FOLDS)]
    export_folds = '--export-folds' in sys.argv
    fold_models: list[dict] = [{} for _ in folds]
    p1 = np.zeros((len(X), 3))
    for f, (train, test) in enumerate(folds):
        model = HistGradientBoostingClassifier(**STAGE1, random_state=0).fit(X[train], y[train], sample_weight=weight[train])
        p1[test] = model.predict_proba(X[test])
        fold_models[f]['stage1'] = model
    pred = p1.argmax(axis=1)
    for c, name in ((1, 'build'), (2, 'break')):
        print(f'stage1 {name}: P %.3f R %.3f F1 %.3f (argmax, out of fold)' % slot_f1(y, pred, c))

    X2 = np.concatenate([X, p1, memory(p1, starts)], axis=1)
    keep = ~data['ignore']
    p2 = np.zeros(len(X))
    for f, (train, test) in enumerate(folds):
        train = train[keep[train]]
        model = HistGradientBoostingClassifier(**STAGE2, random_state=0).fit(X2[train], data['drop'][train], sample_weight=weight[train])
        p2[test] = model.predict_proba(X2[test])[:, 1]
        fold_models[f]['stage2'] = model
    # The grid columns go along (when the features have them) so the decoder's phrase-line prior can be tuned on the same output.
    grid_cols = {}
    if 'nearLine1' in data['names']:
        grid_cols = {name: X[:, data['names'].index(name)] for name in ('gridLocked', 'beatsIntoPhrase', 'phraseConfidence', 'downbeatConfidence')}
    np.savez_compressed(os.path.join(out, 'oof.npz'), p1=p1, p2=p2, starts=starts, ids=np.array(data['ids']), conds=np.array(data['conds']), **grid_cols)
    print('saved out-of-fold probabilities')

    def bundle(m1: HistGradientBoostingClassifier, m2: HistGradientBoostingClassifier) -> dict:
        return {'features': data['names'], 'memorySeconds': list(MEMORY_S), 'stage1': export_hgb(m1), 'stage2': export_hgb(m2)}

    if export_folds:
        # One model per fold and which fold each track was held out in, so the TypeScript port can be scored out of fold too.
        for f in range(FOLDS):
            json.dump(bundle(fold_models[f]['stage1'], fold_models[f]['stage2']), open(os.path.join(out, f'fold{f}.json'), 'w'), separators=(',', ':'))
        print('exported fold models')

    if '--export' in sys.argv:
        path = sys.argv[sys.argv.index('--export') + 1]
        # Stage 2 is trained on out-of-fold stage 1 output (what it will see at run time), and shipped with stage 1 trained on everything.
        m1 = HistGradientBoostingClassifier(**STAGE1, random_state=0).fit(X, y, sample_weight=weight)
        m2 = HistGradientBoostingClassifier(**STAGE2, random_state=0).fit(X2[keep], data['drop'][keep], sample_weight=weight[keep])
        json.dump(bundle(m1, m2), open(path, 'w'), separators=(',', ':'))
        print('exported', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()

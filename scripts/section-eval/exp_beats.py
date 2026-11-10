"""Which beats should the section model count? Trains the model (as train.py does, out of fold) with its beat columns read from different
onset band selections, and scores each through the decoder (decode.py).

    python exp_beats.py <features dirs> <beats dirs> <gt.json>[,<gt.json>] <out dir> [--folds folds.json] [--tune] [--variants a,b,...] [--mismatch]

<features dirs> and <beats dirs> are comma-separated and paired (clean, room, laptop): dump-features.mts and dump-beats.mts over the same
levels. The four beat columns (beats2, beats8, beatTrend, beatReturn) are recomputed from a beats column exactly as section-features.ts
computes them, so `base` reproduces the dumped features (checked).

Variants:
  base          merged beats from the default selection (bass + hi), what the app was trained on
  sel_<bits>    merged beats from another selection, e.g. sel_11111 (all five bands)
  none          no beat columns at all
  own           each band's own onsets (5 x 4 columns) instead of the merged beat: nothing depends on the HUD's toggles
  base+own      the merged default beat and each band's own onsets
  <variant>#<n> the same with another random seed (the boosters' early stopping holds out a random 10%), to see how much is noise

--mismatch: the base model, scored on features whose beat columns come from another selection (what the app does today when the HUD's
band toggles are changed from the default). --tune: tune the decoder per variant (coordinate search, slower); otherwise every variant uses
the decoder tuned on base. --folds: { key: fold } for keys that are not numbers (Raveform's, from raveform-sections.py --fold-mod 5).
"""
import json
import os
import sys

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from train import STAGE1, STAGE2, FOLDS, labels_for, memory  # noqa: E402
import decode  # noqa: E402

BEAT_COLS = ('beats2', 'beats8', 'beatTrend', 'beatReturn')
BANDS = ('bass', 'lo', 'mid', 'hi', 'air')


def mean_of(c: np.ndarray, frm: int, to: int) -> np.ndarray:
    """SectionFeatures.meanOf over a slot ring, for every slot at once: the mean of the counts `frm` to `to` slots back, clipped."""
    n = len(c)
    s = np.arange(n)
    size = np.minimum(s + 1, 480)
    csum = np.concatenate([[0.0], np.cumsum(c)])
    end = np.minimum(to, size)
    # Slots s-frm .. s-end+1 (inclusive): csum[s-frm+1] - csum[s-end+1].
    hi = np.clip(s - frm + 1, 0, n)
    lo = np.clip(s - end + 1, 0, n)
    with np.errstate(invalid='ignore', divide='ignore'):
        mean = (csum[hi] - csum[lo]) / (end - frm)
    fallback = c[np.clip(s - np.minimum(frm, size - 1), 0, n - 1)]
    return np.where(end <= frm, fallback, mean)


def beat_columns(c: np.ndarray) -> np.ndarray:
    beats2 = mean_of(c, 0, 8) * 4
    beats8 = mean_of(c, 0, 32) * 4
    trend = beats2 - mean_of(c, 32, 64) * 4
    ret = (mean_of(c, 0, 4) - mean_of(c, 8, 24)) * 4
    return np.stack([beats2, beats8, trend, ret], axis=1)


def load(feat_dirs: list[str], beat_dirs: list[str], gt: dict) -> dict:
    names = json.load(open(os.path.join(feat_dirs[0], 'names.json')))
    columns = json.load(open(os.path.join(beat_dirs[0], 'columns.json')))
    keys = sorted(k for k, v in gt.items() if v['drop'] or v['build_start'] or v['break_start'])
    xs, bs, ys, drops, ignores, ids, conds = [], [], [], [], [], [], []
    for c, (fd, bd) in enumerate(zip(feat_dirs, beat_dirs)):
        for k in keys:
            fp, bp = os.path.join(fd, f'{k}.feat'), os.path.join(bd, f'{k}.beats')
            if not (os.path.exists(fp) and os.path.exists(bp)):
                continue
            x = np.fromfile(fp, dtype='<f4').reshape(-1, len(names))
            b = np.fromfile(bp, dtype='<f4').reshape(-1, len(columns)).astype(np.float64)
            n = min(len(x), len(b))
            y, drop, ignore = labels_for(gt[k], n)
            xs.append(x[:n]); bs.append(b[:n]); ys.append(y); drops.append(drop); ignores.append(ignore); ids.append(k); conds.append(c)
    lengths = [len(x) for x in xs]
    return {'names': names, 'columns': columns, 'xs': xs, 'bs': bs, 'y': np.concatenate(ys), 'drop': np.concatenate(drops),
            'ignore': np.concatenate(ignores), 'ids': ids, 'conds': np.array(conds), 'starts': np.concatenate([[0], np.cumsum(lengths)])}


def build_x(data: dict, variant: str) -> np.ndarray:
    """The feature matrix for a variant: the dumped features with the beat columns replaced, dropped or extended."""
    names, columns = data['names'], data['columns']
    idx = [names.index(n) for n in BEAT_COLS]
    keep = [i for i in range(len(names)) if i not in idx]
    out = []
    for x, b in zip(data['xs'], data['bs']):
        parts = [x[:, keep]]
        for part in variant.split('+'):
            if part == 'base':
                parts.append(beat_columns(b[:, columns.index('beat_10010')]))
            elif part.startswith('sel_'):
                parts.append(beat_columns(b[:, columns.index(f'beat_{part[4:]}')]))
            elif part == 'own':
                parts += [beat_columns(b[:, columns.index(f'own_{band}')]) for band in BANDS]
            elif part != 'none':
                raise ValueError(part)
        out.append(np.concatenate(parts, axis=1).astype(np.float32))
    return np.concatenate(out)


def check_base(data: dict) -> None:
    """The recomputed default beat columns must equal what section-features.ts wrote."""
    idx = [data['names'].index(n) for n in BEAT_COLS]
    worst = 0.0
    for x, b in zip(data['xs'][:40], data['bs'][:40]):
        worst = max(worst, float(np.max(np.abs(x[:, idx] - beat_columns(b[:, data['columns'].index('beat_10010')])))))
    print(f'base check: largest difference from the dumped beat columns {worst:.2e}', flush=True)
    assert worst < 1e-3, 'the beats file does not line up with the features'


def folds_of(data: dict, fold_of: dict) -> list[tuple[np.ndarray, np.ndarray]]:
    track_fold = np.array([fold_of[k] if k in fold_of else int(k) % FOLDS for k in data['ids']])
    slot_fold = np.repeat(track_fold, np.diff(data['starts']))
    return [(np.where(slot_fold != f)[0], np.where(slot_fold == f)[0]) for f in range(FOLDS)]


def fit(data: dict, X: np.ndarray, folds: list, seed: int = 0) -> list[tuple]:
    """Out-of-fold stage 1 then stage 2, as train.py. Returns the fold models (and the out-of-fold output it trained stage 2 on)."""
    p1 = np.zeros((len(X), 3))
    m1s = []
    for train, test in folds:
        m = HistGradientBoostingClassifier(**STAGE1, random_state=seed).fit(X[train], data['y'][train])
        p1[test] = m.predict_proba(X[test])
        m1s.append(m)
    X2 = np.concatenate([X, p1.astype(np.float32), memory(p1, data['starts']).astype(np.float32)], axis=1)
    keep = ~data['ignore']
    m2s = []
    for train, _ in folds:
        train = train[keep[train]]
        m2s.append(HistGradientBoostingClassifier(**STAGE2, random_state=seed).fit(X2[train], data['drop'][train]))
    return list(zip(m1s, m2s))


def predict(data: dict, X: np.ndarray, folds: list, models: list) -> dict:
    p1 = np.zeros((len(X), 3))
    for (_, test), (m1, _) in zip(folds, models):
        p1[test] = m1.predict_proba(X[test])
    X2 = np.concatenate([X, p1.astype(np.float32), memory(p1, data['starts']).astype(np.float32)], axis=1)
    p2 = np.zeros(len(X))
    for (_, test), (_, m2) in zip(folds, models):
        p2[test] = m2.predict_proba(X2[test])[:, 1]
    return {'p1': p1, 'p2': p2, 'starts': data['starts'], 'ids': np.array(data['ids']), 'conds': data['conds']}


def tune(oof: dict, gt: dict, cfg: dict) -> dict:
    space = {'smooth': [0.5, 1, 2, 3], 'buildup_in': [0.3, 0.35, 0.4, 0.45, 0.5], 'buildup_out': [0.15, 0.2, 0.25, 0.3, 0.35],
             'break_in': [0.3, 0.35, 0.4, 0.45, 0.5], 'break_out': [0.15, 0.2, 0.25, 0.3, 0.35], 'enter': [2, 4, 6, 8],
             'drop': [0.3, 0.4, 0.5, 0.6, 0.7, 0.8], 'drop_ctx': [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5], 'ctx_s': [1, 2, 4, 6],
             'refractory': [6, 10, 15, 20, 30], 'hold': [0, 3, 6, 10]}
    best = decode.score(oof, gt, cfg)['mean_F1']
    for _ in range(2):
        for key, values in space.items():
            for v in values:
                trial = {**cfg, key: v}
                m = decode.score(oof, gt, trial)['mean_F1']
                if m > best + 1e-4:
                    best, cfg = m, trial
    return cfg


def report(name: str, oof: dict, gt: dict, cfg: dict) -> dict:
    row = {'variant': name}
    for c, label in [(None, 'all'), (0, 'clean'), (1, 'room'), (2, 'laptop')]:
        if c is not None and c not in set(oof['conds'].tolist()):
            continue
        r = decode.score(oof, gt, cfg, c)
        row[label] = {k: round(r[k], 4) for k in ('mean_F1', 'drop_F1', 'build_F1', 'break_F1', 'anticipation')}
    a = row['all']
    print(f"{name:<16} mean {a['mean_F1']:.4f}  drop {a['drop_F1']:.4f}  build {a['build_F1']:.4f}  break {a['break_F1']:.4f}  "
          + '  '.join(f"{k} {row[k]['mean_F1']:.4f}" for k in ('clean', 'room', 'laptop') if k in row), flush=True)
    return row


def main() -> None:
    feat_dirs, beat_dirs = sys.argv[1].split(','), sys.argv[2].split(',')
    gt = {k: v for path in sys.argv[3].split(',') for k, v in json.load(open(path)).items()}
    fold_of = json.load(open(sys.argv[sys.argv.index('--folds') + 1])) if '--folds' in sys.argv else {}
    out = sys.argv[4]
    os.makedirs(out, exist_ok=True)
    data = load(feat_dirs, beat_dirs, gt)
    print(f"{len(data['ids'])} track copies, {data['starts'][-1]} slots", flush=True)
    check_base(data)
    folds = folds_of(data, fold_of)
    variants = sys.argv[sys.argv.index('--variants') + 1].split(',') if '--variants' in sys.argv else \
        ['base', 'none', 'sel_11111', 'own', 'base+own']
    results = []

    X_base = build_x(data, 'base')
    base_models = fit(data, X_base, folds)
    base_oof = predict(data, X_base, folds, base_models)
    del X_base
    cfg_path = os.path.join(out, 'cfg-base.json')
    if os.path.exists(cfg_path):
        base_cfg = json.load(open(cfg_path))
    else:
        base_cfg = tune(base_oof, gt, dict(decode.DEFAULT))
        json.dump(base_cfg, open(cfg_path, 'w'))
    print('decoder tuned on base:', json.dumps(base_cfg), flush=True)
    for v in variants:
        if v == 'base':
            oof = base_oof
        else:
            name, _, seed = v.partition('#')
            X = build_x(data, name)
            oof = predict(data, X, folds, fit(data, X, folds, int(seed or 0)))
            del X
        cfg = tune(oof, gt, dict(base_cfg)) if '--tune' in sys.argv and v != 'base' else base_cfg
        results.append({**report(v, oof, gt, cfg), 'cfg': cfg})

    if '--mismatch' in sys.argv:
        print('\nbase model, beat columns from another selection at run time (the HUD toggles changed):', flush=True)
        for bits in [c[5:] for c in data['columns'] if c.startswith('beat_') and c != 'beat_10010']:
            oof = predict(data, build_x(data, f'sel_{bits}'), folds, base_models)
            results.append({**report(f'base@{bits}', oof, gt, base_cfg), 'mismatch': True})
    json.dump(results, open(os.path.join(out, 'results.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()

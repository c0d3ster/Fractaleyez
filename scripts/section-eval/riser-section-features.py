"""Adds riser scores to section features, to test whether they help the section model (train.py, decode.py).

    python riser-section-features.py <features dir> <riser eval.json>[,...] <out dir> [<name=model.json>[,...]] [--no-grid]
        [--sweep scores.json --cond 0]

<riser eval.json> is drum-eval.mts --riser-features over the same songs' levels. For each model, three columns per 250 ms section slot
(row k ends at (k + 1) * 0.25 s), causal like the app: the smoothed score (the HUD's 400 ms follower) at the slot's end, its mean over the
last 4 s and its highest over the last 10 s. Writes <out>/<id>.feat with the columns appended and <out>/names.json. --no-grid drops
the grid columns first (the shipped model is trained without them; train.py's own --no-grid would also drop the appended columns).
--sweep adds the same three columns for the sweep detector, from sweep-train.py --scores (each song's out-of-fold smoothed score per
100 ms slot from 0.5 s, keyed <condition>/<id>; --cond picks the condition).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from riserlib import load_model, predict, smooth  # noqa: E402

SLOT_S = 0.25
RISER_SLOT_S = 0.1
MEAN_S = 4
MAX_S = 10


def window(values: np.ndarray, slots: int, how: str) -> np.ndarray:
    """The mean or max of each value and the slots - 1 before it."""
    out = np.empty(len(values))
    for i in range(len(values)):
        seg = values[max(0, i - slots + 1): i + 1]
        out[i] = seg.mean() if how == 'mean' else seg.max()
    return out


def main() -> None:
    feat_dir, evals, out = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
    specs = sys.argv[4] if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else ''
    models = [(spec.split('=')[0], load_model(spec.split('=')[1])) for spec in specs.split(',') if spec]
    sweep = json.load(open(sys.argv[sys.argv.index('--sweep') + 1])) if '--sweep' in sys.argv else None
    cond = sys.argv[sys.argv.index('--cond') + 1] if '--cond' in sys.argv else '0'
    os.makedirs(out, exist_ok=True)
    names = json.load(open(os.path.join(feat_dir, 'names.json')))
    keep = names.index('gridLocked') if '--no-grid' in sys.argv and 'gridLocked' in names else len(names)
    suffixes = ('', 'Mean4s', 'Max10s')
    extra = [f'riser{name}{suffix}' for name, _ in models for suffix in suffixes] + ([f'sweep{suffix}' for suffix in suffixes] if sweep else [])
    json.dump(names[:keep] + extra, open(os.path.join(out, 'names.json'), 'w'))
    done = 0
    for path in evals:
        for r in json.load(open(path))['results']:
            src = os.path.join(feat_dir, f"{r['id']}.feat")
            if not os.path.exists(src):
                continue
            x = np.fromfile(src, dtype='<f4').reshape(-1, len(names))
            t = np.array([s[0] for s in r['riser']], dtype=float)
            feats = np.array(r['riserFeatures'], dtype=float)
            # The riser slot each section slot sees: the last one closed by the section slot's end.
            ends = (np.arange(len(x)) + 1) * SLOT_S * 1000
            at = np.searchsorted(t, ends, side='right') - 1
            cols: list[np.ndarray] = []

            def add(score: np.ndarray, at: np.ndarray) -> None:
                per = [score, window(score, int(MEAN_S / RISER_SLOT_S), 'mean'), window(score, int(MAX_S / RISER_SLOT_S), 'max')]
                cols.extend(np.where(at >= 0, v[np.clip(at, 0, max(0, len(v) - 1))] if len(v) else 0, 0) for v in per)

            for _, model in models:
                add(smooth(t, predict(model, feats)) if len(t) else np.zeros(0), at)
            if sweep is not None:
                score = np.array(sweep[f"{cond}/{r['id']}"])
                sweep_t = 500 + 100 * np.arange(len(score))
                add(score, np.searchsorted(sweep_t, ends, side='right') - 1)
            np.concatenate([x[:, :keep], np.stack(cols, axis=1)], axis=1).astype('<f4').tofile(os.path.join(out, f"{r['id']}.feat"))
            done += 1
    print(f'{done} songs, {len(extra)} riser columns', file=sys.stderr)


if __name__ == '__main__':
    main()

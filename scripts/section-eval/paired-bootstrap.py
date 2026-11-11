"""Paired bootstrap over songs: how sure a difference in section F1 between two train.py runs is.

    python paired-bootstrap.py <oof a.npz> <oof b.npz> <gt.json> [--cfg '{...}' | --cfg-from decode-grid.log] [--n 2000] [--seed 0]

Both runs are decoded with the same decoder settings (decode.py's defaults, or --cfg). Each song's counts (drop hits, drops called, drops
marked; build and break slots shown, marked and both) are kept, all of its mic copies together, and the songs are resampled with
replacement; each draw's F1 for a and b come from the same songs. Prints the difference (b - a) in drop, build, break and mean F1 on all
songs, its 95% interval, and the share of draws where b is not better.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decode import DEFAULT, SLOT, decode, line_offsets  # noqa: E402
from score import f1, mask, match  # noqa: E402

KEYS = ('drop_tp', 'drop_pred', 'drop_true', 'build_o', 'build_p', 'build_t', 'break_o', 'break_p', 'break_t')


def counts(path: str, gt: dict, cfg: dict) -> dict[str, np.ndarray]:
    """Per song (summed over its copies), the counts behind each F1."""
    oof = dict(np.load(path))
    starts, ids = oof['starts'], oof['ids']
    grid = oof if 'beatsIntoPhrase' in oof else None
    out: dict[str, np.ndarray] = {}
    for j, k in enumerate(ids):
        a, b = starts[j], starts[j + 1]
        labels, drops = decode(oof['p1'][a:b], oof['p2'][a:b], cfg, line_offsets(grid, a, b, cfg))
        truth = gt[k]
        hits, _ = match(drops, truth['drop'])
        sec = np.array(labels)
        row = [hits, len(drops), len(truth['drop'])]
        for key, label in (('build', 'buildup'), ('break', 'break')):
            mt = mask(list(zip(truth[f'{key}_start'], truth[f'{key}_end'])), len(sec))
            mp = sec == label
            row += [int(np.sum(mt & mp)), int(np.sum(mp)), int(np.sum(mt))]
        out[str(k)] = out.get(str(k), np.zeros(len(KEYS))) + np.array(row, dtype=float)
    return out


def scores(c: np.ndarray) -> np.ndarray:
    """drop, build, break and mean F1 from summed counts (KEYS order)."""
    def pair(o: float, p: float, t: float) -> float:
        return f1(o / max(1, p), o / max(1, t))
    d, bu, br = pair(c[0], c[1], c[2]), pair(c[3], c[4], c[5]), pair(c[6], c[7], c[8])
    return np.array([d, bu, br, (d + bu + br) / 3])


def main() -> None:
    a_path, b_path, gt_path = sys.argv[1:4]
    gt = json.load(open(gt_path))
    cfg = dict(DEFAULT)
    if '--cfg' in sys.argv:
        cfg.update(json.loads(sys.argv[sys.argv.index('--cfg') + 1]))
    if '--cfg-from' in sys.argv:
        best = [line for line in open(sys.argv[sys.argv.index('--cfg-from') + 1]) if line.startswith('best ')][-1]
        cfg.update(json.loads(best[5:]))
    n = int(sys.argv[sys.argv.index('--n') + 1]) if '--n' in sys.argv else 2000
    rng = np.random.default_rng(int(sys.argv[sys.argv.index('--seed') + 1]) if '--seed' in sys.argv else 0)
    ca, cb = counts(a_path, gt, cfg), counts(b_path, gt, cfg)
    songs = sorted(set(ca) & set(cb))
    A = np.stack([ca[s] for s in songs])
    B = np.stack([cb[s] for s in songs])
    full = scores(B.sum(0)) - scores(A.sum(0))
    draws = np.empty((n, 4))
    for i in range(n):
        pick = rng.integers(len(songs), size=len(songs))
        draws[i] = scores(B[pick].sum(0)) - scores(A[pick].sum(0))
    print(f'{len(songs)} songs, {n} draws, b - a:')
    for j, name in enumerate(('drop F1', 'build F1', 'break F1', 'mean F1')):
        lo, hi = np.percentile(draws[:, j], [2.5, 97.5])
        print(f'  {name:9s} {full[j]:+.4f}  95% [{lo:+.4f}, {hi:+.4f}]  b not better in {100 * np.mean(draws[:, j] <= 0):.1f}% of draws')


if __name__ == '__main__':
    main()

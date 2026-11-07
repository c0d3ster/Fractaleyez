"""Tunes the causal decoder (the state machine in section-model.ts) on train.py's out-of-fold probabilities, and scores it.

    python decode.py <oof.npz> <gt.json> [--grid]

The decoder, per slot (all causal):
  - stage 1 probabilities are smoothed (exponential, SMOOTH_S)
  - buildup / break: entered after ENTER_SLOTS slots over their enter threshold, left once under the leave threshold
  - a drop fires when stage 2 crosses its threshold, at most once per DROP_REFRACTORY_S; the section is then drop until the
    next buildup or break
  - the phrase-line prior (when the out-of-fold file carries the grid columns): while the grid is locked and its phrase confidence
    is at least line_conf, the drop threshold moves by line_on within line_w beats of an 8-bar line and by line_off elsewhere
"""
import itertools
import json
import sys

import numpy as np

SLOT = 0.25


def line_offsets(grid: dict | None, a: int, b: int, cfg: dict) -> np.ndarray:
    """Per slot, how much the phrase-line prior moves the drop threshold."""
    out = np.zeros(b - a)
    if grid is None or (cfg.get('line_on', 0) == 0 and cfg.get('line_off', 0) == 0):
        return out
    into = grid['beatsIntoPhrase'][a:b]
    near = np.minimum(into, 32 - into) <= cfg['line_w']
    active = (grid['gridLocked'][a:b] > 0) & (grid['phraseConfidence'][a:b] >= cfg['line_conf'])
    out[active & near] = cfg['line_on']
    out[active & ~near] = cfg['line_off']
    return out


def decode(p1: np.ndarray, p2: np.ndarray, cfg: dict, offsets: np.ndarray | None = None) -> tuple[list[str], list[float]]:
    alpha = 1 - np.exp(-SLOT / cfg['smooth'])
    s = np.zeros(3)
    section = 'groove'
    run = {'buildup': 0, 'break': 0}
    last_drop = -1e9
    last_setup = -1e9
    labels, drops = [], []
    for i in range(len(p1)):
        t = (i + 1) * SLOT
        s = s + (p1[i] - s) * alpha if i else p1[i].copy()
        # While a buildup or break is showing (or just ended), a drop needs its own threshold (more evidence, as tuned).
        if section in ('buildup', 'break'):
            last_setup = t
        threshold = cfg['drop_ctx'] if t - last_setup <= cfg['ctx_s'] else cfg['drop']
        if offsets is not None:
            threshold += offsets[i]
        if p2[i] >= threshold and t - last_drop >= cfg['refractory'] and t >= cfg['min_t']:
            drops.append(t)
            last_drop = t
            section = 'drop'
            run = {'buildup': 0, 'break': 0}
            labels.append(section)
            continue
        hold = t - last_drop < cfg['hold']
        for name, c in (('buildup', 1), ('break', 2)):
            run[name] = run[name] + 1 if s[c] >= cfg[f'{name}_in'] and not hold else 0
        if section in ('buildup', 'break'):
            c = 1 if section == 'buildup' else 2
            if s[c] < cfg[f'{section}_out']:
                section = 'drop' if t - last_drop < 120 and last_drop > 0 else 'groove'
        if section not in ('buildup', 'break'):
            best = max(('buildup', 'break'), key=lambda n: s[1 if n == 'buildup' else 2])
            if run[best] >= cfg['enter']:
                section = best
        elif section == 'break' and run['buildup'] >= cfg['enter'] and s[1] > s[2]:
            section = 'buildup'
        elif section == 'buildup' and run['break'] >= cfg['enter'] and s[2] > s[1] + cfg['switch']:
            section = 'break'
        labels.append(section)
    return labels, drops


def score(oof: dict, gt: dict, cfg: dict, cond: int | None = None, keys: set | None = None) -> dict:
    from score import match, mask, f1, ANTICIPATION_S
    starts, ids, conds = oof['starts'], oof['ids'], oof['conds']
    grid = oof if 'beatsIntoPhrase' in oof else None
    tp = n_pred = n_true = 0
    lat = []
    agg = {k: [0, 0, 0] for k in ('build', 'break')}
    anticipated = total = 0
    for j, k in enumerate(ids):
        if (cond is not None and conds[j] != cond) or (keys is not None and k not in keys):
            continue
        a, b = starts[j], starts[j + 1]
        labels, drops = decode(oof['p1'][a:b], oof['p2'][a:b], cfg, line_offsets(grid, a, b, cfg))
        truth = gt[k]
        h, l = match(drops, truth['drop'])
        tp += h; n_pred += len(drops); n_true += len(truth['drop']); lat += l
        sec = np.array(labels)
        n = len(sec)
        for key, label in (('build', 'buildup'), ('break', 'break')):
            mt = mask(list(zip(truth[f'{key}_start'], truth[f'{key}_end'])), n)
            mp = sec == label
            agg[key][0] += int(np.sum(mt & mp)); agg[key][1] += int(np.sum(mp)); agg[key][2] += int(np.sum(mt))
        build = sec == 'buildup'
        for d in truth['drop']:
            lo, hi = int(max(0, d - ANTICIPATION_S) / SLOT), int(d / SLOT) + 2
            if hi <= n:
                total += 1
                anticipated += bool(build[lo:hi].any())
    p, r = tp / max(1, n_pred), tp / max(1, n_true)
    out = {'drop_P': p, 'drop_R': r, 'drop_F1': f1(p, r), 'drop_latency_median': float(np.median(lat)) if lat else None}
    for key in ('build', 'break'):
        o, pr, tr = agg[key]
        kp, kr = o / max(1, pr), o / max(1, tr)
        out[f'{key}_P'], out[f'{key}_R'], out[f'{key}_F1'] = kp, kr, f1(kp, kr)
    out['anticipation'] = anticipated / max(1, total)
    out['mean_F1'] = (out['drop_F1'] + out['build_F1'] + out['break_F1']) / 3
    return out


DEFAULT = {'smooth': 0.5, 'buildup_in': 0.3, 'buildup_out': 0.2, 'break_in': 0.3, 'break_out': 0.25, 'enter': 2, 'switch': 0.15,
           'drop': 0.3, 'refractory': 6, 'hold': 0, 'min_t': 8, 'drop_ctx': 0.5, 'ctx_s': 1,
           'line_w': 2, 'line_on': 0, 'line_off': 0, 'line_conf': 0}


def main() -> None:
    oof = dict(np.load(sys.argv[1]))
    gt = {k: v for path in sys.argv[2].split(',') for k, v in json.load(open(path)).items()}
    cfg = dict(DEFAULT)
    if '--cfg' in sys.argv:
        cfg.update(json.loads(sys.argv[sys.argv.index('--cfg') + 1]))
    # --score-on a.json: tune and score only on the tracks in that label file (the rest of the out-of-fold file is ignored).
    keys = set(json.load(open(sys.argv[sys.argv.index('--score-on') + 1]))) if '--score-on' in sys.argv else None
    if '--line' in sys.argv:
        # The phrase-line prior alone, on top of the decoder as it is (a full grid over its four knobs).
        best = score(oof, gt, cfg, keys=keys)['mean_F1']
        print(f'without the prior mean_F1={best:.4f}', flush=True)
        base = dict(cfg)
        for w, on, off, conf in itertools.product([1, 2, 4], [0, -0.05, -0.1, -0.15], [0, 0.05, 0.1, 0.2, 0.3], [0, 0.1, 0.2, 0.3]):
            if on == 0 and off == 0:
                continue
            trial = {**base, 'line_w': w, 'line_on': on, 'line_off': off, 'line_conf': conf}
            m = score(oof, gt, trial, keys=keys)['mean_F1']
            if m > best + 1e-4:
                best, cfg = m, trial
                print(f'line_w={w} line_on={on} line_off={off} line_conf={conf} mean_F1={best:.4f}', flush=True)
        print('best', json.dumps(cfg))
    if '--grid' in sys.argv:
        # Coordinate search: one knob at a time, a few passes.
        space = {'smooth': [0.5, 1, 2, 3], 'buildup_in': [0.3, 0.35, 0.4, 0.45, 0.5], 'buildup_out': [0.15, 0.2, 0.25, 0.3, 0.35],
                 'break_in': [0.3, 0.35, 0.4, 0.45, 0.5], 'break_out': [0.15, 0.2, 0.25, 0.3, 0.35], 'enter': [2, 4, 6, 8],
                 'drop': [0.3, 0.4, 0.5, 0.6, 0.7, 0.8], 'drop_ctx': [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5], 'ctx_s': [1, 2, 4, 6], 'refractory': [6, 10, 15, 20, 30], 'hold': [0, 3, 6, 10]}
        best = score(oof, gt, cfg, keys=keys)['mean_F1']
        for _ in range(2):
            for key, values in space.items():
                for v in values:
                    trial = {**cfg, key: v}
                    m = score(oof, gt, trial, keys=keys)['mean_F1']
                    if m > best + 1e-4:
                        best, cfg = m, trial
                print(f'{key}={cfg[key]} mean_F1={best:.3f}', flush=True)
        print('best', json.dumps(cfg))
    conds = sorted(set(oof['conds'].tolist()))
    for c in [None] + (conds if len(conds) > 1 else []):
        res = score(oof, gt, cfg, c, keys)
        print('all' if c is None else f'cond {c}', json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in res.items()}))


if __name__ == '__main__':
    main()

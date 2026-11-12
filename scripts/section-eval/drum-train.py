"""Trains the drum hit classifier (packages/soundsense/src/drum-hit-model.json) on drum-eval.mts --features (or --drum-features) output from
drum-gen.py clips.

    python drum-train.py <eval.json>[,<eval.json>...] [--hidden 32] [--later ignore|negative] [--save drum-hit-model.json] [--parity parity.json]
        [--real <eval.json>,... --beats <dir> --segments <segments.json> [--real-weight 0.5] [--real-every 1]] [--test <eval.json>,...] [--oof oof.json]
        [--workers 6]

Each true hit (kick, hat, snare, clap) makes the earliest candidate from 20 ms before it to 60 ms after it that drum; a candidate can be
several (a clap with the kick). The hit's later candidates in that span (a kick's bass band rises a frame or two after its click, or after the
hat or the clap on the same beat, and makes a candidate of its own) are the same hit: with --later ignore (the default) they are left out of
training for that drum, with --later negative (the first models) they are trained as not that drum, which taught the model to say no on the
candidate that carries the kick's bass. A hit counts as caught when any of its candidates is called (the app calls a drum once per 45 ms), and
a false call is a call on a candidate that is no hit of that drum. A hat within 30 ms of a snare or a clap is left out, as neither a hat nor
not one, and is not counted: the snare's or the clap's own burst in the hi and air bands hides it, and counting it taught the model that every
clap may be a hat (on eighth or sixteenth hats, every clap has one). Five folds by the clips' sample folds, so a fold's samples are never heard
in training. Each drum's threshold is the one with the best F0.5 (precision counted twice) on the held-out folds. Prints, per drum, the share of
its hits called and false calls a minute, overall and by mic, and for the kick by how it was tuned and what low end was under it (drum-gen.py's
kick_shift and low-end beds); then fits on everything and, with --save, writes the model with each drum's thresholds.

--real adds real songs as weak kick labels (drum-eval.mts --drum-features on Raveform levels, with the Raveform beats in --beats and
genres and folds in --segments): in the drops of four-on-the-floor tracks every beat has a kick, so the candidates from 30 ms before a beat to
90 ms after it are that beat's kick (the first, and the later ones as above), and the drop's candidates away from every beat are not a kick.
Their other drums are left out (no labels), they weigh --real-weight each, and they are folded by Raveform fold. --real-every 2 takes every
second song (each fit's time grows with the rows, and real songs make many). --test scores real songs that were never trained on (Raveform
folds 6 and 7) the same way, with the final model. Both print the share of drop beats with a kick call and the kick calls a minute off the
beat.

--oof writes every synthetic hit's held-out best probability with its clip and drum, for looking at groups (drum-gen.py's kick_sample).
--replayed <model.json> also scores the model the eval files were replayed with (their stored probabilities, at that model's thresholds), on
the same clips and songs: the installed model before a retrain. Its synthetic numbers are not held out unless it never heard these samples.
--workers runs the five held-out fits and the final one in that many processes. Each fit is bound by memory more than by the CPU (about
0.4 s a step on 140,000 candidates, 1,500 steps), so more workers than about 6 on a 20-thread machine slow every fit down.
"""
import csv
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mlp  # noqa: E402

args = sys.argv[1:]
opt = lambda name, d: args[args.index(name) + 1] if name in args else d  # noqa: E731
KINDS = ['kick', 'hat', 'snare', 'clap']
EARLY, LATE = 20, 60
REAL_EARLY, REAL_LATE = 30, 90
MASKED_HAT_S = 0.03
FOUR_ON_THE_FLOOR = {'Techno', 'Trance', 'Tech House', 'Mainstage', 'Deep House', 'House', 'Progressive House', 'Melodic House & Techno'}
# Label codes: 1 the hit's first candidate, 2 a later candidate of the same hit, 0 not this drum, -1 left out.
FIRST, LATER, NOT, OUT = 1, 2, 0, -1


def counted(r: dict, kind: str) -> list[float]:
    """The clip's hits of `kind` that are scored (all but the hats a snare or a clap hides)."""
    if kind != 'hat':
        return r['hits'][kind]
    hiding = r['hits']['snare'] + r['hits']['clap']
    return [h for h in r['hits']['hat'] if not any(abs(h - s) <= MASKED_HAT_S for s in hiding)]


HIDDEN = int(opt('--hidden', '32'))
LATER_AS = opt('--later', 'ignore')
assert LATER_AS in ('ignore', 'negative'), '--later is ignore or negative'
REAL_WEIGHT = float(opt('--real-weight', '0.5'))


class Rows:
    """Candidates with their labels (codes above), the hit each belongs to, and what to score them by."""

    def __init__(self) -> None:
        self.X: list[list[float]] = []
        self.p: list[list[float]] = []
        self.Y: list[list[int]] = []
        self.hit: list[list[int]] = []
        self.fold: list[int] = []
        self.group: list[str] = []
        self.weight: list[float] = []
        self.hits = 0

    def add(self, cands: list[dict], hits: list[list[tuple[float, bool]]], early: float, late: float, fold: int, group: str, weight: float,
            known: list[bool]) -> list[list[int]]:
        """`hits[k]`: the drum's hits (ms) with whether each is scored. Returns each drum's hit ids, in `hits` order."""
        ts = np.array([c['t'] for c in cands], dtype=float)
        labels = np.where(np.array(known)[None, :], NOT, OUT) * np.ones((len(cands), len(KINDS)), dtype=int)
        owner = -np.ones((len(cands), len(KINDS)), dtype=int)
        ids: list[list[int]] = []
        for k in range(len(KINDS)):
            ids.append([])
            for h, scored in hits[k]:
                hid = self.hits
                self.hits += 1
                ids[k].append(hid if scored else -1)
                near = np.where((ts >= h - early) & (ts <= h + late))[0]
                for n, at in enumerate(near):
                    if labels[at, k] in (FIRST, LATER):
                        continue
                    labels[at, k] = (FIRST if n == 0 else LATER) if scored else OUT
                    owner[at, k] = hid if scored else -1
        self.X += [c['f'] for c in cands]
        self.p += [c.get('p', [0.0] * len(KINDS)) for c in cands]
        self.Y += labels.tolist()
        self.hit += owner.tolist()
        self.fold += [fold] * len(cands)
        self.group += [group] * len(cands)
        self.weight += [weight] * len(cands)
        return ids


def train_target(Y: np.ndarray) -> np.ndarray:
    """What the network is fitted to: the first candidate is the drum, a later one is left out or not the drum (--later)."""
    return np.where(Y == LATER, OUT if LATER_AS == 'ignore' else NOT, Y)


def score(P: np.ndarray, Y: np.ndarray, hit: np.ndarray, sel: np.ndarray, thr: float, truth: int) -> tuple[float, int]:
    """Hits caught (share of `truth`) and false calls, for one drum's column, on the rows `sel`."""
    call = (P > thr) & sel
    caught = len(set(hit[call & (hit >= 0)].tolist()))
    false = int(np.sum(call & (Y == NOT)))
    return caught / max(1, truth), false


def f_beta(P: np.ndarray, Y: np.ndarray, hit: np.ndarray, sel: np.ndarray, thr: float, truth: int, beta: float = 0.5) -> float:
    rec, false = score(P, Y, hit, sel, thr, truth)
    tp = rec * truth
    prec = tp / max(1e-9, tp + false)
    return (1 + beta ** 2) * prec * rec / max(1e-9, beta ** 2 * prec + rec)


def fit_job(job: tuple) -> dict:
    """One fit, in a worker process: (X, targets, hidden units, pos_weight, row weights)."""
    X, T, hidden, pos_weight, weight = job
    return mlp.fit(X, T, hidden, pos_weight, sample_weight=weight)


def main() -> None:
    # Synthetic clips.
    syn = Rows()
    rows = [r for path in args[0].split(',') for r in json.load(open(path))['results']]
    seconds = 0.0
    seconds_by: dict[str, float] = {}
    truth_by: dict[str, dict[str, int]] = {}
    syn_hits: list[tuple[int, str, list[int]]] = []
    for ci, r in enumerate(rows):
        cands = [c for c in r['candidates'] if c['t'] >= 1000]
        layers = r.get('layers') or {}
        shift = layers.get('kick_shift') if isinstance(layers, dict) else None
        low = next((p for p in r.get('melodic', []) if p in ('sub', 'roll')), 'none')
        tune = 'none' if not shift else ('down' if shift < 0 else 'up')
        groups = [f"mic {r['mic']}", f'tuned {tune}', f'low end {low}']
        scored = {kind: set(counted(r, kind)) for kind in KINDS}
        hits = [[(h * 1000, h in scored[kind]) for h in r['hits'][kind]] for kind in KINDS]
        ids = syn.add(cands, hits, EARLY, LATE, r['fold'], '|'.join(groups), 1.0, [True] * len(KINDS))
        span = r['seconds'] - 1.0
        seconds += span
        for g in groups:
            seconds_by[g] = seconds_by.get(g, 0.0) + span
            t = truth_by.setdefault(g, {kind: 0 for kind in KINDS})
            for kind in KINDS:
                t[kind] += len(scored[kind])
        syn_hits.append((ci, r['id'], ids[0]))
    truth = {kind: sum(len(counted(r, kind)) for r in rows) for kind in KINDS}
    print(f'{len(rows)} clips, {len(syn.X)} candidates, {seconds / 60:.0f} min; hits: ' + ', '.join(f'{k} {truth[k]}' for k in KINDS), file=sys.stderr)


    def real_rows(paths: str, target: Rows, every: int = 1) -> tuple[int, float]:
        """Weak kick labels from the drops of four-on-the-floor tracks (see the header), from every `every`th of them. Returns the drop beats
        and the drops' minutes."""
        segments = {t['key']: t for t in json.load(open(opt('--segments', '')))}
        beats_dir = opt('--beats', '')
        beats_total, minutes = 0, 0.0
        n = 0
        for path in paths.split(','):
            for r in json.load(open(path))['results']:
                meta = segments.get(r['id'])
                if not meta or meta['genre'] not in FOUR_ON_THE_FLOOR:
                    continue
                n += 1
                if (n - 1) % every:
                    continue
                lines = list(csv.DictReader(open(os.path.join(beats_dir, f"{r['id']}.beat.csv"))))
                beat = np.array([float(x['time']) * 1000 for x in lines])
                drop = np.array([x['section'] == 'drop' for x in lines])
                if drop.sum() < 16:
                    continue
                # A drop beat's span runs to the next beat; candidates are kept from the first drop beat's window to the last one's.
                at = np.clip(np.searchsorted(beat, np.array([c['t'] for c in r['candidates']], dtype=float) + REAL_EARLY, side='right') - 1, 0, len(beat) - 1)
                in_drop = drop[at]
                cands = [c for c, keep in zip(r['candidates'], in_drop) if keep and c['t'] >= 1000]
                drop_beats = beat[drop]
                target.add(cands, [[(g, True) for g in drop_beats], [], [], []], REAL_EARLY, REAL_LATE, int(meta['fold']) % 5, 'real', REAL_WEIGHT,
                           [True, False, False, False])
                beats_total += len(drop_beats)
                idx = np.where(drop[:-1])[0]
                minutes += float(np.sum(beat[idx + 1] - beat[idx])) / 60000
        return beats_total, minutes


    real = Rows()
    real_beats, real_minutes = (real_rows(opt('--real', ''), real, int(opt('--real-every', '1'))) if '--real' in args else (0, 0.0))
    if real_beats:
        print(f'real: {len(real.X)} candidates, {real_beats} drop beats, {real_minutes:.0f} min of drops', file=sys.stderr)

    X = np.array(syn.X + real.X)
    Y = np.array(syn.Y + real.Y)
    hit = np.array(syn.hit + real.hit)
    fold = np.array(syn.fold + real.fold)
    weight = np.array(syn.weight + real.weight)
    is_real = np.array([False] * len(syn.X) + [True] * len(real.X))
    group = np.array(syn.group + real.group)
    T = train_target(Y)

    pos = (T == 1).sum(0) / np.maximum(1, (T >= 0).sum(0))
    pos_weight = (1 - pos) / np.maximum(pos, 1e-6)
    P = np.zeros(Y.shape)


    # The five held-out fits and the final one (on every fold), side by side on --workers processes.
    jobs = [(X[fold != f], T[fold != f], HIDDEN, pos_weight, weight[fold != f]) for f in [0, 1, 2, 3, 4, -1]]
    with ProcessPoolExecutor(max_workers=int(opt('--workers', '1'))) as pool:
        fits = list(pool.map(fit_job, jobs))
    print('fits done', file=sys.stderr)
    for f in range(5):
        P[fold == f] = mlp.predict(fits[f], X[fold == f])

    thresholds = []
    grid = np.arange(0.3, 0.96, 0.025)
    print('\nheld out (by sample fold)        caught   false/min   threshold')
    for k, kind in enumerate(KINDS):
        thr = float(grid[np.argmax([f_beta(P[:, k], Y[:, k], hit[:, k], ~is_real, t, truth[kind]) for t in grid])])
        thresholds.append(round(thr, 3))
        rec, false = score(P[:, k], Y[:, k], hit[:, k], ~is_real, thr, truth[kind])
        print(f'  {kind:6s}                         {100 * rec:5.1f}%    {60 * false / seconds:7.1f}     {thr:.3f}')
        names = sorted(seconds_by) if kind == 'kick' else sorted(g for g in seconds_by if g.startswith('mic'))
        for g in names:
            sel = ~is_real & np.array([g in s.split('|') for s in group])
            rec, false = score(P[:, k], Y[:, k], hit[:, k], sel, thr, truth_by[g][kind])
            print(f'      {g:24s}   {100 * rec:5.1f}%    {60 * false / seconds_by[g]:7.1f}')


    def real_report(name: str, Pk: np.ndarray, Yk: np.ndarray, hk: np.ndarray, beats: int, minutes: float, thr: float) -> None:
        for t in sorted({thr, 0.6, 0.7, 0.8, 0.85}):
            call = Pk > t
            caught = len(set(hk[call & (hk >= 0)].tolist()))
            off = int(np.sum(call & (Yk == NOT)))
            mark = ' (threshold)' if t == thr else ''
            print(f'  {name} kick > {t:.3f}: drop beats with a kick {100 * caught / max(1, beats):5.1f}%, off the beat {off / max(1e-9, minutes):5.1f}/min{mark}')


    if real_beats:
        print('\nreal, held out by Raveform fold')
        real_report('train songs', P[is_real, 0], Y[is_real, 0], hit[is_real, 0], real_beats, real_minutes, thresholds[0])

    replayed = json.load(open(opt('--replayed', ''))) if '--replayed' in args else None
    if replayed:
        R = np.array(syn.p + real.p)
        print(f"\nthe replayed model ({opt('--replayed', '')}), same clips  caught   false/min   threshold")
        for k, kind in enumerate(KINDS):
            thr = replayed['thresholds'][replayed['kinds'].index(kind)]
            rec, false = score(R[:, k], Y[:, k], hit[:, k], ~is_real, thr, truth[kind])
            print(f'  {kind:6s}                         {100 * rec:5.1f}%    {60 * false / seconds:7.1f}     {thr:.3f}')
            names = sorted(seconds_by) if kind == 'kick' else sorted(g for g in seconds_by if g.startswith('mic'))
            for g in names:
                sel = ~is_real & np.array([g in s.split('|') for s in group])
                rec, false = score(R[:, k], Y[:, k], hit[:, k], sel, thr, truth_by[g][kind])
                print(f'      {g:24s}   {100 * rec:5.1f}%    {60 * false / seconds_by[g]:7.1f}')
        if real_beats:
            real_report('replayed model, train songs', R[is_real, 0], Y[is_real, 0], hit[is_real, 0], real_beats, real_minutes,
                        replayed['thresholds'][replayed['kinds'].index('kick')])

    if '--oof' in args:
        best = []
        for ci, cid, ids in syn_hits:
            for hid in ids:
                if hid < 0:
                    continue
                p = P[(hit[:, 0] == hid) & ~is_real, 0]
                best.append([cid, hid, float(p.max()) if len(p) else 0.0])
        json.dump({'thresholds': thresholds, 'kick': best}, open(opt('--oof', ''), 'w'))

    model = fits[-1]

    if '--test' in args:
        test = Rows()
        test_beats, test_minutes = real_rows(opt('--test', ''), test)
        Pt = mlp.predict(model, np.array(test.X))
        print(f'\nreal, never trained on ({test_beats} drop beats, {test_minutes:.0f} min)')
        real_report('test songs', Pt[:, 0], np.array(test.Y)[:, 0], np.array(test.hit)[:, 0], test_beats, test_minutes, thresholds[0])
        if replayed:
            real_report('replayed model, test songs', np.array(test.p)[:, 0], np.array(test.Y)[:, 0], np.array(test.hit)[:, 0], test_beats,
                        test_minutes, replayed['thresholds'][replayed['kinds'].index('kick')])

    # drumFeatures' order (drum-hits.ts).
    BANDS = ['bass', 'lo', 'mid', 'hi', 'air']
    per_band = lambda name: [f'{name}_{b}' for b in BANDS]  # noqa: E731
    names = (per_band('rise') + per_band('level') + per_band('share') + ['size'] + per_band('overBed') + per_band('edge') + per_band('peakOverBed')
             + per_band('peakShare'))
    assert len(names) == X.shape[1], f'{X.shape[1]} features in the eval files, {len(names)} named: replay the clips with drum-eval.mts again'
    if '--save' in args:
        json.dump({'kinds': KINDS, 'features': names, **mlp.to_json(model), 'thresholds': thresholds}, open(opt('--save', ''), 'w'))
        print('saved', opt('--save', ''))
    if '--parity' in args:
        idx = np.linspace(0, len(syn.X) - 1, 4).astype(int)
        json.dump({'features': X[idx].round(6).tolist(), 'p': mlp.predict(model, X[idx]).round(6).tolist()}, open(opt('--parity', ''), 'w'))


if __name__ == '__main__':
    main()

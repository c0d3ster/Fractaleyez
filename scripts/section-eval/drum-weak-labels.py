"""Weak drum labels on real music, from Raveform's beats: training rows for drum candidates in the drops of four-on-the-floor tracks.

    tsx drum-candidates.mts <levels dir> <prefix-k> --shard k/n            # each shard (drum-real-thresholds.py has the steps before)
    python drum-weak-labels.py <prefix-0,...> <beats dir> <out.npz> [--per-track 400] [--seed 1]

There are no drum labels on real music, but in these drops a kick plays on every beat, a hat on the off-beats, and nothing else on the
grid's other steps, nearly always. Like drum-train.py, a grid point labels the earliest candidate from 20 ms before it to 60 ms after it:

  on a beat        kick 1; hat unknown (eighth hats land there); snare and clap unknown on 2 and 4 (it is one or the other), 0 on 1 and 3
  on an off-beat   hat 1; kick, snare and clap 0 (an off-beat bass note is a kick's commonest false call)
  anything else    kick, snare and clap 0; hat unknown (sixteenth hats)

Later candidates near the same grid point are unknown for that drum (unknown is -1, which mlp.fit leaves out). The labels are wrong where a
drop has no kick for a bar, a kick off the beat or a clap on every beat, so they are weak: train with them beside the synthetic clips, and
score on held-out Raveform folds with drum-real-score.py or drum-real-thresholds.py, not on these labels.

out.npz: X (candidates x inputs), Y (candidates x 4: kick, hat, snare, clap), fold (Raveform's), track (index into tracks), tracks (ids),
features (the inputs' names). --per-track keeps that many labelled candidates of each track at most, at random, so long tracks do not
outweigh short ones.
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drum_real as R  # noqa: E402

KICK, HAT, SNARE, CLAP = range(4)
EARLY, LATE = 20, 60
UNKNOWN = -1


def first_near(t: np.ndarray, points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per candidate (sorted by time): whether it is the earliest within EARLY..LATE ms of a grid point, and whether it is a later one."""
    first = np.zeros(len(t), dtype=bool)
    later = np.zeros(len(t), dtype=bool)
    lo, hi = np.searchsorted(t, points - EARLY), np.searchsorted(t, points + LATE, side='right')
    for a, b in zip(lo, hi):
        if b > a:
            first[a] = True
            later[a + 1:b] = True
    return first, later & ~first


def labels(t: np.ndarray, g: R.Grid) -> np.ndarray:
    """Candidates x 4 labels for one track's candidates in its drops (times sorted)."""
    y = np.zeros((len(t), 4), dtype=int)
    beat_first, beat_later = first_near(t, g.beats)
    off_first, off_later = first_near(t, g.off_beats)
    backbeat_first, backbeat_later = first_near(t, g.beats[(g.place == 2) | (g.place == 4)])
    # Anything else: kick, snare and clap 0, hat unknown.
    y[:, HAT] = UNKNOWN
    # On an off-beat: a hat, and none of the others.
    y[off_first, HAT] = 1
    y[off_later, HAT] = UNKNOWN
    # On a beat: a kick; the hat unknown; on 2 and 4 a snare or a clap, which one unknown.
    y[beat_first, KICK] = 1
    y[beat_later, KICK] = UNKNOWN
    y[beat_first | beat_later, HAT] = UNKNOWN
    y[backbeat_first | backbeat_later, SNARE] = UNKNOWN
    y[backbeat_first | backbeat_later, CLAP] = UNKNOWN
    return y


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('prefixes')
    ap.add_argument('beats')
    ap.add_argument('out')
    ap.add_argument('--per-track', type=int, default=400)
    ap.add_argument('--seed', type=int, default=1)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    c = R.load(args.prefixes)
    X, Y, P, fold, track = [], [], [], [], []
    used = 0
    for i, info in enumerate(c.tracks):
        g = R.grid(args.beats, info)
        if g is None:
            continue
        mine = np.where(c.track == i)[0]
        mine = mine[np.argsort(c.t[mine])]
        mine = mine[g.in_drop(c.t[mine])]
        if len(mine) == 0:
            continue
        y = labels(c.t[mine], g)
        keep = np.sort(rng.choice(len(mine), size=min(len(mine), args.per_track), replace=False))
        X.append(c.f[mine[keep]])
        Y.append(y[keep])
        P.append(c.p[mine[keep]])
        fold += [int(info.get('fold', -1))] * len(keep)
        track += [i] * len(keep)
        used += 1
    X, Y, P = np.concatenate(X), np.concatenate(Y), np.concatenate(P)
    np.savez_compressed(args.out, X=X.astype(np.float32), Y=Y.astype(np.int8), fold=np.array(fold, dtype=np.int8),
                        track=np.array(track, dtype=np.int32), tracks=np.array([t['id'] for t in c.tracks]), features=np.array(c.features))
    print(f'{used} tracks, {len(X)} candidates')
    print('            positive   negative   unknown   the installed model agrees (positives / negatives, at 0.5)')
    for k, kind in enumerate(R.KINDS):
        pos, neg = Y[:, k] == 1, Y[:, k] == 0
        print(f'  {kind:6s}  {pos.sum():9d}  {neg.sum():9d}  {(Y[:, k] == UNKNOWN).sum():8d}   '
              f'{100 * (P[pos, k] > 0.5).mean() if pos.any() else 0:5.1f}% / {100 * (P[neg, k] <= 0.5).mean() if neg.any() else 0:5.1f}%')
    print('saved', args.out)


if __name__ == '__main__':
    main()

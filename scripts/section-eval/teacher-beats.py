"""Marks beats and downbeats on audio with Beat This! (CPJKU, MIT code and weights), offline, for training the beat network on more EDM than
Raveform has marks for (GiantSteps, SSME). It hears the whole track, which our causal net cannot, so it is a teacher, not a competitor.

    python teacher-beats.py <audio dir> <out dir> [--jobs 4]

Writes <out dir>/<id>.beat.csv in Raveform's shape (time, downbeat = the beat's place in the bar, section empty), which beat-net.py reads.
The bar count starts at each marked downbeat; beats before the first one count back from it. Tracks already done are skipped.
Needs: pip install git+https://github.com/CPJKU/beat_this.git (and torch); the weights download on first use.
"""
import os
import sys
import time
from multiprocessing import Pool

import numpy as np

_model = None


def ids_of(name: str) -> str:
    stem = name.rsplit('.', 1)[0]
    return stem[:-5] if stem.endswith('.LOFI') else stem


def mark(args: tuple) -> str:
    global _model
    path, out = args
    target = os.path.join(out, f'{ids_of(os.path.basename(path))}.beat.csv')
    if os.path.exists(target):
        return 'skip'
    if _model is None:
        import torch
        torch.set_num_threads(4)
        from beat_this.inference import File2Beats
        _model = File2Beats(checkpoint_path='final0', device='cpu', dbn=False)
    beats, downbeats = _model(path)
    beats = np.asarray(beats, dtype=float)
    downbeats = np.asarray(downbeats, dtype=float)
    # Each beat's place in the bar: 1 on a marked downbeat, counting up from the last one (back from the first, before it).
    places = []
    for b in beats:
        before = downbeats[downbeats <= b + 1e-6]
        if len(before):
            places.append(int(np.sum((beats > before[-1] + 1e-6) & (beats <= b + 1e-6))) % 4 + 1)
        else:
            after = downbeats[downbeats > b]
            places.append((-int(np.sum((beats >= b - 1e-6) & (beats < after[0] - 1e-6)))) % 4 + 1 if len(after) else 0)
    with open(target + '.tmp', 'w') as f:
        f.write('time,downbeat,section\n')
        for b, p in zip(beats, places):
            f.write(f'{b:.4f},{p},\n')
    os.replace(target + '.tmp', target)
    return 'done'


def main() -> None:
    audio, out = sys.argv[1], sys.argv[2]
    jobs = int(sys.argv[sys.argv.index('--jobs') + 1]) if '--jobs' in sys.argv else 4
    os.makedirs(out, exist_ok=True)
    paths = sorted(os.path.join(audio, n) for n in os.listdir(audio) if n.lower().endswith(('.mp3', '.wav')))
    started = time.time()
    with Pool(jobs) as pool:
        for i, result in enumerate(pool.imap_unordered(mark, [(p, out) for p in paths])):
            if (i + 1) % 25 == 0:
                print(f'{i + 1}/{len(paths)} {time.time() - started:.0f}s', file=sys.stderr, flush=True)
    print(f'{len(paths)} tracks marked in {out}', file=sys.stderr)


if __name__ == '__main__':
    main()

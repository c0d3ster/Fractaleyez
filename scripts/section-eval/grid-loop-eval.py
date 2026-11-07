"""The frozen evaluation of the beat grid loop (stage 5 of docs/overnight/pipeline.md): runs BeatGrid (grid-eval.mts) over one part of
Raveform's folds, or over Ballroom, and prints the loop's metric.

    python grid-loop-eval.py <raveform levels dir> <structures dir> --set tune|check|hidden [--fps 60] [--opts '{}'] [--jobs 4]
    python grid-loop-eval.py <ballroom levels dir> <ballroom annotations dir> --ballroom [--jobs 4]

Split (docs/experiments/grid-loop-split.json): Raveform's own folds, 0 to 4 tune, 5 check, 6 and 7 hidden.
Metric (grid-score-raveform.py's definitions, mean over tracks, from 10 s in, 70 ms): downbeat F + 8-bar F + 0.5 x beat F.
--ballroom: mean beat F over the excerpts in 4/4 (grid-score.py's definition), the guard that the beat clock does not get worse off EDM.
Prints one JSON line with the numbers.
"""
import argparse
import importlib.util
import json
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
TSX = str(HERE.parent.parent / 'node_modules' / '.bin' / 'tsx')
SPLIT = HERE.parent.parent / 'docs' / 'experiments' / 'grid-loop-split.json'
START = 10.0


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


raveform_score = load('grid_score_raveform', 'grid-score-raveform.py')
ballroom_score = load('grid_score', 'grid-score.py')


def run_grid(levels: str, ids: list[str], jobs: int, fps: int, opts: str) -> list[dict]:
    """grid-eval.mts over the ids, in `jobs` shards of symlinked level files run in parallel."""
    with tempfile.TemporaryDirectory() as tmp:
        shards = []
        for j in range(jobs):
            shard = os.path.join(tmp, f'shard{j}')
            os.makedirs(shard)
            for track in ids[j::jobs]:
                os.symlink(os.path.abspath(os.path.join(levels, f'{track}.f32')), os.path.join(shard, f'{track}.f32'))
            shards.append(shard)

        def one(shard: str) -> list[dict]:
            out = shard + '.json'
            subprocess.run([TSX, str(HERE / 'grid-eval.mts'), shard, out, '--fps', str(fps), '--opts', opts], check=True,
                           capture_output=True, cwd=HERE)
            return json.load(open(out))['runs']

        with ThreadPoolExecutor(jobs) as pool:
            return [r for runs in pool.map(one, shards) for r in runs]


def raveform(args: argparse.Namespace) -> dict:
    split = json.load(open(SPLIT))
    folds = set(split[args.set])
    segments = {s['key']: s for s in json.load(open(os.path.join(args.data, 'segments.json')))}
    ids = sorted(k for k, s in segments.items() if s['fold'] in folds and os.path.exists(os.path.join(args.levels, f'{k}.f32')))
    runs = run_grid(args.levels, ids, args.jobs, args.fps, args.opts)
    rows = []
    for r in runs:
        seg = segments[r['id']]
        times, positions = raveform_score.load_marks(os.path.join(args.data, 'beats', f"{r['id']}.beat.csv"))
        scored = raveform_score.score_track(r['beats'], times, positions, seg['sections'], START)
        if scored is not None:
            rows.append(scored[0])
    m = {k: float(np.mean([x[k] for x in rows])) for k in ('beat_f', 'down_f', 'line_f', 'bar_right', 'phrase_right')}
    n_sec = sum(x['sec_n'] for x in rows) or 1
    m['sec_on_line'] = sum(x['sec_on_line'] for x in rows) / n_sec
    m['metric'] = m['down_f'] + m['line_f'] + 0.5 * m['beat_f']
    return dict(set=args.set, tracks=len(rows), **{k: round(v, 4) for k, v in m.items()})


def ballroom(args: argparse.Namespace) -> dict:
    ids = sorted(f[:-4] for f in os.listdir(args.levels) if f.endswith('.f32'))
    runs = run_grid(args.levels, ids, args.jobs, args.fps, args.opts)
    beat_f, down_f = [], []
    for r in runs:
        path = os.path.join(args.data, f"{r['id']}.beats")
        if not os.path.exists(path):
            continue
        truth = np.loadtxt(path, ndmin=2)
        if truth[:, 1].max() != 4:
            continue
        t_beats = truth[truth[:, 0] >= START, 0]
        t_ones = truth[(truth[:, 0] >= START) & (truth[:, 1] == 1), 0]
        if len(t_beats) < 4:
            continue
        beats = np.array([b[0] for b in r['beats'] if b[0] >= START])
        ones = np.array([b[0] for b in r['beats'] if b[0] >= START and b[1] == 1])
        beat_f.append(ballroom_score.f_measure(beats, t_beats))
        down_f.append(ballroom_score.f_measure(ones, t_ones))
    return dict(set='ballroom', tracks=len(beat_f), beat_f=round(float(np.mean(beat_f)), 4), down_f=round(float(np.mean(down_f)), 4))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('levels')
    parser.add_argument('data')
    parser.add_argument('--set', choices=('tune', 'check', 'hidden'))
    parser.add_argument('--ballroom', action='store_true')
    parser.add_argument('--fps', type=int, default=60)
    parser.add_argument('--opts', default='{}')
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    print(json.dumps(ballroom(args) if args.ballroom else raveform(args)))


if __name__ == '__main__':
    main()

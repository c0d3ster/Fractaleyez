"""The frozen evaluation of the BPM loop (stage 4 of docs/overnight/pipeline.md): runs TempoTracker (bpm-eval.mts) over one part of the
split, clean and through the laptop mic, and prints the loop's metric.

    python bpm-loop-eval.py <levels root> <split.json> <gt.json> --set tune|check|hidden [--fps 60] [--opts '{}'] [--jobs 4]
    python bpm-loop-eval.py <noise root> --noise [--fps 60]

<levels root> holds clean/<id>.f32 and laptop/<id>.f32 (levels.py, laptop with --mic laptop --seed crc32(id) % 1000000).
metric per condition: acc1 + 0.5 x track - 0.05 x jumps per minute (bpm-score.py's definitions, mean over tracks), then the mean of
clean and laptop. --noise: the share of readings that show a tempo on each noise file (noise.py through levels.py); it should be 0.
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
TSX = str(HERE.parent.parent / 'node_modules' / '.bin' / 'tsx')
CONDITIONS = ('clean', 'laptop')

spec = importlib.util.spec_from_file_location('bpm_score', HERE / 'bpm-score.py')
bpm_score = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bpm_score)


def run_shards(src: Path, ids: list[str], fps: int, opts: str, jobs: int, tmp: Path) -> list[dict]:
    shards = [ids[k::jobs] for k in range(jobs) if ids[k::jobs]]

    def one(k: int) -> list[dict]:
        d = tmp / f'{src.name}-{k}'
        d.mkdir()
        for i in shards[k]:
            os.symlink(src / f'{i}.f32', d / f'{i}.f32')
        out = tmp / f'{src.name}-{k}.json'
        subprocess.run([TSX, 'bpm-eval.mts', str(d), str(out), '--reader', 'tracker', '--fps', str(fps), '--opts', opts],
                       cwd=HERE, check=True, capture_output=True)
        return json.load(open(out))['runs']

    with ThreadPoolExecutor(jobs) as pool:
        return [r for runs in pool.map(one, range(len(shards))) for r in runs]


def score(runs: list[dict], gt: dict) -> dict:
    every = 0.5
    rows = []
    for r in runs:
        truth = gt['bpm'].get(r['id'])
        if truth is None or truth <= 0:
            continue
        readings = r['readings'][int(bpm_score.WARMUP_S / every):]
        shown = [x for x in readings if x is not None]
        acc1 = float(np.mean([bpm_score.near(x, truth) for x in shown])) if shown else 0.0
        jumps = sum(1 for a, b in zip(readings, readings[1:]) if a is not None and b is not None and abs(b - a) > a * bpm_score.TOL)
        minutes = len(readings) * every / 60
        mode = Counter(round(x) for x in shown).most_common(1)[0][0] if shown else None
        rows.append(dict(acc1=acc1, track=float(mode is not None and bpm_score.near(mode, truth)), jumps=jumps / minutes))
    m = {k: float(np.mean([row[k] for row in rows])) for k in rows[0]}
    m['metric'] = m['acc1'] + 0.5 * m['track'] - 0.05 * m['jumps']
    m['n'] = len(rows)
    return m


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('root')
    p.add_argument('split', nargs='?')
    p.add_argument('gt', nargs='?')
    p.add_argument('--set', choices=('tune', 'check', 'hidden'))
    p.add_argument('--fps', type=int, default=60)
    p.add_argument('--opts', default='{}')
    p.add_argument('--jobs', type=int, default=4)
    p.add_argument('--noise', action='store_true')
    a = p.parse_args()
    root = Path(a.root).resolve()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if a.noise:
            out = {}
            for c in CONDITIONS:
                ids = sorted(f[:-4] for f in os.listdir(root / c) if f.endswith('.f32'))
                for r in run_shards(root / c, ids, a.fps, a.opts, 1, tmp):
                    out[f"{c}/{r['id']}"] = round(sum(x is not None for x in r['readings']) / len(r['readings']), 3)
            print(json.dumps({'shown': out, 'max': max(out.values())}))
            return
        split = json.load(open(a.split))
        gt = json.load(open(a.gt))
        ids = [i for i in split[a.set] if all((root / c / f'{i}.f32').exists() for c in CONDITIONS)]
        missing = len(split[a.set]) - len(ids)
        if missing:
            print(f'{missing} tracks of {a.set} have no levels', file=sys.stderr)
        jobs = max(1, a.jobs // len(CONDITIONS))
        with ThreadPoolExecutor(len(CONDITIONS)) as pool:
            results = dict(zip(CONDITIONS, pool.map(lambda c: score(run_shards(root / c, ids, a.fps, a.opts, jobs, tmp), gt), CONDITIONS)))
    out = {c: {k: round(v, 4) for k, v in m.items()} for c, m in results.items()}
    out['metric'] = round(float(np.mean([results[c]['metric'] for c in CONDITIONS])), 4)
    out['set'] = a.set
    out['fps'] = a.fps
    print(json.dumps(out))


if __name__ == '__main__':
    main()

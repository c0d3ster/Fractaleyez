"""Scores drum hit calls on real music against Raveform's beats, where there are no drum labels: proxies, for comparing models.

    python drum-real-score.py truth <segments.json> <levels dir>       # writes <levels dir>/truth.jsonl for drum-eval.mts
    tsx drum-eval.mts <levels dir> <out-k.json> --shard k/n             # each shard
    python drum-real-score.py score <out-0.json,...> <beats dir>

<levels dir> holds levels.py's <key>.f32 files (Raveform's float16 levels converted: raw float16, frames x 5, 60 fps). The beats are
raveform/structures/beats/<key>.beat.csv. In the drops of four-on-the-floor tracks (techno, trance, house and its kinds, mainstage), where a
kick plays on every beat, a snare or clap on 2 and 4 and a hat on the off-beats nearly always:
  kick on a beat             the share of kick calls within 50 ms of a beat (a precision proxy)
  beats with a kick          the share of beats with a kick call within 50 ms (a recall proxy)
  snare/clap on 2 or 4       the same for snare and clap calls against beats 2 and 4
  hat on the eighth grid     the share of hat calls within 30 ms of a beat or an off-beat (about a quarter by chance; sixteenth hats are off it)
  off-beats with a hat       the share of off-beats with a hat call within 50 ms
and the median calls a minute by section, every track.
"""
import csv
import json
import os
import sys
from collections import defaultdict

import numpy as np

FOUR_ON_THE_FLOOR = {'Techno', 'Trance', 'Tech House', 'Mainstage', 'Deep House', 'House', 'Progressive House', 'Melodic House & Techno'}
SECTIONS = ['intro', 'buildup', 'drop', 'breakdown', 'outro']
KINDS = ['kick', 'hat', 'snare', 'clap']


def truth(segments: str, levels: str) -> None:
    have = {f[:-4] for f in os.listdir(levels) if f.endswith('.f32')}
    with open(os.path.join(levels, 'truth.jsonl'), 'w') as out:
        for t in json.load(open(segments)):
            if t['key'] in have:
                out.write(json.dumps({'id': t['key'], 'bpm': t['average_bpm'], 'start': 0, 'end': t['duration'], 'genre': t['genre'],
                                      'fold': t['fold'], 'sections': t['sections']}) + '\n')


def near(times: np.ndarray, grid: np.ndarray, ms: float) -> np.ndarray:
    """Which of `times` are within `ms` of a point of `grid` (sorted)."""
    if len(times) == 0 or len(grid) == 0:
        return np.zeros(len(times), dtype=bool)
    at = np.searchsorted(grid, times)
    before, after = grid[np.clip(at - 1, 0, len(grid) - 1)], grid[np.clip(at, 0, len(grid) - 1)]
    return np.minimum(np.abs(times - before), np.abs(times - after)) <= ms


def score(evals: str, beats: str) -> None:
    rows = [r for path in evals.split(',') for r in json.load(open(path))['results']]
    rates: dict[tuple[str, str], list[float]] = defaultdict(list)
    shares: dict[str, list[int]] = defaultdict(lambda: [0, 0])

    def count(name: str, hits: np.ndarray) -> None:
        shares[name][0] += int(hits.sum())
        shares[name][1] += len(hits)

    for r in rows:
        for section in r['sections']:
            start, end = section['start'] * 1000, section['end'] * 1000
            if end - start >= 8000:
                for kind in KINDS:
                    rates[(section['name'], kind)].append(60000 * sum(1 for t in r['calls'][kind] if start <= t < end) / (end - start))
        if r.get('genre') not in FOUR_ON_THE_FLOOR:
            continue
        lines = list(csv.DictReader(open(os.path.join(beats, f"{r['id']}.beat.csv"))))
        beat = np.array([float(x['time']) * 1000 for x in lines])
        place = np.array([int(x['downbeat']) for x in lines])
        drop = np.array([x['section'] == 'drop' for x in lines])
        if drop.sum() < 16:
            continue
        in_drop = lambda t: drop[np.clip(np.searchsorted(beat, t) - 1, 0, len(beat) - 1)] & (t >= beat[0]) & (t < beat[-1])  # noqa: E731
        calls = {kind: np.array(r['calls'][kind], dtype=float) for kind in KINDS}
        calls = {kind: t[in_drop(t)] for kind, t in calls.items()}
        backbeat_calls = np.sort(np.concatenate([calls['snare'], calls['clap']]))
        off = (beat[:-1] + beat[1:]) / 2
        backbeat = beat[(place == 2) | (place == 4)]
        count('kick on a beat', near(calls['kick'], beat, 50))
        count('beats with a kick', near(beat[drop], calls['kick'], 50))
        count('snare/clap on 2 or 4', near(backbeat_calls, backbeat, 50))
        count('2 and 4 with a snare/clap', near(beat[drop & ((place == 2) | (place == 4))], backbeat_calls, 50))
        count('hat on the eighth grid', near(calls['hat'], np.sort(np.concatenate([beat, off])), 30))
        count('off-beats with a hat', near(off[drop[:-1]], calls['hat'], 50))
    print('drops of four-on-the-floor tracks:')
    for name, (hit, n) in shares.items():
        print(f'  {name:28s} {100 * hit / max(1, n):5.1f}%  (of {n})')
    print('median calls a minute  ' + ' '.join(f'{s:>9s}' for s in SECTIONS))
    for kind in KINDS:
        print(f'  {kind:20s} ' + ' '.join(f'{np.median(rates[(s, kind)]) if rates[(s, kind)] else float("nan"):9.0f}' for s in SECTIONS))


if __name__ == '__main__':
    {'truth': truth, 'score': score}[sys.argv[1]](sys.argv[2], sys.argv[3])

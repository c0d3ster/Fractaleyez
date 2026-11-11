"""Picks the Raveform tracks the riser detector trains and is scored on, and writes them the way drum-eval.mts reads real songs.

    python raveform-riser-split.py <segments.json> <raveform-levels dir> <out dir> [--train 300] [--test 200] [--seed 1]

<raveform-levels dir> holds raveform-fetch.py's output (<key>.f16 and fetched.json). Test tracks come from Raveform folds 6 and 7, train
tracks from folds 0 to 5, so no test track is ever trained on (riser-train.py's --real-folds 0,1,2,3,4 then leaves fold 5 for choosing
settings). Writes <out>/train-f32/<key>.f32 and <out>/test-f32/<key>.f32 (float32, frames x 5, 60 fps) and <out>/train-truth.jsonl and
<out>/test-truth.jsonl, one line per track: { id, type: real, fold, genre, bpm, start, end, sections: [{ name, start, end }] }.
"""
import argparse
import json
import os
import random

import numpy as np


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('segments')
    ap.add_argument('levels')
    ap.add_argument('out')
    ap.add_argument('--train', type=int, default=300)
    ap.add_argument('--test', type=int, default=200)
    ap.add_argument('--seed', type=int, default=1)
    args = ap.parse_args()
    ok = set(json.load(open(os.path.join(args.levels, 'fetched.json')))['ok'])
    tracks = [t for t in json.load(open(args.segments)) if t['key'] in ok]
    rng = random.Random(args.seed)
    test = rng.sample([t for t in tracks if t['fold'] in (6, 7)], args.test)
    train = rng.sample([t for t in tracks if t['fold'] <= 5], args.train)
    for name, group in (('train', train), ('test', test)):
        out = os.path.join(args.out, f'{name}-f32')
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(args.out, f'{name}-truth.jsonl'), 'w') as truth:
            for t in group:
                np.fromfile(os.path.join(args.levels, f"{t['key']}.f16"), '<f2').astype('<f4').tofile(os.path.join(out, f"{t['key']}.f32"))
                sections = [{'name': s['name'], 'start': s['start'], 'end': s['end']} for s in t['sections']]
                truth.write(json.dumps({'id': t['key'], 'type': 'real', 'fold': t['fold'], 'genre': t['genre'], 'bpm': t['average_bpm'],
                                        'start': sections[0]['start'] if sections else 0, 'end': t['duration'], 'sections': sections}) + '\n')
    print(f'{len(train)} train, {len(test)} test tracks')


if __name__ == '__main__':
    main()

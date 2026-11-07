"""Scores onset-eval.mts output: false beats per minute on noise files, and recall and precision against marked beats on music.

    python onset-score.py <onsets.json> [<annotations dir>]

With an annotations dir (Ballroom-style "<time> <beat in bar>" files), for each excerpt: the share of marked beats with a detected beat
within 70 ms (recall), the share of detected beats within 70 ms of a marked beat or of the half-beat between two (precision: a hit on an
off-beat is a real hit, just not a beat), averaged. Without one, beats per minute per file and band (for noise, every one is false).
"""
import json
import os
import sys

import numpy as np

TOL = 0.07


def main() -> None:
    run = json.load(open(sys.argv[1]))
    if len(sys.argv) < 3:
        for r in run['runs']:
            minutes = r['seconds'] / 60
            bands = [b for _, b in r['beats']]
            print(f"{r['id']:8s} {len(bands) / minutes:5.1f} beats/min (bass {bands.count(0) / minutes:.1f}, hi {bands.count(3) / minutes:.1f})")
        return
    recalls, precisions, rates = [], [], []
    for r in run['runs']:
        path = os.path.join(sys.argv[2], f"{r['id']}.beats")
        if not os.path.exists(path):
            continue
        truth = np.loadtxt(path, ndmin=2)[:, 0]
        truth = truth[truth >= 3]
        beats = np.array([t for t, _ in r['beats'] if t >= 3])
        if len(truth) < 4:
            continue
        grid = np.sort(np.concatenate([truth, truth[:-1] + np.diff(truth) / 2]))
        recalls.append(np.mean([np.min(np.abs(beats - t)) <= TOL for t in truth]) if len(beats) else 0)
        precisions.append(np.mean([np.min(np.abs(grid - b)) <= TOL for b in beats]) if len(beats) else 0)
        rates.append(len(beats) / (r['seconds'] - 3) * 60)
    print(f"n={len(recalls)} recall {np.mean(recalls):.3f} precision {np.mean(precisions):.3f} beats/min {np.mean(rates):.0f}")


if __name__ == '__main__':
    main()

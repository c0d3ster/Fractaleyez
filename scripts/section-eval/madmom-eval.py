"""Runs madmom's beat tracker over audio files and writes its beats and the BPM a live display would show, in the shapes
bpm-eval.mts and grid-eval.mts write, so bpm-score.py and grid-score.py score it exactly as they score ours.

    python madmom-eval.py <audio dir> <out prefix> [--offline] [--downbeats] [--jobs 8] [--ext .mp3]

Each track's result is also kept in <out prefix>.cache/, so a stopped run picks up where it was.

Writes <out prefix>.bpm.json (a reading every 500 ms: 60 / the median gap of the last 8 beats in the last 12 s, the same
window the Beat HUD's old reader used) and <out prefix>.grid.json (every beat; beat in bar 0 unless --downbeats).

Default is madmom's online mode: unidirectional RNNs and a forward-only DBN, so a beat is only known once heard, like ours.
--offline runs the bidirectional RNNs and the full Viterbi DBN over the whole track (it sees the future, so it is a ceiling,
not a fair comparison). --downbeats adds the offline downbeat tracker for beat-in-bar (offline only: madmom has no online
downbeat model). Needs madmom (pip install from its git master) and ffmpeg.
"""
import json
import os
import sys
from multiprocessing import Pool

import numpy as np

READ_EVERY_S = 0.5
WINDOW_S = 12.0
LAST_BEATS = 8
FPS = 100


def option(name: str, fallback: str) -> str:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else fallback


def readings(beats: np.ndarray, duration: float) -> list:
    out = []
    for t in np.arange(READ_EVERY_S, duration + 1e-9, READ_EVERY_S):
        recent = beats[(beats <= t) & (beats >= t - WINDOW_S)][-LAST_BEATS:]
        out.append(None if len(recent) < 4 else round(60 / float(np.median(np.diff(recent))), 2))
    return out


def track_id_of(path: str) -> str:
    track_id = os.path.basename(path).rsplit('.', 1)[0]
    return track_id[:-5] if track_id.endswith('.LOFI') else track_id


def track(args: tuple) -> dict:
    path, offline, downbeats, cache = args
    cached = os.path.join(cache, track_id_of(path) + '.json')
    if os.path.exists(cached):
        return json.load(open(cached))
    from madmom.audio.signal import Signal
    from madmom.features.beats import DBNBeatTrackingProcessor, RNNBeatProcessor

    signal = Signal(path, sample_rate=44100, num_channels=1)
    duration = len(signal) / 44100
    activations = RNNBeatProcessor(online=not offline)(signal)
    beats = DBNBeatTrackingProcessor(fps=FPS, online=not offline)(activations)
    in_bar = [0] * len(beats)
    if downbeats:
        from madmom.features.downbeats import DBNDownBeatTrackingProcessor, RNNDownBeatProcessor

        bar = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=FPS)(RNNDownBeatProcessor()(signal))
        # Each tracked beat takes the beat-in-bar of the nearest downbeat-model beat.
        if len(bar):
            in_bar = [int(bar[int(np.argmin(np.abs(bar[:, 0] - b))), 1]) for b in beats]
    result = {
        'id': track_id_of(path),
        'readings': readings(np.asarray(beats), duration),
        'beats': [[round(float(b), 3), k, 0] for b, k in zip(beats, in_bar)],
    }
    json.dump(result, open(cached, 'w'))
    return result


def main() -> None:
    audio_dir, prefix = sys.argv[1], sys.argv[2]
    offline = '--offline' in sys.argv
    downbeats = '--downbeats' in sys.argv
    ext = option('--ext', '')
    jobs = int(option('--jobs', str(max(1, (os.cpu_count() or 2) - 2))))
    paths = sorted(os.path.join(root, name) for root, _, names in os.walk(audio_dir) for name in names
                   if name.lower().endswith(ext or ('.mp3', '.wav')))
    cache = f'{prefix}.cache'
    os.makedirs(cache, exist_ok=True)
    with Pool(jobs) as pool:
        runs = []
        for i, run in enumerate(pool.imap_unordered(track, [(p, offline, downbeats, cache) for p in paths], chunksize=1)):
            runs.append(run)
            if (i + 1) % 50 == 0:
                print(f'{i + 1}/{len(paths)}', file=sys.stderr, flush=True)
    runs.sort(key=lambda r: r['id'])
    mode = 'offline' if offline else 'online'
    json.dump({'tracker': f'madmom {mode}', 'readEveryMs': READ_EVERY_S * 1000, 'runs': [{'id': r['id'], 'readings': r['readings']} for r in runs]},
              open(f'{prefix}.bpm.json', 'w'))
    json.dump({'tracker': f'madmom {mode}', 'runs': [{'id': r['id'], 'beats': r['beats']} for r in runs]}, open(f'{prefix}.grid.json', 'w'))
    print(f'{len(runs)} tracks, madmom {mode}', file=sys.stderr)


if __name__ == '__main__':
    main()

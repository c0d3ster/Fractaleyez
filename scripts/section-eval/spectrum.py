"""Emulates the app's main AnalyserNode (fftSize 512, Blackman window, read at 60 fps) and pools it into 14 log-spaced bands per 50 ms tick.

    python spectrum.py <song> <out.f32> [--mic clean|room|laptop]

Output: raw float32, ticks x 14, the mean power per band (linear) over the frames in each 50 ms tick.
"""
import argparse
import sys

import numpy as np

from levels import RATE, decode, simulate_mic

FFT = 512
FPS = 60
TICK_FRAMES = 3
EDGES_HZ = np.geomspace(150, 16000, 15)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('song')
    parser.add_argument('out')
    parser.add_argument('--mic', default='clean', choices=['clean', 'room', 'laptop'])
    parser.add_argument('--seed', type=int, default=1)
    args = parser.parse_args()
    x = simulate_mic(decode(args.song), args.mic, np.random.default_rng(args.seed))
    window = np.blackman(FFT)
    frames = int(len(x) / RATE * FPS)
    ends = (np.arange(frames) * RATE / FPS).astype(np.int64)
    ends = ends[ends >= FFT]
    idx = ends[:, None] - FFT + np.arange(FFT)[None, :]
    spec = np.abs(np.fft.rfft(x[idx] * window, axis=1)) ** 2
    freqs = np.fft.rfftfreq(FFT, 1 / RATE)
    bands = np.stack([spec[:, (freqs >= lo) & (freqs < hi)].mean(axis=1) for lo, hi in zip(EDGES_HZ[:-1], EDGES_HZ[1:])], axis=1)
    pad = np.zeros((frames - len(bands), bands.shape[1]))
    bands = np.concatenate([pad, bands])
    ticks = len(bands) // TICK_FRAMES
    out = bands[: ticks * TICK_FRAMES].reshape(ticks, TICK_FRAMES, -1).mean(axis=1)
    out.astype('<f4').tofile(args.out)
    print(args.song.split('/')[-1], out.shape, file=sys.stderr)


if __name__ == '__main__':
    main()

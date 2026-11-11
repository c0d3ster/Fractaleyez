"""Emulates the app's main AnalyserNode (fftSize 512, Blackman window, smoothingTimeConstant 0.2, getByteFrequencyData over -100 to
-30 dB, read once per frame at 60 fps) and pools it the way the training recorder does (tick-extras.ts, spectrum-reducer.ts): 40
log-spaced bands from 40 Hz to 16 kHz, each the mean of the bins whose centre falls in it (or the nearest bin), averaged over the frames
of each 50 ms tick and rounded.

    python analyser.py <song> <out.spec> [--mic clean|room|laptop] [--seed 1]

As a module: `spectrum_ticks(x)` for a mono signal at levels.RATE. Output: raw float32, ticks x 40, values 0 to 255.
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from levels import RATE, decode, simulate_mic  # noqa: E402

FFT = 512
FPS = 60
TICK_MS = 50
SMOOTHING = 0.2
MIN_DB, MAX_DB = -100.0, -30.0
SPECTRUM_BANDS = 40
LOW_HZ, HIGH_HZ = 40.0, 16000.0


def band_edges() -> np.ndarray:
    ratio = HIGH_HZ / LOW_HZ
    return np.round(LOW_HZ * ratio ** (np.arange(SPECTRUM_BANDS + 1) / SPECTRUM_BANDS) * 10) / 10


def reducer_ranges(rate: int = RATE, bins: int = FFT // 2) -> list[tuple[int, int]]:
    """SpectrumReducer's bin range per band."""
    bin_hz = rate / 2 / bins
    edges = band_edges()
    out = []
    for b in range(SPECTRUM_BANDS):
        lo, hi = int(np.ceil(edges[b] / bin_hz)), min(bins, int(np.ceil(edges[b + 1] / bin_hz)))
        if hi > lo:
            out.append((lo, hi))
        else:
            near = min(bins - 1, int(round(np.sqrt(edges[b] * edges[b + 1]) / bin_hz)))
            out.append((near, near + 1))
    return out


def byte_frames(x: np.ndarray, rate: int = RATE) -> np.ndarray:
    """getByteFrequencyData once per 60 fps frame: frames x FFT / 2, 0 to 255."""
    window = np.blackman(FFT)
    frames = int(len(x) / rate * FPS)
    ends = (np.arange(frames) * rate / FPS).astype(np.int64)
    out = np.zeros((frames, FFT // 2))
    smoothed = np.zeros(FFT // 2)
    for f, end in enumerate(ends):
        if end < FFT:
            continue
        mag = np.abs(np.fft.rfft(x[end - FFT:end] * window))[: FFT // 2] / FFT
        smoothed = SMOOTHING * smoothed + (1 - SMOOTHING) * mag
        db = 20 * np.log10(np.maximum(smoothed, 1e-12))
        out[f] = np.floor(np.clip(255 * (db - MIN_DB) / (MAX_DB - MIN_DB), 0, 255))
    return out


def spectrum_ticks(x: np.ndarray, rate: int = RATE) -> np.ndarray:
    """Ticks x 40: the reducer's bands per frame (rounded), averaged over each 50 ms tick's frames and rounded."""
    frames = byte_frames(x, rate)
    pooled = np.stack([np.round(frames[:, lo:hi].mean(axis=1)) for lo, hi in reducer_ranges(rate)], axis=1)
    per_tick = int(FPS * TICK_MS / 1000)
    ticks = len(pooled) // per_tick
    return np.round(pooled[: ticks * per_tick].reshape(ticks, per_tick, -1).mean(axis=1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('song')
    parser.add_argument('out')
    parser.add_argument('--mic', default='clean', choices=['clean', 'room', 'laptop'])
    parser.add_argument('--seed', type=int, default=1)
    args = parser.parse_args()
    x = simulate_mic(decode(args.song), args.mic, np.random.default_rng(args.seed))
    out = spectrum_ticks(x)
    out.astype('<f4').tofile(args.out)
    print(args.song.split('/')[-1], out.shape, file=sys.stderr)


if __name__ == '__main__':
    main()

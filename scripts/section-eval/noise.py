"""Writes test noise as 44.1 kHz WAV files, for checking how the onset detector behaves with no music (a fan, a hiss, room noise).

    python noise.py <out dir> [--seconds 60]

white, pink, brown: the classic noise colours at a steady level.
fan: what a fan into a laptop mic sounds like: broadband hiss with a low rumble, motor hum at 60 Hz and its harmonics, and the blades
     modulating the airflow (a slow whoosh at a few Hz plus a faint flutter at the blade rate).
"""
import argparse
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

RATE = 44100


def pink(n: int, rng: np.random.Generator) -> np.ndarray:
    return lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], rng.standard_normal(n))


def brown(n: int, rng: np.random.Generator) -> np.ndarray:
    return lfilter([1.0], [1, -0.995], rng.standard_normal(n))


def norm(x: np.ndarray, rms: float) -> np.ndarray:
    return x * rms / (np.sqrt(np.mean(x ** 2)) + 1e-12)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('--seconds', type=float, default=60)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rng = np.random.default_rng(7)
    n = int(args.seconds * RATE)
    t = np.arange(n) / RATE
    signals = {
        'white': norm(rng.standard_normal(n), 0.1),
        'pink': norm(pink(n, rng), 0.1),
        'brown': norm(brown(n, rng), 0.1),
    }
    hiss = norm(pink(n, rng), 0.06)
    rumble = norm(brown(n, rng), 0.05)
    hum = sum(norm(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)), 0.02 / k) for k, f in enumerate((60, 120, 180), start=1))
    whoosh = 1 + 0.15 * np.sin(2 * np.pi * 2.3 * t) + 0.05 * np.sin(2 * np.pi * 21 * t)
    signals['fan'] = (hiss + rumble) * whoosh + hum
    for name, x in signals.items():
        wavfile.write(os.path.join(args.out, f'{name}.wav'), RATE, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print('wrote', ', '.join(signals))


if __name__ == '__main__':
    main()

"""Write the parity fixture for the TypeScript front end: levels.py's band levels for a small synthetic signal.

    python levels-fixture.py

The signal is defined here and again in packages/beatsense/test/frontend/parity-signal.ts (same formula), so the test can rebuild it
and compare its own levels with the ones levels.py made, to a relative tolerance of 1e-4. Needs numpy and scipy.
"""
import json
import pathlib

import numpy as np
from scipy.signal import lfilter

import levels

SECONDS = 3
OUT = pathlib.Path(__file__).resolve().parents[2] / 'packages/beatsense/test/frontend/levels-parity.json'


def signal() -> np.ndarray:
    t = np.arange(int(SECONDS * levels.RATE)) / levels.RATE
    kick = 0.5 * np.sin(2 * np.pi * 60 * t) * np.exp(-30 * (t % 0.5))
    snare = 0.2 * np.sin(2 * np.pi * 1800 * t) * np.exp(-40 * ((t + 0.25) % 0.5))
    hat = 0.1 * np.sin(2 * np.pi * 9000 * t) * np.exp(-90 * ((t + 0.125) % 0.25))
    return kick + snare + hat + 0.05 * np.sin(2 * np.pi * 440 * t) + 0.02 * np.sin(2 * np.pi * 250 * t)


def band_levels(x: np.ndarray) -> np.ndarray:
    frames = int(len(x) / levels.RATE * levels.FPS)
    ends = (np.arange(frames) * levels.RATE / levels.FPS).astype(np.int64)
    out = np.zeros((frames, len(levels.BANDS)))
    for b, (low, high, window) in enumerate(levels.BANDS):
        y = x
        for kind, freq in (('highpass', low), ('highpass', low), ('lowpass', high), ('lowpass', high)):
            bb, aa = levels.webaudio_biquad(kind, freq)
            y = lfilter(bb, aa, y)
        csum = np.concatenate([[0.0], np.cumsum(y ** 2)])
        starts = np.maximum(0, ends - window)
        count = np.maximum(1, ends - starts)
        out[:, b] = np.sqrt((csum[ends] - csum[starts]) / count) * 100
    return out


if __name__ == '__main__':
    frames = band_levels(signal())
    OUT.write_text(json.dumps({'sampleRate': levels.RATE, 'fps': levels.FPS, 'levels': frames.tolist()}) + '\n')
    print(f'wrote {OUT} ({len(frames)} frames)')

"""Decode a song and write the per-frame onset-band levels the app would see, as raw float32 (frames x 5) at 60 fps.

Matches AudioStream: each band is two highpass and two lowpass BiquadFilterNodes (Web Audio spec formulas, default Q of
1 dB), read as the RMS of the last `windowSamples` samples, in percent of full scale.

    python levels.py <song> <out.f32> [--mic clean|room|laptop] [--seed N] [--wav-out heard.wav]

--mic simulates hearing the music through a microphone instead of a clean feed:
  room    good speakers in a room: a short reverb, a noise floor, a gentle low cut at 40 Hz
  laptop  laptop speakers into the laptop mic: almost no bass under 200 Hz, a 10 kHz top, more reverb and noise
--wav-out also writes the audio as the microphone heard it (32-bit float mono WAV, not rescaled), so another tracker (madmom-eval.py)
hears exactly the signal these levels were made from.
Needs ffmpeg on the PATH and numpy and scipy.
"""
import argparse
import subprocess
import sys

import numpy as np
from scipy.signal import lfilter, butter, sosfilt

RATE = 44100
FPS = 60
BANDS = [(40, 150, 2048), (150, 500, 1024), (500, 2000, 1024), (2000, 6000, 1024), (6000, 16000, 1024)]


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def webaudio_biquad(kind: str, freq: float, q_db: float = 1.0) -> tuple[np.ndarray, np.ndarray]:
    # Web Audio spec: for lowpass and highpass, Q is in dB, alpha = sin(w0) / (2 * 10^(Q/20)).
    w0 = 2 * np.pi * min(freq, RATE / 2 * 0.999) / RATE
    alpha = np.sin(w0) / (2 * 10 ** (q_db / 20))
    cos = np.cos(w0)
    if kind == 'lowpass':
        b = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
    else:
        b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
    a = [1 + alpha, -2 * cos, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def simulate_mic(x: np.ndarray, kind: str, rng: np.random.Generator) -> np.ndarray:
    if kind == 'clean':
        return x
    if kind == 'room':
        low_cut, high_cut, order, rt60, wet, noise_db = 40, 16000, 2, 0.45, 0.25, -48
    else:
        low_cut, high_cut, order, rt60, wet, noise_db = 200, 10000, 4, 0.6, 0.35, -40
    y = sosfilt(butter(order, low_cut, 'highpass', fs=RATE, output='sos'), x)
    y = sosfilt(butter(2, high_cut, 'lowpass', fs=RATE, output='sos'), y)
    # A diffuse tail: exponentially decaying noise, mixed under the direct sound.
    length = int(rt60 * RATE)
    ir = rng.standard_normal(length) * np.exp(-6.9 * np.arange(length) / length)
    ir /= np.sqrt(np.sum(ir ** 2))
    tail = np.convolve(y, ir)[: len(y)] if len(y) < 200000 else fft_convolve(y, ir)
    y = (1 - wet) * y + wet * tail
    # Pink-ish room and preamp noise, relative to the song's own loudness.
    rms = np.sqrt(np.mean(y ** 2)) + 1e-9
    white = rng.standard_normal(len(y))
    pink = lfilter([0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400], white)
    pink *= rms * 10 ** (noise_db / 20) / (np.sqrt(np.mean(pink ** 2)) + 1e-12)
    return y + pink


def fft_convolve(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    from scipy.signal import fftconvolve
    return fftconvolve(x, h)[: len(x)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('song')
    parser.add_argument('out')
    parser.add_argument('--mic', default='clean', choices=['clean', 'room', 'laptop'])
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--wav-out')
    args = parser.parse_args()

    x = simulate_mic(decode(args.song), args.mic, np.random.default_rng(args.seed))
    if args.wav_out:
        from scipy.io import wavfile
        wavfile.write(args.wav_out, RATE, x.astype('<f4'))
    frames = int(len(x) / RATE * FPS)
    ends = (np.arange(frames) * RATE / FPS).astype(np.int64)
    out = np.zeros((frames, len(BANDS)), dtype=np.float32)
    for b, (low, high, window) in enumerate(BANDS):
        y = x
        for kind, freq in (('highpass', low), ('highpass', low), ('lowpass', high), ('lowpass', high)):
            bb, aa = webaudio_biquad(kind, freq)
            y = lfilter(bb, aa, y)
        csum = np.concatenate([[0.0], np.cumsum(y ** 2)])
        starts = np.maximum(0, ends - window)
        count = np.maximum(1, ends - starts)
        out[:, b] = np.sqrt((csum[ends] - csum[starts]) / count) * 100
    out.astype('<f4').tofile(args.out)
    print(f'{args.song.split("/")[-1]} {len(x) / RATE:.0f}s {frames} frames {args.mic}', file=sys.stderr)


if __name__ == '__main__':
    main()

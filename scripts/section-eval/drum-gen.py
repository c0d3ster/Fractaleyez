"""Builds labelled drum and riser test clips from one-shot samples and writes the app's band levels for each (levels.py's filters).

    python drum-gen.py <samples dir> <out dir> [--drum-clips 2400] [--riser-clips 500] [--plain-clips 250] [--breakdown-clips 0]
        [--workers 8] [--seed 1] [--spectrum]

<samples dir> holds one folder per kind of one-shot: kick/, snare/, clap/, hat/ (closed, pedal and open hi-hats) and cymbal/ (crashes and
rides, played as something that is none of the four). Any format ffmpeg reads. Free sources: github.com/tidalcycles/Dirt-Samples (sn, sd,
808sd, cp, realclaps, bd, 808bd, clubkick; its hh folder is a whole kit, so take only its hats) and github.com/oramics/sampled (DM/*, DRUMS/*).

Per clip: <out>/<id>.f32 (frames x 5 at 60 fps, levels.py), with --spectrum <out>/<id>.spec (50 ms ticks x 40 bands, as the training
recorder keeps them: analyser.py), and a line in <out>/truth.jsonl:
  { id, type, fold, bpm, mic, start, end, layers, hits: { kick, hat, snare, clap: [s] }, risers: [[from s, to s]] }
Every sample is in one of five folds (by its kit, from drum-samples.py's names), and a clip draws all of its samples from one fold, so a
model can be scored on folds whose samples, and drum machines, it never heard. Clip types:
  drums  4 bars of a random kit pattern on the beat grid (any of kick, hats, snare and/or clap, a crash on the downbeat) over random
         melodic layers (bass plucks, pads, chord stabs, a sung line), or with nothing at all of some kinds. The hats are one hi-hat (each
         strike chokes the last), on the off-beats, eighths or sixteenths, or closed with an open hat on the off-beats. About one in seven
         has one drum alone
  riser  a riser of 2 to 8 bars (a noise sweep, a pitch riser or a high-passed whoosh) ending on a bar line, usually over drums and a snare
         roll, sometimes into a drop (the kick back with a crash)
  plain  as long as a riser clip but with none: steady layers, a fade-in of the whole mix, steady noise or a downlifter (a falling sweep)
  breakdown (written as plain, look-alike "breakdown")  a breakdown with no riser: the kit and bass play, then for 2 to 8 bars the kick and
         bass cut out and pads (sometimes stabs, a sung line, the hats or quiet noise) take over, sometimes into a drop. Real breakdowns read
         as rising to a model taught only on synthetic risers (the highs stand out once the lows go), so these teach it they are not.
         Their ids start with b, so they can go in the same folder as a --seed run's other clips.
"""
import argparse
import json
import os
import subprocess
import sys
import zlib
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyser  # noqa: E402
import levels as L  # noqa: E402

RATE = L.RATE
FOLDS = 5
KINDS = ['kick', 'hat', 'snare', 'clap']
MICS = ['clean', 'room', 'laptop']
MIC_P = [0.4, 0.4, 0.2]
CHORDS = [[0, 3, 7, 10], [5, 8, 12, 15], [-2, 2, 5, 9], [3, 7, 10, 14]]


@lru_cache(maxsize=None)
def decode(path: str) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(RATE), '-'], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype='<f4').astype(np.float64)[: int(2.5 * RATE)]
    if len(x) > 200:
        x[-200:] *= np.linspace(1, 0, 200)
    peak = np.max(np.abs(x)) if len(x) else 0
    x = x / peak if peak > 0 else x
    x.setflags(write=False)
    return x


@lru_cache(maxsize=None)
def _sos(order: int, cutoff, kind: str) -> np.ndarray:
    return butter(order, cutoff, kind, fs=RATE, output='sos')


def filt(order: int, cutoff, kind: str, x: np.ndarray) -> np.ndarray:
    # Cutoffs rounded to 25 Hz so the designs are reused.
    key = tuple(round(c / 25) * 25 for c in cutoff) if isinstance(cutoff, (list, tuple)) else round(cutoff / 25) * 25
    return sosfilt(_sos(order, key, kind), x)


def db(v: float) -> float:
    return 10 ** (v / 20)


def place(out: np.ndarray, sample: np.ndarray, t: float, gain: float) -> None:
    at = int(t * RATE)
    if at < 0 or at >= len(out):
        return
    n = min(len(sample), len(out) - at)
    out[at:at + n] += sample[:n] * gain


def saw(f0: np.ndarray) -> np.ndarray:
    return 2 * (np.cumsum(f0 / RATE) % 1) - 1


def choke(sample: np.ndarray, seconds: float) -> np.ndarray:
    """The sample cut off `seconds` in, with a 4 ms fade (a hi-hat struck again)."""
    n, fade = max(0, int(seconds * RATE)), int(0.004 * RATE)
    if n >= len(sample):
        return sample
    out = sample[:n].copy()
    k = min(fade, n)
    out[n - k:] *= np.linspace(1, 0, k)
    return out


@lru_cache(maxsize=None)
def is_open(path: str) -> bool:
    """An open hat: still within 20 dB of its peak 150 ms after it (closed and pedal hats are under 120 ms)."""
    x = decode(path)
    env = np.sqrt(np.convolve(x ** 2, np.ones(441) / 441, 'same'))
    peak = int(np.argmax(env))
    return bool(np.any(env[peak + int(0.15 * RATE):] > env[peak] * 0.1))


def env_ad(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / RATE
    return np.clip(t / max(attack, 1e-4), 0, 1) * np.exp(-np.maximum(0, t - attack) / max(decay, 1e-4))


def snare_steps(pattern: str, bar: int, bars: int) -> tuple[list[int], int]:
    """Which sixteenth steps of the bar the snare or clap plays, and the pattern's steps per bar."""
    if pattern == 'backbeat':
        return [4, 12], 16
    if pattern == 'quarter':
        return [0, 4, 8, 12], 16
    if pattern == 'eighth':
        return list(range(0, 16, 2)), 16
    if pattern == 'sixteenth':
        return list(range(16)), 16
    # ramp: quarters, eighths, then sixteenths over the bars
    level = [4, 8, 16, 16, 16, 16, 16, 16][min(int(bar * 4 / max(bars, 1)), 7)]
    return list(range(0, 16, 16 // level)), 16


def drums(x: np.ndarray, rng: np.random.Generator, pick, beat: float, start: float, bars: int, layers: dict, hits: dict, ramp_from: float = 0) -> None:
    """Lays the kit from `start` for `bars` bars, on the sixteenth grid, recording each hit of the four kinds."""
    step = beat / 4
    jitter = lambda: rng.normal(0, 0.002)  # noqa: E731
    if layers.get('kick'):
        k, g = pick('kick'), db(rng.uniform(-8, -2))
        steps = [0, 4, 8, 12] if layers['kick'] == 'four' else sorted(rng.choice(16, size=int(rng.integers(2, 5)), replace=False).tolist() + [0])
        for bar in range(bars):
            for s in set(steps):
                t = start + bar * 4 * beat + s * step + jitter()
                place(x, k, t, g * rng.uniform(0.85, 1.0))
                hits['kick'].append(t)
    if layers.get('hat'):
        # One hi-hat: each strike chokes the one before, so an open hat played on sixteenths rings for a sixteenth, not over the next ones.
        # 'open-offbeat' is closed eighths or sixteenths with an open hat on every off-beat (the house pattern).
        pattern = layers['hat']
        g = db(rng.uniform(-20, -10))
        if pattern == 'open-offbeat':
            closed, opened = pick('hat', False), pick('hat', True)
            steps = list(range(16)) if rng.random() < 0.5 else list(range(0, 16, 2))
            sample_at = lambda s: opened if s % 4 == 2 else closed  # noqa: E731
        else:
            h = pick('hat')
            steps = {'offbeat': [2, 6, 10, 14], 'eighths': list(range(0, 16, 2)), 'sixteenths': list(range(16))}[pattern]
            sample_at = lambda s: h  # noqa: E731
        strikes = [(start + bar * 4 * beat + s * step + jitter(), s) for bar in range(bars) for s in steps]
        for i, (t, s) in enumerate(strikes):
            smp = sample_at(s)
            if i + 1 < len(strikes):
                smp = choke(smp, strikes[i + 1][0] - t)
            place(x, smp, t, g * (rng.uniform(0.75, 1.0) if s % 4 == 2 else rng.uniform(0.45, 0.8)))
            hits['hat'].append(t)
    for kind in ('snare', 'clap'):
        if not layers.get(kind):
            continue
        smp, g = pick(kind), db(rng.uniform(-9, -2))
        for bar in range(bars):
            steps, _ = snare_steps(layers[kind], bar, bars)
            for s in steps:
                t = start + bar * 4 * beat + s * step + jitter()
                vel = rng.uniform(0.7, 1.0)
                if layers[kind] == 'ramp':
                    vel = 0.45 + 0.55 * ((t - start) / (bars * 4 * beat))
                place(x, smp, t, g * vel)
                hits[kind].append(t)
    if layers.get('crash'):
        place(x, pick('cymbal'), start + jitter(), db(rng.uniform(-14, -6)))


def melodic(x: np.ndarray, rng: np.random.Generator, beat: float, start: float, length: float, parts: set) -> None:
    root = rng.uniform(98, 165)
    beats = int(length / beat) + 1
    chord_at = lambda bar: CHORDS[bar % len(CHORDS)]  # noqa: E731
    if 'bass' in parts:
        g = db(rng.uniform(-14, -8))
        for s in range(beats * 2):
            if rng.random() < 0.3:
                continue
            f = root / 2 * 2 ** (rng.choice([0, 0, 7, 12]) / 12)
            m = int(beat / 2 * RATE * 0.9)
            place(x, filt(2, rng.uniform(250, 600), 'lowpass', saw(np.full(m, f)) * env_ad(m, 0.004, 0.12)), start + s * beat / 2, g)
    if 'pad' in parts:
        g, bar_len = db(rng.uniform(-22, -14)), 4 * beat
        for bar in range(int(length / bar_len) + 1):
            m = int(bar_len * RATE)
            tone = sum(saw(np.full(m, root * 2 ** (iv / 12) * rng.uniform(0.997, 1.003))) for iv in chord_at(bar))
            tone = tone * np.clip(np.arange(m) / (0.25 * RATE), 0, 1) * np.clip((m - np.arange(m)) / (0.05 * RATE), 0, 1)
            place(x, filt(2, 1800, 'lowpass', tone) / 4, start + bar * bar_len, g)
    if 'stabs' in parts:
        g = db(rng.uniform(-18, -10))
        for s in range(beats * 2):
            if rng.random() < 0.55:
                continue
            m = int(0.18 * RATE)
            tone = sum(saw(np.full(m, 2 * root * 2 ** (iv / 12))) for iv in chord_at(int(s / 8)))
            place(x, filt(2, 2500, 'lowpass', tone * env_ad(m, 0.003, 0.06)) / 4, start + s * beat / 2 + (beat / 2 if rng.random() < 0.3 else 0), g)
    if 'vocal' in parts:
        g, t = db(rng.uniform(-20, -12)), start + 0.2
        while t < start + length:
            dur = rng.uniform(0.15, 0.6)
            m = int(dur * RATE)
            src = saw(rng.uniform(160, 330) * (1 + 0.01 * np.sin(2 * np.pi * 5.5 * np.arange(m) / RATE)))
            formants = [(rng.uniform(400, 800), 1.0), (rng.uniform(900, 1800), 0.6), (rng.uniform(2200, 3000), 0.3)]
            voice = sum(w * filt(2, (f * 0.85, f * 1.15), 'bandpass', src) for f, w in formants) * env_ad(m, rng.uniform(0.01, 0.05), dur / 2)
            place(x, voice, t, g)
            t += dur + rng.uniform(0.05, 0.4)


def sweep(n: int, rng: np.random.Generator, f_from: float, f_to: float, kind: str) -> np.ndarray:
    """A noise sweep: white noise through a band-pass (or high-pass, for a whoosh) whose centre moves from f_from to f_to, in blocks."""
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    block = 2048
    for b0 in range(0, n, block):
        frac = b0 / max(1, n - 1)
        f = f_from * (f_to / f_from) ** frac
        seg = noise[max(0, b0 - 512): b0 + block]
        y = filt(2, min(f, 18000), 'highpass', seg) if kind == 'whoosh' else filt(2, (max(60, f / 1.6), min(19000, f * 1.6)), 'bandpass', seg)
        out[b0: b0 + block] = y[-len(out[b0: b0 + block]):]
    return out


def riser(n: int, rng: np.random.Generator) -> tuple[np.ndarray, str]:
    kind = str(rng.choice(['noise', 'pitch', 'whoosh']))
    t = np.arange(n) / RATE
    ramp = (t / t[-1]) ** rng.uniform(1.0, 2.5)
    if kind == 'pitch':
        f0 = rng.uniform(150, 400) * 2 ** (rng.uniform(1, 3) * (t / t[-1]))
        y = sum(saw(f0 * rng.uniform(0.99, 1.01)) for _ in range(3)) / 3
        y = filt(2, 9000, 'lowpass', y)
    else:
        y = sweep(n, rng, rng.uniform(250, 800), rng.uniform(6000, 14000), kind)
        y /= np.sqrt(np.mean(y ** 2)) + 1e-9
    return y * (0.1 + 0.9 * ramp), kind


def make(job: dict) -> dict:
    rng = np.random.default_rng(job['seed'])
    by_kind = job['samples']

    def pick(kind: str, open_hat: bool | None = None) -> np.ndarray:
        names = by_kind[kind]
        if open_hat is not None:
            names = [n for n in names if is_open(n) == open_hat] or names
        return decode(names[int(rng.integers(len(names)))])

    bpm = float(rng.uniform(120, 175))
    beat = 60 / bpm
    start = float(np.ceil(1.5 / beat) * beat)  # a lead-in on the beat grid: the trackers warm up and hear the bed alone first
    hits = {k: [] for k in KINDS}
    risers: list[list[float]] = []
    melodic_parts = {p for p in ('bass', 'pad', 'stabs', 'vocal') if rng.random() < 0.4}
    layers: dict = {}

    if job['type'] == 'drums':
        bars = 4
        length = start + bars * 4 * beat + 1.0
        x = np.zeros(int(length * RATE))
        layers = {
            'kick': rng.choice([None, 'four', 'four', 'broken']),
            'hat': rng.choice([None, 'offbeat', 'eighths', 'sixteenths', 'open-offbeat']),
            'snare': None, 'clap': None, 'crash': rng.random() < 0.25,
        }
        backbeat = rng.choice(['snare', 'clap', 'both', 'none'], p=[0.35, 0.35, 0.15, 0.15])
        pattern = str(rng.choice(['backbeat', 'backbeat', 'quarter', 'eighth', 'sixteenth', 'ramp']))
        if backbeat in ('snare', 'both'):
            layers['snare'] = pattern
        if backbeat in ('clap', 'both'):
            layers['clap'] = pattern
        # Some clips have one drum alone (a snare with a strong body and nothing around it read as half a kick). Drawn from a stream of its
        # own, so the other clips are the same as without it.
        solo = np.random.default_rng(job['seed'] + 1)
        if solo.random() < 0.15:
            only = str(solo.choice(KINDS))
            pattern = {'kick': 'four', 'hat': 'eighths', 'snare': 'backbeat', 'clap': 'backbeat'}[only]
            layers = {k: (layers[k] or pattern if k == only else None) for k in KINDS} | {'crash': False}
        # The kit starts after the lead-in, on the grid; the melodic layers play from the start.
        drums(x, rng, pick, beat, start, bars, layers, hits)
        melodic(x, rng, beat, 0, length, melodic_parts)
        end = start + bars * 4 * beat
    else:
        rise_bars = int(rng.choice([2, 4, 4, 8]))
        lead_bars, after_bars = 2, 2
        length = start + (lead_bars + rise_bars + after_bars) * 4 * beat + 0.5
        x = np.zeros(int(length * RATE))
        rise_from = start + lead_bars * 4 * beat
        rise_to = rise_from + rise_bars * 4 * beat
        kit = job['type'] == 'breakdown' or rng.random() < 0.8
        lead = {'kick': 'four' if kit else None, 'hat': rng.choice([None, 'offbeat', 'sixteenths']) if kit else None,
                'snare': 'backbeat' if kit and rng.random() < 0.5 else None, 'clap': None, 'crash': kit and rng.random() < 0.3}
        drums(x, rng, pick, beat, start, lead_bars, lead, hits)
        build = {'kick': rng.choice([None, 'four']) if kit else None, 'hat': lead['hat'],
                 'snare': rng.choice(['ramp', 'eighth', 'sixteenth', None]) if kit else None, 'clap': None, 'crash': False}
        if job['type'] == 'breakdown':
            # The kick and bass cut out at the bar line and pads (with whatever else) come in; the hats stay on in some.
            build = {'kick': None, 'hat': lead['hat'] if rng.random() < 0.3 else None, 'snare': None, 'clap': None, 'crash': False}
        drums(x, rng, pick, beat, rise_from, rise_bars, build, hits)
        drop = kit and rng.random() < 0.6
        after = {'kick': 'four' if drop else None, 'hat': lead['hat'] if drop else None, 'snare': 'backbeat' if drop else None, 'clap': None,
                 'crash': drop}
        drums(x, rng, pick, beat, rise_to, after_bars, after, hits)
        if job['type'] == 'breakdown':
            melodic_parts = (melodic_parts - {'pad'}) | {'bass'}
            melodic(x, rng, beat, 0, rise_from, melodic_parts)
            parts = {'pad'} | {p for p in ('stabs', 'vocal') if rng.random() < 0.4}
            melodic(x, rng, beat, rise_from, rise_to - rise_from, parts)
            melodic(x, rng, beat, rise_to, length - rise_to, melodic_parts if drop else parts)
            if rng.random() < 0.3:
                n_bd = int((rise_to - rise_from) * RATE)
                place(x, filt(2, (3000, 12000), 'bandpass', rng.standard_normal(n_bd)), rise_from, db(rng.uniform(-36, -24)))
            melodic_parts = melodic_parts | parts
        else:
            melodic(x, rng, beat, 0, length, melodic_parts)
        n = int((rise_to - rise_from) * RATE)
        layers = {'lead': lead, 'build': build, 'after': after}
        if job['type'] == 'riser':
            y, kind = riser(n, rng)
            place(x, y, rise_from, db(rng.uniform(-18, -6)))
            risers.append([round(rise_from, 3), round(rise_to, 3)])
            layers['riser'] = kind
        elif job['type'] == 'breakdown':
            layers['lookalike'] = 'breakdown'
        else:
            look = str(rng.choice(['none', 'fade', 'steady', 'downlifter']))
            layers['lookalike'] = look
            if look == 'fade':
                at = int(rise_from * RATE)
                x[:at] *= 0
                x[at: at + n] *= np.linspace(0, 1, n)
                # Nothing before the fade is heard, and its first half is too quiet to count as hits.
                for k in KINDS:
                    hits[k] = [t for t in hits[k] if t >= rise_from + (rise_to - rise_from) / 2]
            elif look == 'steady':
                place(x, filt(2, (2000, 12000), 'bandpass', rng.standard_normal(n)), rise_from, db(rng.uniform(-30, -18)))
            elif look == 'downlifter':
                y = sweep(n, rng, rng.uniform(6000, 12000), rng.uniform(250, 600), 'noise')
                y /= np.sqrt(np.mean(y ** 2)) + 1e-9
                place(x, y * np.linspace(1, 0.1, n), rise_from, db(rng.uniform(-18, -8)))
        end = rise_to + after_bars * 4 * beat

    mic = job['mic']
    x = L.simulate_mic(x, mic, rng)
    np.clip(x, -1, 1, out=x)
    band_levels(x).astype('<f4').tofile(os.path.join(job['out'], f"{job['id']}.f32"))
    if job['spectrum']:
        analyser.spectrum_ticks(x).astype('<f4').tofile(os.path.join(job['out'], f"{job['id']}.spec"))
    clean = lambda v: v.item() if isinstance(v, np.generic) else v  # noqa: E731
    kind = 'plain' if job['type'] == 'breakdown' else job['type']
    return {'id': job['id'], 'type': kind, 'fold': job['fold'], 'bpm': round(bpm, 3), 'mic': mic, 'start': round(start, 3),
            'end': round(end, 3), 'layers': json.loads(json.dumps(layers, default=clean)), 'melodic': sorted(melodic_parts),
            'hits': {k: [round(t, 4) for t in sorted(v)] for k, v in hits.items()}, 'risers': risers}


def band_levels(x: np.ndarray) -> np.ndarray:
    # levels.py's main, as a function.
    frames = int(len(x) / RATE * L.FPS)
    ends = (np.arange(frames) * RATE / L.FPS).astype(np.int64)
    out = np.zeros((frames, len(L.BANDS)), dtype=np.float32)
    for b, (low, high, window) in enumerate(L.BANDS):
        y = x
        for kind, freq in (('highpass', low), ('highpass', low), ('lowpass', high), ('lowpass', high)):
            bb, aa = L.webaudio_biquad(kind, freq)
            y = lfilter(bb, aa, y)
        csum = np.concatenate([[0.0], np.cumsum(y ** 2)])
        starts = np.maximum(0, ends - window)
        out[:, b] = np.sqrt((csum[ends] - csum[starts]) / np.maximum(1, ends - starts)) * 100
    return out


def fold_of(name: str) -> int:
    # drum-samples.py names a sample <kit>__<file>: every sample of a kit is in one fold, so a fold's drum machines are never heard in
    # training. Other names are folded one by one.
    return zlib.crc32(name.split('__')[0].encode()) % FOLDS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('samples')
    ap.add_argument('out')
    ap.add_argument('--drum-clips', type=int, default=2400)
    ap.add_argument('--riser-clips', type=int, default=500)
    ap.add_argument('--plain-clips', type=int, default=250)
    ap.add_argument('--breakdown-clips', type=int, default=0)
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--spectrum', action='store_true')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    kinds = KINDS + ['cymbal']
    files = {k: sorted(os.path.join(args.samples, k, f) for f in os.listdir(os.path.join(args.samples, k))) for k in kinds}
    by_fold = [{k: [p for p in files[k] if fold_of(os.path.basename(p)) == f] or files[k] for k in kinds} for f in range(FOLDS)]
    jobs = [{'type': t} for t, n in (('drums', args.drum_clips), ('riser', args.riser_clips), ('plain', args.plain_clips),
                                     ('breakdown', args.breakdown_clips)) for _ in range(n)]
    for i, job in enumerate(jobs):
        fold = int(rng.integers(FOLDS))
        job.update(id=f"{'b' if job['type'] == 'breakdown' else 'd'}{i:05d}", fold=fold, samples=by_fold[fold],
                   mic=str(rng.choice(MICS, p=MIC_P)), seed=int(rng.integers(1 << 31)), out=args.out, spectrum=args.spectrum)
    with Pool(args.workers) as pool, open(os.path.join(args.out, 'truth.jsonl'), 'w') as truth:
        for n, row in enumerate(pool.imap_unordered(make, jobs, chunksize=4)):
            truth.write(json.dumps(row) + '\n')
            if n % 200 == 0:
                print(f'{n}/{len(jobs)}', file=sys.stderr, flush=True)
    print(f'{len(jobs)} clips', file=sys.stderr)


if __name__ == '__main__':
    main()

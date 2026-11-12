"""Trains the beat network (packages/beatsense/src/grid/beat-net.ts): a small causal GRU that reads the five onset-band levels and says, every 10 ms,
how likely a beat (and a downbeat) is right now. It learns what a beat sounds like in each song from what it has heard so far (the kick in
one, a clap in another), which a rise in energy alone cannot tell (docs/experiments/madmom-benchmark.md: our grid's beats land on the
off-beat 14% of the time).

    python beat-net.py train <levels dir> <structures dir> <out dir> [--steps 6000] [--hidden 32] [--threads 16]
        [--extra '<levels dir>|<beats dir>[,...]'] [--stretch 0] [--init earlier/model.pt]
    python beat-net.py export <out dir>/model.pt ../../packages/beatsense/src/grid/beat-net-model.json
    python beat-net.py score <out dir>/model.pt <levels dir> <structures dir> [--folds 6,7]
    python beat-net.py fixture <out dir>/model.pt <levels file> ../../packages/beatsense/test/grid/beat-net.fixture.json   (for beat-net.test.ts)

Levels are Raveform's (raveform-fetch.py: <key>.f16, or levels.py's <key>.f32), 60 fps, frames x 5, % of full scale. Labels are its marked
beats (structures/beats/<key>.beat.csv: time, beat in bar). Raveform's folds: train on 0 to 4, choose on 5, report on 6 and 7.

The input, the same here and in beat-net.ts (keep them in step):
  1. Each frame's band levels in dB (floor -60), interpolated linearly in dB onto a 10 ms hop grid (hop k at k * 10 ms).
  2. Per hop and band, with `prev` the hop before and two followers (exponential, updated after they are read):
       (dB - slow) / 20          slow: time constant 3 s, starting at the first hop's dB
       max(0, dB - fast) / 10    fast: time constant 30 ms
       max(0, dB - prev) / 10
     15 inputs, band-major in that order per band: [lvl0, rise0, step0, lvl1, rise1, step1, ...].
  3. A 2-layer GRU (PyTorch's equations) and a linear layer to two logits: beat now, downbeat now.

Training reads random 15 s windows (plus 5 s of warm-up that is not scored), half of them through a simulated laptop mic in the level
domain (bass and low band cut, a noise floor, a reverb smear, a random gain), so it holds up without the bass, and each stretched in time
by up to --stretch (beats moved with it), so it sees more tempos than the songs have. --extra adds sets with beats marked by another
tracker (teacher-beats.py: GiantSteps, SSME), every track of them in training; several levels dirs can share one beats dir (clean, room
and laptop levels of the same songs).
"""
import argparse
import csv
import json
import math
import os
import random
import sys
import time

import numpy as np
from scipy.signal import lfilter

SOURCE_FPS = 60
HOP_MS = 10
BANDS = 5
FLOOR_DB = -60.0
SLOW_TAU_MS = 3000.0
FAST_TAU_MS = 30.0
INPUTS = BANDS * 3
WINDOW_HOPS = 1500
WARMUP_HOPS = 500


def load_levels(path: str) -> np.ndarray:
    dtype = '<f2' if path.endswith('.f16') else '<f4'
    return np.fromfile(path, dtype=dtype).astype(np.float64).reshape(-1, BANDS)


def to_hops(levels: np.ndarray, fps: float = SOURCE_FPS) -> np.ndarray:
    """Band levels (frames x 5, % of full scale) to dB on the 10 ms hop grid, interpolated linearly in dB."""
    db = np.maximum(FLOOR_DB, 20 * np.log10(np.maximum(levels, 1e-6)))
    frame_t = np.arange(len(db)) * (1000 / fps)
    hop_t = np.arange(0, frame_t[-1] + 1e-9, HOP_MS)
    return np.stack([np.interp(hop_t, frame_t, db[:, b]) for b in range(BANDS)], axis=1)


def follower_before(x: np.ndarray, tau_ms: float) -> np.ndarray:
    """An exponential follower of x, as read on each hop before that hop updates it (starting at x[0])."""
    a = 1 - math.exp(-HOP_MS / tau_ms)
    y, _ = lfilter([a], [1, -(1 - a)], x, zi=[(1 - a) * x[0]])
    return np.concatenate([[x[0]], y[:-1]])


def features(hops_db: np.ndarray) -> np.ndarray:
    out = np.zeros((len(hops_db), INPUTS), dtype=np.float32)
    for b in range(BANDS):
        d = hops_db[:, b]
        slow = follower_before(d, SLOW_TAU_MS)
        fast = follower_before(d, FAST_TAU_MS)
        prev = np.concatenate([[d[0]], d[:-1]])
        out[:, b * 3] = (d - slow) / 20
        out[:, b * 3 + 1] = np.maximum(0, d - fast) / 10
        out[:, b * 3 + 2] = np.maximum(0, d - prev) / 10
    return out


def laptop_mic(levels: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Roughly what levels.py --mic laptop does, in the level domain: no bass, less low band, a noise floor, a reverb smear, a gain."""
    power = levels ** 2
    gains_db = np.array([-rng.uniform(15, 35), -rng.uniform(2, 12), 0, 0, -rng.uniform(0, 8)])
    power = power * 10 ** (gains_db / 10)
    tau_frames = rng.uniform(3, 12)
    a = 1 - math.exp(-1 / tau_frames)
    wet = rng.uniform(0.1, 0.4)
    tail = lfilter([a], [1, -(1 - a)], power, axis=0)
    power = (1 - wet) * power + wet * tail
    rms = np.sqrt(np.mean(power, axis=0)) + 1e-9
    noise = (rms * 10 ** (-rng.uniform(35, 50) / 20)) ** 2
    return np.sqrt(power + noise) * 10 ** (rng.uniform(-20, 10) / 20)


def read_beats(path: str) -> tuple[np.ndarray, np.ndarray]:
    """Marked beat times and downbeat times, in seconds."""
    beats, downs = [], []
    with open(path) as f:
        for row in csv.DictReader(f):
            t = float(row['time'])
            beats.append(t)
            if row['downbeat'].strip() == '1':
                downs.append(t)
    return np.array(beats), np.array(downs)


def targets(beats: np.ndarray, downs: np.ndarray, hops: int) -> np.ndarray:
    """Beat and downbeat targets per hop (times in seconds from the first hop): 1 on the hop of a marked beat, 0.5 on its neighbours."""
    y = np.zeros((hops, 2), dtype=np.float32)
    for c, times in ((0, beats), (1, downs)):
        for t in times:
            k = int(round(t * 1000 / HOP_MS))
            for d, w in ((-1, 0.5), (0, 1.0), (1, 0.5)):
                if 0 <= k + d < hops:
                    y[k + d, c] = max(y[k + d, c], w)
    return y


def tracks(levels_dir: str, structures: str, folds: set) -> list:
    segments = {s['key']: s for s in json.load(open(os.path.join(structures, 'segments.json')))}
    out = []
    for name in sorted(os.listdir(levels_dir)):
        key, ext = os.path.splitext(name)
        if ext not in ('.f16', '.f32') or key not in segments or segments[key]['fold'] not in folds:
            continue
        beats = os.path.join(structures, 'beats', f'{key}.beat.csv')
        if os.path.exists(beats):
            out.append((key, os.path.join(levels_dir, name), beats))
    return out


def extra_tracks(spec: str) -> list:
    """--extra ('levels|beats,levels|beats'): every track in each levels dir that has a beats file of the same id in its beats dir."""
    out = []
    for pair in filter(None, spec.split(',')):
        # '|' between the two: Windows paths have colons.
        levels_dir, beats_dir = pair.split('|')
        for name in sorted(os.listdir(levels_dir)):
            key, ext = os.path.splitext(name)
            beats = os.path.join(beats_dir, f'{key}.beat.csv')
            if ext in ('.f16', '.f32') and os.path.exists(beats):
                out.append((key, os.path.join(levels_dir, name), beats))
    return out


def model_for(hidden: int):
    import torch
    from torch import nn

    class BeatNet(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.gru = nn.GRU(INPUTS, hidden, num_layers=2, batch_first=True)
            self.out = nn.Linear(hidden, 2)

        def forward(self, x):
            h, _ = self.gru(x)
            return self.out(h)

    return BeatNet()


def peak_f(act: np.ndarray, truth_s: np.ndarray, threshold: float, from_s: float = 10.0) -> float:
    """A quick beat F for monitoring: local maxima over 70 ms either side above the threshold, against the marks (70 ms)."""
    k = np.arange(len(act))
    pad = 7
    padded = np.pad(act, pad, constant_values=-1)
    is_max = np.all([act >= padded[pad + d: pad + d + len(act)] for d in range(-pad, pad + 1) if d != 0], axis=0)
    pred = k[(act > threshold) & is_max] * HOP_MS / 1000
    pred = pred[pred >= from_s]
    truth = truth_s[truth_s >= from_s]
    if len(pred) == 0 or len(truth) == 0:
        return 0.0
    used = np.zeros(len(truth), dtype=bool)
    hits = 0
    for p in pred:
        i = int(np.argmin(np.abs(truth - p)))
        if abs(truth[i] - p) <= 0.07 and not used[i]:
            used[i] = True
            hits += 1
    if hits == 0:
        return 0.0
    precision, recall = hits / len(pred), hits / len(truth)
    return 2 * precision * recall / (precision + recall)


def activations(model, levels: np.ndarray) -> np.ndarray:
    import torch
    with torch.no_grad():
        x = torch.from_numpy(features(to_hops(levels))).unsqueeze(0)
        return torch.sigmoid(model(x))[0].numpy()


def evaluate(model, items: list, rng: np.random.Generator, mic: bool = False, threshold: float = 0.3) -> dict:
    beat, down = [], []
    for _, lpath, bpath in items:
        levels = load_levels(lpath)
        if mic:
            levels = laptop_mic(levels, rng)
        act = activations(model, levels)
        t, d = read_beats(bpath)
        beat.append(peak_f(act[:, 0], t, threshold))
        down.append(peak_f(act[:, 1], d, threshold))
    return {'beat_f': float(np.mean(beat)), 'down_f': float(np.mean(down)), 'n': len(items)}


def train(args) -> None:
    import torch
    torch.set_num_threads(args.threads)
    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    random.seed(0)
    os.makedirs(args.out, exist_ok=True)
    train_items = tracks(args.levels, args.structures, {0, 1, 2, 3, 4})
    extra = extra_tracks(args.extra)
    val_items = tracks(args.levels, args.structures, {5})
    print(f'{len(train_items)} Raveform training tracks, {len(extra)} extra, {len(val_items)} validation', flush=True)
    # The levels and beat times of every training track, kept in memory (float16 levels).
    data = []
    for _, lpath, bpath in train_items + extra:
        data.append((load_levels(lpath).astype(np.float16), *read_beats(bpath)))
    lengths = np.array([len(levels) for levels, _, _ in data], dtype=np.float64)
    pick = lengths / lengths.sum()
    model = model_for(args.hidden)
    # --init starts from an earlier model's weights (a second round on more data), with a fresh optimizer and schedule.
    if args.init and not os.path.exists(os.path.join(args.out, 'ckpt.pt')):
        model.load_state_dict(torch.load(args.init, weights_only=False)['state'])
        print(f'starting from {args.init}', flush=True)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, args.steps)
    loss_fn = torch.nn.BCEWithLogitsLoss(reduction='none')
    frames_per_window = int((WINDOW_HOPS + WARMUP_HOPS) * HOP_MS / 1000 * SOURCE_FPS) + 2
    # The shortest window any permitted stretch asks for: a track that fits it can be sampled (longer stretches are skipped per sample).
    shortest_stretch = math.exp(-args.stretch) if args.stretch > 0 else 1.0
    needed = int(np.ceil(frames_per_window * shortest_stretch)) + 2
    if not any(len(levels) >= needed for levels, _, _ in data):
        sys.exit(f'no track is long enough for a {(WINDOW_HOPS + WARMUP_HOPS) * HOP_MS / 1000:.0f} s window ({needed} frames)')
    best = -1.0
    first = 1
    # A run longer than one sitting picks up from its last checkpoint (written at every check): same model, optimizer and schedule.
    ckpt_path = os.path.join(args.out, 'ckpt.pt')
    if os.path.exists(ckpt_path):
        ckpt = torch.load(ckpt_path, weights_only=False)
        model.load_state_dict(ckpt['model'])
        optimizer.load_state_dict(ckpt['optimizer'])
        scheduler.load_state_dict(ckpt['scheduler'])
        first, best = ckpt['step'] + 1, ckpt['best']
        rng = np.random.default_rng(ckpt['step'])
        print(f'resuming at step {first}, best {best:.3f}', flush=True)
    started = time.time()
    for step in range(first, args.steps + 1):
        xs, ys = [], []
        while len(xs) < args.batch:
            levels, beats, downs = data[rng.choice(len(data), p=pick)]
            # Stretched by s: the window reads s times as many source frames, so the music (and its beats) runs s times faster.
            s = float(np.exp(rng.uniform(-args.stretch, args.stretch))) if args.stretch > 0 else 1.0
            span = int(np.ceil(frames_per_window * s)) + 1
            if len(levels) < span + 1:
                continue
            f0 = int(rng.integers(0, len(levels) - span))
            at = f0 + np.arange(frames_per_window) * s
            lo = np.floor(at).astype(int)
            frac = (at - lo)[:, None]
            src = levels.astype(np.float64)
            window = src[lo] * (1 - frac) + src[np.minimum(lo + 1, len(src) - 1)] * frac
            if rng.random() < 0.5:
                window = laptop_mic(window, rng)
            elif rng.random() < 0.5:
                window = window * 10 ** (rng.uniform(-20, 10) / 20)
            x = features(to_hops(window))[: WINDOW_HOPS + WARMUP_HOPS]
            if len(x) < WINDOW_HOPS + WARMUP_HOPS:
                continue
            start_s = f0 / SOURCE_FPS
            target = targets((beats - start_s) / s, (downs - start_s) / s, len(x))
            xs.append(x)
            ys.append(target)
        x = torch.from_numpy(np.stack(xs))
        y = torch.from_numpy(np.stack(ys))
        logits = model(x)
        loss = loss_fn(logits[:, WARMUP_HOPS:], y[:, WARMUP_HOPS:])
        # Beats are about 2 hops in 100: weigh them up so the net does not learn "never".
        weight = 1 + args.pos_weight * y[:, WARMUP_HOPS:]
        loss = (loss * weight).mean()
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        if step % 100 == 0:
            print(f'step {step} loss {loss.item():.4f} {time.time() - started:.0f}s', flush=True)
        if step % args.eval_every == 0 or step == args.steps:
            model.eval()
            sample = random.Random(1).sample(val_items, min(args.val_tracks, len(val_items)))
            clean = evaluate(model, sample, np.random.default_rng(1))
            mic = evaluate(model, sample, np.random.default_rng(1), mic=True)
            model.train()
            score = clean['beat_f'] + mic['beat_f']
            print(f'  val clean beat F {clean["beat_f"]:.3f} down F {clean["down_f"]:.3f} | laptop beat F {mic["beat_f"]:.3f} down F {mic["down_f"]:.3f}', flush=True)
            if score > best:
                best = score
                torch.save({'state': model.state_dict(), 'hidden': args.hidden, 'step': step, 'val': [clean, mic]}, os.path.join(args.out, 'model.pt'))
            torch.save({'model': model.state_dict(), 'optimizer': optimizer.state_dict(), 'scheduler': scheduler.state_dict(), 'step': step, 'best': best}, ckpt_path)
    print(f'done, best val score {best:.3f}', flush=True)


def load_model(path: str):
    import torch
    saved = torch.load(path, weights_only=False)
    model = model_for(saved['hidden'])
    model.load_state_dict(saved['state'])
    model.eval()
    return model, saved


def export(args) -> None:
    model, saved = load_model(args.model)
    round_list = lambda t: [float(f'{v:.6g}') for v in t.detach().numpy().ravel()]
    layers = []
    for layer in range(2):
        layers.append({name: round_list(getattr(model.gru, f'{name}_l{layer}')) for name in ('weight_ih', 'weight_hh', 'bias_ih', 'bias_hh')})
    out = {
        'about': f'beat-net.py, step {saved["step"]} (see the training log for its data)',
        'inputs': INPUTS, 'hidden': saved['hidden'], 'hopMs': HOP_MS, 'slowTauMs': SLOW_TAU_MS, 'fastTauMs': FAST_TAU_MS, 'floorDb': FLOOR_DB,
        'layers': layers, 'outWeight': round_list(model.out.weight), 'outBias': round_list(model.out.bias),
    }
    json.dump(out, open(args.json, 'w'), separators=(',', ':'))
    print('exported', args.json, os.path.getsize(args.json) // 1024, 'KB')


def score(args) -> None:
    model, _ = load_model(args.model)
    folds = {int(f) for f in args.folds.split(',')}
    items = tracks(args.levels, args.structures, folds)
    for mic in (False, True):
        r = evaluate(model, items, np.random.default_rng(2), mic=mic)
        print(f'folds {args.folds} {"laptop" if mic else "clean "}: beat F {r["beat_f"]:.3f} downbeat F {r["down_f"]:.3f} (n={r["n"]}, peak picking, not the grid)')


def fixture(args) -> None:
    """Three seconds of real levels and the activations PyTorch gives for them, so beat-net.test.ts can check the TypeScript runs the same net."""
    model, _ = load_model(args.model)
    levels = load_levels(args.levels)[600:780]
    act = activations(model, levels)
    json.dump({'fps': SOURCE_FPS, 'levels': [[float(f'{v:.6g}') for v in row] for row in levels],
               'beat': [float(f'{v:.6g}') for v in act[:, 0]], 'downbeat': [float(f'{v:.6g}') for v in act[:, 1]]}, open(args.json, 'w'))
    print('fixture', args.json, len(levels), 'frames', len(act), 'hops')


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='cmd', required=True)
    t = sub.add_parser('train')
    t.add_argument('levels'); t.add_argument('structures'); t.add_argument('out')
    t.add_argument('--steps', type=int, default=6000); t.add_argument('--hidden', type=int, default=32)
    t.add_argument('--batch', type=int, default=32); t.add_argument('--lr', type=float, default=2e-3)
    t.add_argument('--pos-weight', type=float, default=4.0); t.add_argument('--threads', type=int, default=16)
    t.add_argument('--eval-every', type=int, default=500); t.add_argument('--val-tracks', type=int, default=24)
    t.add_argument('--extra', default=''); t.add_argument('--stretch', type=float, default=0.0); t.add_argument('--init', default='')
    e = sub.add_parser('export')
    e.add_argument('model'); e.add_argument('json')
    s = sub.add_parser('score')
    s.add_argument('model'); s.add_argument('levels'); s.add_argument('structures'); s.add_argument('--folds', default='6,7')
    x = sub.add_parser('fixture')
    x.add_argument('model'); x.add_argument('levels'); x.add_argument('json')
    args = parser.parse_args()
    {'train': train, 'export': export, 'score': score, 'fixture': fixture}[args.cmd](args)


if __name__ == '__main__':
    main()

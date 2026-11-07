"""Scores a run.mts output against expert labels (drop times, build and break intervals).

    python score.py <run.json> <gt.json> [--per-song] [--playlist]

Single songs:
  drop       a predicted drop (the label turning to drop) counts when it is within DROP_EARLY s before to DROP_LATE s after a labelled drop
  build      slot by slot: buildup (or turnaround, the stop at its end) shown against inside a labelled build
  turnaround an episode is right when a labelled drop lands from just before it to 3 s after it ends; a labelled drop is warned when an
             episode overlaps the 4 s before it; lead is how long before the drop the episode began
  anticip.   share of labelled drops that had buildup shown at some point in the 10 s before them (what auto mode needs to get ready)
  break      slot by slot: break shown against inside a labelled break
  resets     song changes inside one song (each file is one song, so every one is wrong)
Playlists (--playlist): how many real song changes were found (within -5 s to +25 s of the next song's start) and how many were invented.
"""
import json
import sys

import numpy as np

SLOT = 0.25
DROP_EARLY = 1.0
DROP_LATE = 3.0
ANTICIPATION_S = 10.0


def mask(intervals: list[tuple[float, float]], n: int) -> np.ndarray:
    out = np.zeros(n, dtype=bool)
    for start, end in intervals:
        out[int(start / SLOT): max(int(start / SLOT) + 1, int(end / SLOT))] = True
    return out


def onsets(sections: list[str], label: str) -> list[float]:
    return [(i + 1) * SLOT for i, s in enumerate(sections) if s == label and (i == 0 or sections[i - 1] != label)]


def runs_of(sections: list[str], label: str) -> list[tuple[float, float]]:
    """(start, end) in seconds of each run of a label."""
    out, start = [], None
    for i, s in enumerate(sections + ['']):
        if s == label and start is None:
            start = i * SLOT
        elif s != label and start is not None:
            out.append((start, i * SLOT))
            start = None
    return out


def match(pred: list[float], truth: list[float]) -> tuple[int, list[float]]:
    used: set[int] = set()
    latencies = []
    for g in truth:
        best = None
        for j, p in enumerate(pred):
            if j in used or not (g - DROP_EARLY <= p <= g + DROP_LATE):
                continue
            if best is None or abs(p - g) < abs(pred[best] - g):
                best = j
        if best is not None:
            used.add(best)
            latencies.append(pred[best] - g)
    return len(used), latencies


def f1(p: float, r: float) -> float:
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


def score_songs(runs: list[dict], gt: dict, per_song: bool) -> dict:
    tp = n_pred = n_true = 0
    lat: list[float] = []
    agg = {k: [0, 0, 0] for k in ('build', 'break')}  # overlap, predicted, true
    anticipated = anticipation_total = 0
    resets = 0
    unconfirmed = 0
    slots_total = 0
    scored = 0
    ta_episodes = ta_right = ta_warned = 0
    ta_lead: list[float] = []
    for run in runs:
        truth = gt.get(run['id'])
        # Tracks with no labels at all (63 of the 402) were not annotated, so they say nothing either way.
        if truth is None or not (truth['drop'] or truth['build_start'] or truth['break_start']):
            continue
        scored += 1
        sections = run['sections']
        n = len(sections)
        sec = np.array(sections)
        pred_drops = run['drops'] if run.get('drops') is not None else onsets(sections, 'drop')
        hits, latencies = match(pred_drops, truth['drop'])
        tp += hits
        n_pred += len(pred_drops)
        n_true += len(truth['drop'])
        lat += latencies
        song_scores = {}
        for key, label in (('build', 'buildup'), ('break', 'break')):
            m_true = mask(list(zip(truth[f'{key}_start'], truth[f'{key}_end'])), n)
            m_pred = (sec == label) | (sec == 'turnaround') if key == 'build' else sec == label
            agg[key][0] += int(np.sum(m_true & m_pred))
            agg[key][1] += int(np.sum(m_pred))
            agg[key][2] += int(np.sum(m_true))
            song_scores[key] = (int(np.sum(m_true & m_pred)), int(np.sum(m_pred)), int(np.sum(m_true)))
        build = (sec == 'buildup') | (sec == 'turnaround')
        episodes = runs_of(sections, 'turnaround')
        ta_episodes += len(episodes)
        ta_right += sum(1 for a, b in episodes if any(a - 0.5 <= d <= b + 3 for d in truth['drop']))
        for d in truth['drop']:
            warned = [a for a, b in episodes if a <= d + 0.5 and b >= d - 4]
            ta_warned += bool(warned)
            if warned:
                ta_lead.append(d - warned[0])
            lo, hi = int(max(0, d - ANTICIPATION_S) / SLOT), int(d / SLOT) + 2
            if hi <= n:
                anticipation_total += 1
                anticipated += bool(build[lo:hi].any())
        songs = run['songs']
        resets += sum(1 for i in range(1, n) if songs[i] != songs[i - 1])
        clock = run['clock']
        after = int(30 / SLOT)
        unconfirmed += sum(1 for c in clock[after:] if c is None)
        slots_total += max(0, n - after)
        if per_song:
            pd = ' '.join(f'{t:.0f}' for t in pred_drops)
            gd = ' '.join(f'{t:.0f}' for t in truth['drop'])
            print(f"{run['id']:>10} drops gt[{gd}] pred[{pd}] hit {hits}/{len(truth['drop'])}"
                  f" build {song_scores['build']} break {song_scores['break']} resets {sum(1 for i in range(1, n) if songs[i] != songs[i - 1])}")
    p = tp / n_pred if n_pred else 0.0
    r = tp / n_true if n_true else 0.0
    out = {
        'songs': scored,
        'drop_P': p, 'drop_R': r, 'drop_F1': f1(p, r),
        'drop_latency_median': float(np.median(lat)) if lat else None,
        'drops_pred_per_true': n_pred / max(1, n_true),
    }
    for key in ('build', 'break'):
        overlap, predicted, true = agg[key]
        kp = overlap / predicted if predicted else 0.0
        kr = overlap / true if true else 0.0
        out[f'{key}_P'], out[f'{key}_R'], out[f'{key}_F1'] = kp, kr, f1(kp, kr)
    out['anticipation'] = anticipated / max(1, anticipation_total)
    out['false_resets_per_song'] = resets / max(1, scored)
    out['unconfirmed_after_30s'] = unconfirmed / max(1, slots_total)
    out['mean_F1'] = (out['drop_F1'] + out['build_F1'] + out['break_F1']) / 3
    out['turnarounds'] = ta_episodes
    out['turnaround_P'] = ta_right / max(1, ta_episodes)
    out['turnaround_warns'] = ta_warned / max(1, n_true)
    out['turnaround_lead_median'] = float(np.median(ta_lead)) if ta_lead else None
    return out


def score_playlists(runs: list[dict]) -> dict:
    found = boundaries = invented = 0
    hours = 0.0
    lat = []
    for run in runs:
        songs = run['songs']
        changes = [(i + 1) * SLOT for i in range(1, len(songs)) if songs[i] != songs[i - 1]]
        starts = run['starts'][1:]
        used = set()
        for s in starts:
            boundaries += 1
            cands = [j for j, c in enumerate(changes) if j not in used and s - 5 <= c <= s + 25]
            if cands:
                used.add(cands[0])
                found += 1
                lat.append(changes[cands[0]] - s)
        invented += len(changes) - len(used)
        hours += run['seconds'] / 3600
    return {
        'boundaries': boundaries, 'found': found, 'recall': found / max(1, boundaries),
        'invented_per_hour': invented / max(hours, 1e-9), 'latency_median': float(np.median(lat)) if lat else None,
    }


def main() -> None:
    run = json.load(open(sys.argv[1]))
    if '--playlist' in sys.argv:
        result = score_playlists(run['runs'])
    else:
        result = score_songs(run['runs'], json.load(open(sys.argv[2])), '--per-song' in sys.argv)
    print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in result.items()}))


if __name__ == '__main__':
    main()

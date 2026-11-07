"""Precision and coverage of the rhythm names (the Beat HUD's line under the BPM), and the offline fits behind nameRhythm's confidence.

    python rhythm-names.py <sets.json> [--hold] [--before]

The names scored are each run's `rhythm` column as rhythm-features.mts wrote it: the Beat HUD's held label ("four on the floor · house &
techno tempo") for runs made by the current pattern-eval.mts, the unheld name for older runs (--hold applies the old HUD's 6-reading hold, --before
reads the old namer's "syncopated" as breakbeat).

<sets.json> lists the evaluated sets: [{ "name": "raveform", "features": "rf.json", "labels": "rf-labels.json", "split": "folds" }, ...]
(features from rhythm-features.mts; labels from pattern-labels.py; split "folds" uses Raveform's folds 0-3 / 4-7, "hash" the md5 half
of the id as pattern-score.py does). Every number printed is on the held-out half unless it says tune.

A tempo range is right when the track's genre is one the range is typical of (TEMPO_FAMILIES); readings of every track with a genre count.

A shown name is right when it matches the track's genre proxy: four on the floor on four on the floor genres, breakbeat (the app's
older "syncopated") and two-step on drum and bass and breaks (two-step: drum and bass only), half time on dubstep. Readings of tracks
without a proxy (and every Ballroom reading) cannot be scored right or wrong: Ballroom is reported as how often each name shows per dance.
  precision  right among readings with a name shown
  coverage   share of scored readings with a name shown
  changes    changes of the shown name per minute (to or from blank included), and those that land on a wrong name
"""
import hashlib
import json
import sys
from collections import Counter, defaultdict

import numpy as np

WARMUP_S = 12
READ_EVERY_S = 0.5
WINDOW_S = 12
RIGHT = {
    'four on the floor': {'four on the floor'},
    'breakbeat': {'breakbeat'},
    'syncopated': {'breakbeat'},
    'two-step': {'breakbeat'},
    'half time': {'half time'},
}


HOUSE = {'house', 'deep house', 'tech house', 'progressive house', 'melodic house & techno'}
TEMPO_FAMILIES = {
    'house & techno tempo': HOUSE | {'techno', 'mainstage', 'minimal', 'electro house'},
    'trance tempo': {'trance', 'psy trance'},
    'drum & bass tempo': {'drum & bass', 'drum and bass'},
}


def stable_half(key: str) -> str:
    return 'tune' if int(hashlib.md5(key.encode()).hexdigest(), 16) % 2 == 0 else 'test'


def load(sets: list[dict]) -> dict:
    """One table of readings over every set: features, and per reading its set, track, proxy, genre, half and drop/breakdown flags."""
    cols: dict[str, list] = defaultdict(list)
    columns = None
    for s in sets:
        data = json.load(open(s['features']))
        labels = json.load(open(s['labels']))
        columns = data['columns']
        for run in data['runs']:
            label = labels.get(run['id'])
            if label is None or not run['rows']:
                continue
            rows = np.array(run['rows'], dtype=np.float64)
            t = rows[:, 0]
            keep = t >= WARMUP_S
            n = int(keep.sum())
            if n == 0:
                continue
            if s['split'] == 'folds':
                half = 'tune' if label['fold'] <= 3 else 'test'
            else:
                half = stable_half(run['id'])
            inside = lambda spans: np.array([any(a + WINDOW_S <= x <= b for a, b in spans) for x in t[keep]], dtype=bool)  # noqa: E731
            cols['X'].append(rows[keep])
            cols['set'] += [s['name']] * n
            cols['id'] += [run['id']] * n
            cols['proxy'] += [label['proxy'] or ''] * n
            cols['genre'] += [label['genre'].lower().replace('-', ' ')] * n
            cols['half'] += [half] * n
            cols['rhythm'] += [x or '' for x, k in zip(run['rhythm'], keep) if k]
            cols['drop'].append(inside(label.get('drops', [])))
            cols['breakdown'].append(inside(label.get('breakdowns', [])))
    out = {k: (np.concatenate(v) if k in ('X', 'drop', 'breakdown') else np.array(v)) for k, v in cols.items()}
    out['columns'] = columns
    return out


def is_right(names: np.ndarray, proxy: np.ndarray, genre: np.ndarray) -> np.ndarray:
    right = np.zeros(len(names), dtype=bool)
    for name, ok in RIGHT.items():
        m = names == name
        right[m] = np.isin(proxy[m], list(ok))
    two = names == 'two-step'
    right[two] &= np.isin(genre[two], ['drum & bass', 'drum and bass'])
    return right


def held(names: list, hold: int) -> list:
    """The Beat HUD's hold: the first name shows at once, a change (blank included) only after `hold` readings in a row."""
    shown, candidate, streak, out = None, None, 0, []
    for reading in names:
        if reading == shown:
            candidate, streak = reading, 0
        else:
            streak = streak + 1 if reading == candidate else 1
            candidate = reading
            if shown is None or streak >= hold:
                shown = reading
        out.append(shown)
    return out


def apply_hold(d: dict, names: np.ndarray, hold: int) -> np.ndarray:
    out = np.empty_like(names)
    ids = d['id']
    starts = np.flatnonzero(np.r_[True, ids[1:] != ids[:-1]])
    ends = np.r_[starts[1:], len(ids)]
    for a, b in zip(starts, ends):
        out[a:b] = held(list(names[a:b]), hold) if hold > 1 else names[a:b]
    return out


def report(d: dict, names: np.ndarray, mask: np.ndarray, title: str) -> dict:
    """Precision, coverage and per-name precision over the masked readings with a proxy."""
    scored = mask & (d['proxy'] != '')
    shown = scored & (names != '')
    right = is_right(names, d['proxy'], d['genre'])
    res = dict(precision=float(right[shown].mean()) if shown.any() else float('nan'), coverage=float(shown.sum() / max(1, scored.sum())), n=int(scored.sum()))
    per = {}
    for name in sorted(set(names[shown])):
        m = shown & (names == name)
        per[name] = (float(right[m].mean()), int(m.sum()))
    res['per'] = per
    cls = {}
    for p in ('four on the floor', 'breakbeat', 'half time'):
        m = scored & (d['proxy'] == p)
        if m.any():
            cls[p] = (float((right & m).sum() / m.sum()), float(((names != '') & m).sum() / m.sum()))
    res['class'] = cls
    # Changes of the shown name (blank included) per minute of scored audio, and how many of them land on a wrong name.
    same_track = np.r_[False, d['id'][1:] == d['id'][:-1]]
    changed = same_track & (names != np.r_[[''], names[:-1]])
    minutes = scored.sum() * READ_EVERY_S / 60
    res['switches'] = float((changed & scored).sum() / minutes) if minutes else float('nan')
    res['wrong_switches'] = float((changed & shown & ~right).sum() / minutes) if minutes else float('nan')
    print(f'{title:44s} precision {res["precision"]:.3f}  coverage {res["coverage"]:.3f}  changes/min {res["switches"]:.2f} (to a wrong name {res["wrong_switches"]:.2f})  (n {res["n"]})')
    print('    per name: ' + ', '.join(f'{k} {v[0]:.2f} ({v[1]})' for k, v in per.items()))
    print('    per genre class (right, any name): ' + ', '.join(f'{k} {v[0]:.2f}/{v[1]:.2f}' for k, v in cls.items()))
    return res


def ballroom(d: dict, names: np.ndarray, mask: np.ndarray, title: str) -> None:
    m = mask & (d['set'] == 'ballroom')
    if not m.any():
        return
    print(f'{title}: share of readings with each name, per dance')
    for g in sorted(set(d['genre'][m])):
        gm = m & (d['genre'] == g)
        c = Counter(names[gm])
        total = gm.sum()
        print(f'    {g:22s} ' + ', '.join(f'{k or "none"} {v / total:.2f}' for k, v in c.most_common()))


def all_reports(d: dict, names: np.ndarray, label: str, half: str = 'test') -> dict:
    h = d['half'] == half
    out = {}
    for s in sorted(set(d['set'])):
        if s == 'ballroom':
            continue
        m = h & (d['set'] == s)
        out[s] = report(d, names, m, f'{label} {s}')
        if s == 'raveform':
            out['raveform drops'] = report(d, names, m & d['drop'], f'{label} raveform drops')
    ballroom(d, names, h, f'{label} ballroom')
    return out


def tempo_ranges(d: dict, suffix: np.ndarray, half: str = 'test') -> None:
    print('tempo ranges (share of readings with the range whose genre is typical of it):')
    for s in sorted(set(d['set'])):
        if s == 'ballroom':
            continue
        m = (d['half'] == half) & (d['set'] == s)
        for name, family in TEMPO_FAMILIES.items():
            r = m & (suffix == name)
            if not r.any():
                continue
            line = f'    {s:10s} {name:18s} {np.isin(d["genre"][r], list(family)).mean():.2f} ({r.sum()} readings, {len(set(d["id"][r]))} tracks)'
            if name == 'house & techno tempo':
                line += f', house genres alone {np.isin(d["genre"][r], list(HOUSE)).mean():.2f}'
            print(line)


def main() -> None:
    sets = json.load(open(sys.argv[1]))
    d = load(sets)
    hold = 6 if '--hold' in sys.argv else 1
    text = d['rhythm']
    names = np.array([x.split(' · ')[0] for x in text])
    suffix = np.array([x.split(' · ')[1] if ' · ' in x else '' for x in text])
    if '--before' in sys.argv:
        names = np.where(names == 'syncopated', 'breakbeat', names)
    all_reports(d, apply_hold(d, names, hold), 'app')
    tempo_ranges(d, suffix)


if __name__ == '__main__':
    main()

"""Grid search for the tempo-change song cue (packages/beatsense/src/tempo/tempo-change.ts) over runs made with run.mts --no-tempo.

    python tune_tempo_change.py <playlist runs>[,...] <single-song runs>[,...] [--folds 0,1]

The runs hold the BPM the tempo tracker showed every 250 ms and the song changes the tracker made without the cue. This replays the cue
over them (the same rules as TempoChangeCue, armed once the song is MIN_SONG_S old) next to those changes, which is quick enough for a grid;
it leaves out that a reset changes what the section model hears next, so the chosen setting is then checked with the real tracker.
Scored like score.py: a real change found within -5 s to +25 s, invented changes per hour, false resets per single song.
"""
import itertools
import json
import sys

SLOT = 0.25
MIN_SONG_S = 45
HARMONICS = (2, 0.5, 1.5, 2 / 3, 4 / 3, 3 / 4)


def load(paths: str) -> list[dict]:
    return [r for p in paths.split(',') for r in json.load(open(p))['runs']]


def replay(run: dict, min_change: float, hold_s: float, tol: float = 0.03, follow: float = 0.05) -> list[float]:
    songs, bpms = run['songs'], run['bpm']
    base = {(i + 1) * SLOT for i in range(1, len(songs)) if songs[i] != songs[i - 1]}
    changes, start, song_bpm, since = [], 0.0, None, None
    for i, bpm in enumerate(bpms):
        t = (i + 1) * SLOT
        armed = t - start >= MIN_SONG_S
        fired = False
        if bpm is None:
            since = None
        elif song_bpm is None or not armed:
            song_bpm, since = bpm, None
        else:
            ratio = bpm / song_bpm
            if abs(ratio - 1) <= min_change:
                song_bpm += (bpm - song_bpm) * follow
                since = None
            elif any(abs(ratio / h - 1) <= tol for h in HARMONICS):
                since = None
            else:
                since = t if since is None else since
                fired = t - since >= hold_s
        if t in base or (fired and armed):
            changes.append(t)
            start = t
            since = None
    return changes


def score(runs: list[dict], singles: list[dict], min_change: float, hold_s: float) -> tuple[float, float, float, dict]:
    found = total = invented = 0
    hours = 0.0
    by: dict[str, list[int]] = {}
    for run in runs:
        changes = replay(run, min_change, hold_s)
        used: set[int] = set()
        for s, join in zip(run['starts'][1:], run.get('joins') or []):
            total += 1
            hit = [j for j, c in enumerate(changes) if j not in used and s - 5 <= c <= s + 25]
            if hit:
                used.add(hit[0])
                found += 1
            by.setdefault(join['kind'], []).append(1 if hit else 0)
        invented += len(changes) - len(used)
        hours += run['seconds'] / 3600
    false = sum(len(replay(r, min_change, hold_s)) for r in singles) / max(1, len(singles))
    return found / max(1, total), invented / max(hours, 1e-9), false, {k: sum(v) / len(v) for k, v in sorted(by.items())}


HOLDS = (0, 2, 4, 6, 8, 12, 16, 20)


def main() -> None:
    runs, singles = load(sys.argv[1]), load(sys.argv[2])
    if '--folds' in sys.argv:
        folds = {int(f) for f in sys.argv[sys.argv.index('--folds') + 1].split(',')}
        runs = [r for r in runs if r.get('fold') in folds]
        singles = [r for r in singles if int(r['id'].split('.')[0]) % 5 in folds]
    print(f'{len(runs)} playlists, {len(singles)} single songs')
    off = score(runs, singles, 99, 0)
    print(f'off: recall {off[0]:.3f}, invented {off[1]:.2f}/h, false resets {off[2]:.3f}/song', {k: round(v, 2) for k, v in off[3].items()})
    for min_change, hold_s in itertools.product((0.03, 0.04, 0.05, 0.06, 0.08, 0.1), HOLDS):
        recall, invented, false, by = score(runs, singles, min_change, hold_s)
        print(f'min {min_change:.2f} hold {hold_s:>2} s: recall {recall:.3f}, invented {invented:.2f}/h, false resets {false:.3f}/song',
              {k: round(v, 2) for k, v in by.items()})


if __name__ == '__main__':
    main()

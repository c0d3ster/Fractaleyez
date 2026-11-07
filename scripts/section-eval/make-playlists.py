"""Writes playlists for run.mts --playlist with known tempos at every join, to score song changes by join type and by tempo difference.

    python make-playlists.py <levels dir> <tempos.json> <out.json> [--per-fold 6] [--songs 5] [--seed 1] [--kinds gap,crossfade,cut,cutmid]

tempos.json is { id: bpm }: labelled (the GiantSteps tempo set), or for songs without labels the tempo the tracker usually shows
(bpm-eval.mts --reader tracker, then the most common reading). Playlists are drawn from one fold's songs at a time (fold = id mod 5), so a
setting tuned on some folds can be scored on the others. Each playlist has one kind of join:

  gap        back to back, 0 to 5 s of silence (what dump-playlists.mts does)
  crossfade  4 to 10 s overlap, linear fades mixed in power (a player's crossfade between songs of any tempo)
  cut        the song cut off at a random point (at least 60 s in), the next one starting at its own start with no gap (clicking to the next song)
  cutmid     the same, but the next song also starts at a random point in its middle (scrubbing, or a hard DJ cut)

Each next song is picked so the tempo difference falls in a bin chosen at random (under 3%, 3 to 8%, over 8%), so all three are well covered.
Every entry carries "joins": [{ kind, bpmBefore, bpmAfter }] for score.py.
"""
import json
import os
import random
import sys

FPS = 60
BANDS = 5
MIN_PLAYED_S = 60
BINS = ((0, 0.03), (0.03, 0.08), (0.08, 10))


def option(name: str, fallback: str) -> str:
    return sys.argv[sys.argv.index(f'--{name}') + 1] if f'--{name}' in sys.argv else fallback


def main() -> None:
    levels, tempos_path, out = sys.argv[1:4]
    per_fold = int(option('per-fold', '6'))
    songs_per = int(option('songs', '5'))
    kinds = option('kinds', 'gap,crossfade,cut,cutmid').split(',')
    rng = random.Random(int(option('seed', '1')))
    tempos = {k: v for k, v in json.load(open(tempos_path)).items() if v and os.path.exists(os.path.join(levels, f'{k}.f32'))}
    length = {k: os.path.getsize(os.path.join(levels, f'{k}.f32')) / 4 / BANDS / FPS for k in tempos}
    by_fold: dict[int, list[str]] = {}
    for k in sorted(tempos):
        by_fold.setdefault(int(k.split('.')[0]) % 5, []).append(k)
    playlists = []
    for fold, ids in sorted(by_fold.items()):
        for kind in kinds:
            for _ in range(per_fold):
                pool = list(ids)
                first = pool.pop(rng.randrange(len(pool)))
                songs = [first]
                while len(songs) < songs_per:
                    lo, hi = BINS[rng.randrange(len(BINS))]
                    before = tempos[songs[-1]]
                    fits = [k for k in pool if lo <= abs(tempos[k] / before - 1) < hi] or pool
                    pick = rng.choice(fits)
                    pool.remove(pick)
                    songs.append(pick)
                segments = []
                for s, k in enumerate(songs):
                    start = rng.uniform(0.2, 0.5) * length[k] if kind == 'cutmid' and s > 0 else 0.0
                    left = length[k] - start
                    end = None
                    if kind in ('cut', 'cutmid') and s < len(songs) - 1 and left > MIN_PLAYED_S:
                        end = start + rng.uniform(max(MIN_PLAYED_S, 0.3 * left), max(MIN_PLAYED_S, 0.85 * left))
                    segments.append({'fromSeconds': round(start, 2), **({'toSeconds': round(end, 2)} if end is not None else {})})
                entry = {
                    'fold': fold, 'kind': kind, 'songs': songs,
                    'gapSeconds': rng.choice([0, 0, 0.5, 1, 2, 3, 5]) if kind == 'gap' else 0,
                    'crossfadeSeconds': 4 + round(rng.random() * 6) if kind == 'crossfade' else 0,
                    'joins': [{'kind': kind, 'bpmBefore': tempos[a], 'bpmAfter': tempos[b]} for a, b in zip(songs, songs[1:])],
                }
                if kind in ('cut', 'cutmid'):
                    entry['segments'] = segments
                playlists.append(entry)
    json.dump(playlists, open(out, 'w'))
    print(f'{len(playlists)} playlists, {sum(len(p["joins"]) for p in playlists)} joins')


if __name__ == '__main__':
    main()

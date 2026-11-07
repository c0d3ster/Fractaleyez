"""Proxy labels for the rhythm pattern names (the Beat HUD's line under the BPM), from each track's genre.

    python pattern-labels.py raveform <structures dir> <out.json>
    python pattern-labels.py giantsteps <annotations/genre dir> <out.json>
    python pattern-labels.py ballroom <BallroomData dir> <out.json>

Writes { id: { "genre": ..., "proxy": ..., "fold": n, "drops": [[start, end], ...] } }. "fold" and "drops" only for Raveform (its own
folds, and its drop sections, where the full drum pattern plays). "proxy" is null where the genre says nothing reliable about the drums.

The mapping, and why it is only a proxy:
  four on the floor: techno, tech house, house, deep house, progressive house, melodic house and techno, trance, psy-trance, mainstage,
      hard dance, hardcore, minimal, electro house. The kick is on every beat in nearly all of these, but only where the drums play:
      intros, breakdowns and buildups often have no kick, or a kick on its own without the rest.
  half time: dubstep (a kick on 1 and a snare on 3 at about 140 BPM, felt at 70). Some dubstep runs at full time in places.
  breakbeat: drum and bass (a two-step: kick on 1 and the "and" of 3, snare on 2 and 4, at 170 to 180 BPM) and breaks. The current
      code has no breakbeat name, so for it the closest is "syncopated".
  None (not scored): electronica, chill-out, glitch-hop, dj tools, pop-rock, reggae-dub, hip-hop, funk, indie dance, "Others": the
      drums vary too much within the genre to say.
Weaknesses: the label is per track while the name is per reading, so a breakdown without drums counts against a four on the floor track
(Raveform's drop sections are scored separately for that reason); genres are assigned by a store (Beatport) or a curator, not by
listening to the drums; and "the kick is on every beat" is about the kick, while the app's beats are the bass and hi bands together.
Ballroom has no EDM genres at all: its dances are reported as they are, to show what the names do on music they were not made for.
"""
import json
import os
import sys

# Genre names as Raveform and GiantSteps write them, lower case, hyphens as spaces.
FOUR = {'techno', 'tech house', 'house', 'deep house', 'progressive house', 'melodic house & techno', 'trance', 'psy trance', 'mainstage',
        'hard dance', 'hardcore hard techno', 'minimal', 'electro house'}
HALF = {'dubstep'}
BREAK = {'drum & bass', 'drum and bass', 'breaks'}


def proxy(genre: str) -> str | None:
    g = genre.lower().replace('-', ' ')
    if g in FOUR:
        return 'four on the floor'
    if g in HALF:
        return 'half time'
    if g in BREAK:
        return 'breakbeat'
    return None


def main() -> None:
    kind, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    labels = {}
    if kind == 'raveform':
        for track in json.load(open(os.path.join(src, 'segments.json'))):
            drops = [[s['start'], s['end']] for s in track['sections'] if s['name'] == 'drop']
            labels[track['key']] = dict(genre=track['genre'], proxy=proxy(track['genre']), fold=track['fold'], drops=drops)
    elif kind == 'giantsteps':
        for name in os.listdir(src):
            genre = open(os.path.join(src, name)).read().strip()
            labels[name[:-len('.genre')]] = dict(genre=genre, proxy=proxy(genre))
    elif kind == 'ballroom':
        for dance in sorted(os.listdir(src)):
            path = os.path.join(src, dance)
            if not os.path.isdir(path) or dance in ('allBallroomFiles', 'nada'):
                continue
            for name in os.listdir(path):
                if name.endswith('.wav'):
                    labels[name[:-4]] = dict(genre=dance.split('-')[0], proxy=None)
    json.dump(labels, open(out, 'w'), indent=0)
    print(f'{len(labels)} tracks, {sum(1 for x in labels.values() if x["proxy"])} with a proxy label')


if __name__ == '__main__':
    main()

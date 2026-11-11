"""Sorts one-shot drum samples from free collections into the folders drum-gen.py reads: kick/, hat/, snare/, clap/, cymbal/.

    git clone --depth 1 https://github.com/tidalcycles/Dirt-Samples <src>/Dirt-Samples
    git clone --depth 1 https://github.com/oramics/sampled <src>/sampled
    git clone --depth 1 https://github.com/geikha/tidal-drum-machines <src>/tidal-drum-machines   # optional, about 75 drum machines
    python drum-samples.py <src> <samples dir> [--sources dirt,sampled,tidal]

Each file is named <kit>__<where it came from>.<ext>. The kit is the drum machine or kit it was recorded from, under one name whichever
collection it is in (TR-808, RolandTR808 and Dirt's 808 folders are all tr808), and drum-gen.py puts every sample of a kit in the same fold,
so a model is scored on machines it never heard. Files that are byte for byte the same are kept once.

What goes where:
  Dirt-Samples   bd, clubkick: kick. sn, sd: snare. cp, realclaps: clap. hh (a whole kit): only its closed and open hats. Its 808bd and 808sd
                 are left out (the 808 is in the other two collections).
  sampled        DM/* and DRUMS/*, by file name: kick, snare, clap, hats (closed, pedal, open), cymbals (crash, ride, splash; the avl kit's
                 ride shank hits are left out). Rim shots, side sticks and toms are left out.
  tidal          machines/<machine>/<machine>-bd, sd, hh, oh, cp, cr, rd. No licence is stated for these recordings of drum machines: use them
                 to train and score, not to ship.

With dirt and sampled only, the counts are kick 66, hat 75, snare 113, clap 33, cymbal 89, the set the first drum model was trained on.
"""
import argparse
import hashlib
import os
import re
import shutil
import sys

KINDS = ['kick', 'hat', 'snare', 'clap', 'cymbal']
AUDIO = re.compile(r'\.(wav|aiff?|flac|mp3|ogg)$', re.I)
DIRT = {'bd': 'kick', 'clubkick': 'kick', 'sn': 'snare', 'sd': 'snare', 'cp': 'clap', 'realclaps': 'clap', 'hh': 'hat'}
TIDAL = {'bd': 'kick', 'sd': 'snare', 'hh': 'hat', 'oh': 'hat', 'cp': 'clap', 'cr': 'cymbal', 'rd': 'cymbal'}
MAKERS = r'^(roland|akai|alesis|boss|casio|korg|emu|linn|yamaha|oberheim|sequentialcircuits|simmons|soundmasters|univox|sakata|moog|rhodes|xdrum|doepfer|visco|serge)'
ALIASES = {'compurhythm78': 'cr78', '808': 'tr808', '909': 'tr909'}


def kit_key(name: str) -> str:
    key = re.sub(r'[^a-z0-9]', '', name.lower())
    key = re.sub(MAKERS, '', key) or key
    return ALIASES.get(key, key)


def by_name(file: str) -> str | None:
    """A sampled/ file's kind from its name (TR-808 files are like 01.BD.808.wav)."""
    low = file.lower()
    tag = re.match(r'\d+\.([A-Z]+)\d*\.808', file)
    if tag:
        return {'BD': 'kick', 'SD': 'snare', 'CP': 'clap', 'CH': 'hat', 'OH': 'hat', 'CY': 'cymbal'}.get(tag.group(1))
    if re.search(r'sidestick|rim|stick|tom|shank', low):
        return None
    for word, kind in (('kick', 'kick'), ('snare', 'snare'), ('clap', 'clap')):
        if word in low:
            return kind
    if 'hat' in low:
        return 'hat'
    if re.search(r'crash|ride|splash|cymbal|paiste', low):
        return 'cymbal'
    return None


def sources(src: str, use: set[str]):
    """Yields (path, kind, kit, label) for every sample to keep."""
    dirt = os.path.join(src, 'Dirt-Samples')
    if 'dirt' in use and os.path.isdir(dirt):
        for folder, kind in DIRT.items():
            for f in sorted(os.listdir(os.path.join(dirt, folder))):
                if not AUDIO.search(f) or (folder == 'hh' and not re.search(r'closedhh|openhh', f.lower())):
                    continue
                yield os.path.join(dirt, folder, f), kind, 'hh' if folder == 'hh' else f'dirt{folder}', f'dirt-{folder}-{f}'
    sampled = os.path.join(src, 'sampled')
    if 'sampled' in use and os.path.isdir(sampled):
        for top in ('DM', 'DRUMS'):
            for root, _, files in sorted(os.walk(os.path.join(sampled, top))):
                rel = os.path.relpath(root, os.path.join(sampled, top)).split(os.sep)
                for f in sorted(files):
                    kind = by_name(f) if AUDIO.search(f) else None
                    if kind:
                        yield os.path.join(root, f), kind, kit_key(rel[0]), 'sampled-' + '-'.join(p for p in rel if p != 'samples') + '-' + f
    tidal = os.path.join(src, 'tidal-drum-machines', 'machines')
    if 'tidal' in use and os.path.isdir(tidal):
        for machine in sorted(os.listdir(tidal)):
            for folder in sorted(os.listdir(os.path.join(tidal, machine))):
                kind = TIDAL.get(folder.rsplit('-', 1)[-1])
                if not kind:
                    continue
                for f in sorted(os.listdir(os.path.join(tidal, machine, folder))):
                    if AUDIO.search(f):
                        yield os.path.join(tidal, machine, folder, f), kind, kit_key(machine), f'tidal-{folder}-{f}'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--sources', default='dirt,sampled,tidal')
    args = ap.parse_args()
    for kind in KINDS:
        os.makedirs(os.path.join(args.out, kind), exist_ok=True)
    seen: set[str] = set()
    counts = {kind: 0 for kind in KINDS}
    kits: dict[str, set[str]] = {kind: set() for kind in KINDS}
    for path, kind, kit, label in sources(args.src, set(args.sources.split(','))):
        digest = hashlib.md5(open(path, 'rb').read()).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        shutil.copyfile(path, os.path.join(args.out, kind, f"{kit}__{re.sub(r'[^A-Za-z0-9._-]', '_', label)}"))
        counts[kind] += 1
        kits[kind].add(kit)
    print(', '.join(f'{k} {counts[k]} ({len(kits[k])} kits)' for k in KINDS), file=sys.stderr)


if __name__ == '__main__':
    main()

"""Maps Raveform's section labels onto the section model's (SSME's) labels, so its tracks can be trained on and scored like SSME's.

    python raveform-sections.py <segments.json> <fetched.json> <out gt.json> <out folds.json> [--all-drops] [--fold-mod 5]

Raveform marks every section of a track (intro, drop, breakdown, buildup, cooldown, outro, bridge, ...). SSME marks drop moments and
build and break intervals. The mapping:
  buildup              -> build interval
  breakdown, cooldown  -> break interval
  drop                 -> a drop event at its start, when the section before it is not a drop (a drop following a drop is
                          Raveform marking the next phrase of the same full-energy part, not the music dropping back in);
                          --all-drops keeps every drop section's start
  intro, outro, bridge and the rest -> other
Only tracks whose band levels were fetched (fetched.json "ok") are written. folds.json maps each key to Raveform's own fold
(0 to 7), or that fold mod --fold-mod when given, so the folds can be pooled with SSME's five (id mod 5).
"""
import json
import sys


def main() -> None:
    segments, fetched, out_gt, out_folds = sys.argv[1:5]
    all_drops = '--all-drops' in sys.argv
    mod = int(sys.argv[sys.argv.index('--fold-mod') + 1]) if '--fold-mod' in sys.argv else None
    ok = set(json.load(open(fetched))['ok'])
    gt, folds = {}, {}
    for track in json.load(open(segments)):
        key = track['key']
        if key not in ok:
            continue
        truth = {'drop': [], 'build_start': [], 'build_end': [], 'break_start': [], 'break_end': []}
        previous = None
        for s in track['sections']:
            name = s['name']
            if name == 'drop' and (all_drops or previous != 'drop'):
                truth['drop'].append(round(s['start'], 3))
            elif name == 'buildup':
                truth['build_start'].append(round(s['start'], 3)); truth['build_end'].append(round(s['end'], 3))
            elif name in ('breakdown', 'cooldown'):
                truth['break_start'].append(round(s['start'], 3)); truth['break_end'].append(round(s['end'], 3))
            previous = name
        gt[key] = truth
        folds[key] = track['fold'] % mod if mod else track['fold']
    json.dump(gt, open(out_gt, 'w'))
    json.dump(folds, open(out_folds, 'w'))
    print(f"{len(gt)} tracks, {sum(len(v['drop']) for v in gt.values())} drops, {sum(len(v['build_start']) for v in gt.values())} builds, "
          f"{sum(len(v['break_start']) for v in gt.values())} breaks", file=sys.stderr)


if __name__ == '__main__':
    main()

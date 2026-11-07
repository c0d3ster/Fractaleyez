"""Charts one song: the five band levels (dB, 1 s means), the expert labels and each tracker's sections underneath.

    python chart.py <levels.f32> <gt.json> <out.png> [run.json ...]
"""
import json
import os
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

COLORS = {'intro': '#50bed2', 'quiet': '#78829a', 'groove': '#5aa078', 'buildup': '#f0be3c', 'break': '#5a8cdc',
          'drop': '#eb506e', 'outro': '#a06ed2', 'main': '#5aa078'}
BAND_NAMES = ['bass', 'lo', 'mid', 'hi', 'air']
BAND_COLORS = ['#d33', '#e83', '#4a4', '#38c', '#a4c']


def main() -> None:
    levels_path, gt_path, out = sys.argv[1:4]
    runs = sys.argv[4:]
    song = os.path.basename(levels_path)[:-4]
    x = np.fromfile(levels_path, dtype='<f4').reshape(-1, 5).astype(np.float64)
    seconds = len(x) // 60
    power = (x[: seconds * 60] ** 2).reshape(seconds, 60, 5).mean(axis=1)
    db = 10 * np.log10(np.maximum(power, 1e-6))
    gt = json.load(open(gt_path)).get(song, {})

    fig, axes = plt.subplots(2 + len(runs), 1, figsize=(16, 4 + 0.5 * len(runs)), sharex=True,
                             gridspec_kw={'height_ratios': [6, 0.6] + [0.6] * len(runs)})
    ax = axes[0]
    t = np.arange(seconds)
    for b in range(5):
        ax.plot(t, db[:, b] - np.percentile(db[:, b], 90), color=BAND_COLORS[b], lw=1, label=BAND_NAMES[b])
    for s, e in zip(gt.get('build_start', []), gt.get('build_end', [])):
        ax.axvspan(s, e, color=COLORS['buildup'], alpha=0.25)
    for s, e in zip(gt.get('break_start', []), gt.get('break_end', [])):
        ax.axvspan(s, e, color=COLORS['break'], alpha=0.25)
    for d in gt.get('drop', []):
        ax.axvline(d, color=COLORS['drop'], lw=2)
    ax.set_ylim(-30, 8)
    ax.legend(loc='lower left', ncol=5, fontsize=8)
    ax.set_title(f'{song}  (yellow build, blue break, red drop = expert labels; band dB against each band\'s 90th percentile)')

    def strip(axis, labels: list[str], name: str) -> None:
        i = 0
        while i < len(labels):
            j = i
            while j < len(labels) and labels[j] == labels[i]:
                j += 1
            axis.axvspan(i * 0.25, j * 0.25, color=COLORS.get(labels[i], '#000'))
            i = j
        axis.set_yticks([])
        axis.set_ylabel(name, rotation=0, ha='right', fontsize=8)

    truth = ['groove'] * (seconds * 4)
    for s, e in zip(gt.get('break_start', []), gt.get('break_end', [])):
        truth[int(s * 4): int(e * 4)] = ['break'] * len(truth[int(s * 4): int(e * 4)])
    for s, e in zip(gt.get('build_start', []), gt.get('build_end', [])):
        truth[int(s * 4): int(e * 4)] = ['buildup'] * len(truth[int(s * 4): int(e * 4)])
    for d in gt.get('drop', []):
        truth[int(d * 4): int(d * 4) + 8] = ['drop'] * len(truth[int(d * 4): int(d * 4) + 8])
    strip(axes[1], truth, 'labels')
    for k, path in enumerate(runs):
        run = next(r for r in json.load(open(path))['runs'] if r['id'] == song)
        strip(axes[2 + k], run['sections'], os.path.basename(path).split('.')[0])
        changes = [(i + 1) * 0.25 for i in range(1, len(run['songs'])) if run['songs'][i] != run['songs'][i - 1]]
        for c in changes:
            axes[2 + k].axvline(c, color='white', lw=2)
    axes[-1].set_xticks(np.arange(0, seconds, 15))
    axes[-1].set_xlim(0, seconds)
    plt.tight_layout()
    plt.savefig(out, dpi=70)


if __name__ == '__main__':
    main()

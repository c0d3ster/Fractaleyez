"""The frozen evaluation of the stage 6 section model loop (docs/experiments/section-loop.md). Read-only for the loop.

    python section-loop-eval.py <data dir> <work dir> [--hidden] [--jobs 4]

<data dir> holds:
  ssme/gt.json                      SSME's labels (README, Data)
  ssme/levels/{clean,room,laptop}/  levels.py output per track (room and laptop with --mic, fixed seeds)
  rave/gt.json, rave/levels/        Raveform's labels mapped by raveform-sections.py, and its clean band levels
The split is docs/experiments/section-loop-split.json: SSME tracks with id mod 5 == 4 and Raveform folds 6 and 7 are hidden.

Tune metric: the remaining SSME tracks, 4-fold cross-validation (fold = id mod 5): train.py on clean, room and laptop features
(dump-features.mts, so section-features.ts changes count), each track run through the TypeScript tracker (run.mts, sections.ts) with the
fold model that never saw it, scored by score.py; mean F1 (drop, buildup, break) averaged over the clean and laptop feeds.
Check: Raveform folds 0 to 5 (clean), run through a model trained on all the tune tracks (SSME alone), mean F1.
--hidden: the same model on the hidden SSME tracks (clean and laptop) and Raveform folds 6 and 7. Run once at the start and once at the end.

The tracker runs without the beat grid (run.mts --no-grid), as the app does today (AudioFeed does not feed it the grid).
Prints one JSON line. Features are cached in <work dir> by a hash of the feature code.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TSX = os.path.join(ROOT, 'node_modules', '.bin', 'tsx')
SPLIT = os.path.join(ROOT, 'docs', 'experiments', 'section-loop-split.json')
FEATURE_CODE = ['section-features.ts', 'onset-detector.ts', 'onset-bands.ts', 'tempo-tracker.ts', 'beat-grid.ts', 'beat-grid-model.json']
CONDITIONS = ('clean', 'room', 'laptop')
SCORED = ('clean', 'laptop')


def sh(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def parallel(cmds: list[list[str]]) -> None:
    procs = [subprocess.Popen(c, cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE) for c in cmds]
    for p in procs:
        _, err = p.communicate()
        if p.returncode:
            raise RuntimeError(err.decode()[-2000:])


def chunks(ids: list[str], n: int) -> list[list[str]]:
    return [c for c in (ids[i::n] for i in range(n)) if c]


def features(data: str, work: str, ids: list[str], jobs: int) -> str:
    """Section features of the given SSME tracks, all three conditions, cached by the feature code's hash."""
    h = hashlib.sha256()
    for name in FEATURE_CODE:
        h.update(open(os.path.join(ROOT, 'src', 'audioanalysis', name), 'rb').read())
    out = os.path.join(work, 'features', h.hexdigest()[:12])
    for cond in CONDITIONS:
        missing = [k for k in ids if not os.path.exists(os.path.join(out, cond, f'{k}.feat'))]
        if not missing:
            continue
        cmds = []
        for j, part in enumerate(chunks(missing, jobs)):
            # dump-features.mts reads a whole levels dir, so each job gets a dir of links to its share.
            src = os.path.join(work, 'links', cond, str(j))
            shutil.rmtree(src, ignore_errors=True)
            os.makedirs(src)
            for k in part:
                os.symlink(os.path.join(data, 'ssme', 'levels', cond, f'{k}.f32'), os.path.join(src, f'{k}.f32'))
            cmds.append([TSX, 'dump-features.mts', src, os.path.join(out, cond)])
        parallel(cmds)
    return out


def run_tracker(levels: str, ids: list[str], models: str, out: str, jobs: int) -> list[dict]:
    parts = chunks(ids, jobs)
    paths = [f'{out}.{j}.json' for j in range(len(parts))]
    # Every track's fold, written out: run.mts takes id mod 5 by default, which is NaN for Raveform's keys (and then runs the shipped model).
    folds = f'{out}.folds.json'
    json.dump({k: (int(k) % 5 if k.isdigit() else 0) for k in ids}, open(folds, 'w'))
    parallel([[TSX, 'run.mts', levels, p, '--only', ','.join(part), '--fold-models', models, '--folds', folds, '--no-grid']
              for part, p in zip(parts, paths)])
    os.remove(folds)
    runs = []
    for p in paths:
        runs += json.load(open(p))['runs']
        os.remove(p)
    json.dump({'runs': runs}, open(f'{out}.json', 'w'))
    return runs


def score(run: str, gt: str) -> dict:
    out = subprocess.run([sys.executable, 'score.py', run, gt], check=True, cwd=HERE, capture_output=True, text=True).stdout
    return json.loads(out.strip().splitlines()[-1])


def summary(s: dict) -> dict:
    return {k: s[k] for k in ('mean_F1', 'drop_F1', 'drop_P', 'drop_R', 'build_F1', 'break_F1', 'anticipation', 'false_resets_per_song')}


def main() -> None:
    data, work = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    jobs = int(sys.argv[sys.argv.index('--jobs') + 1]) if '--jobs' in sys.argv else 4
    hidden = '--hidden' in sys.argv
    split = json.load(open(SPLIT))
    os.makedirs(work, exist_ok=True)
    ssme_gt = json.load(open(os.path.join(data, 'ssme', 'gt.json')))
    tune_gt = os.path.join(work, 'gt-tune.json')
    json.dump({k: ssme_gt[k] for k in split['ssme_tune']}, open(tune_gt, 'w'))

    feats = features(data, work, split['ssme_tune'], jobs)
    model = os.path.join(work, 'model')
    shutil.rmtree(model, ignore_errors=True)
    os.makedirs(model)
    sh([sys.executable, 'train.py', ','.join(os.path.join(feats, c) for c in CONDITIONS), tune_gt, model,
        '--no-grid', '--n-folds', '4', '--export-folds', '--export', os.path.join(model, 'full.json')])
    # run.mts loads fold0 to fold4; the tune tracks only ever use 0 to 3.
    shutil.copy(os.path.join(model, 'fold3.json'), os.path.join(model, 'fold4.json'))
    full = os.path.join(work, 'full')
    shutil.rmtree(full, ignore_errors=True)
    os.makedirs(full)
    for f in range(5):
        shutil.copy(os.path.join(model, 'full.json'), os.path.join(full, f'fold{f}.json'))

    result: dict = {}
    if hidden:
        for cond in SCORED:
            run_tracker(os.path.join(data, 'ssme', 'levels', cond), split['ssme_hidden'], full, os.path.join(work, f'hidden-{cond}'), jobs)
            result[f'hidden_ssme_{cond}'] = summary(score(os.path.join(work, f'hidden-{cond}.json'), os.path.join(data, 'ssme', 'gt.json')))
        run_tracker(os.path.join(data, 'rave', 'levels'), split['rave_hidden'], full, os.path.join(work, 'hidden-rave'), jobs)
        result['hidden_rave'] = summary(score(os.path.join(work, 'hidden-rave.json'), os.path.join(data, 'rave', 'gt.json')))
        result['hidden_ssme'] = sum(result[f'hidden_ssme_{c}']['mean_F1'] for c in SCORED) / len(SCORED)
    else:
        for cond in SCORED:
            run_tracker(os.path.join(data, 'ssme', 'levels', cond), split['ssme_tune'], model, os.path.join(work, f'tune-{cond}'), jobs)
            result[f'tune_{cond}'] = summary(score(os.path.join(work, f'tune-{cond}.json'), tune_gt))
        result['metric'] = sum(result[f'tune_{c}']['mean_F1'] for c in SCORED) / len(SCORED)
        run_tracker(os.path.join(data, 'rave', 'levels'), split['rave_check'], full, os.path.join(work, 'check'), jobs)
        result['check_rave'] = summary(score(os.path.join(work, 'check.json'), os.path.join(data, 'rave', 'gt.json')))
        result['check'] = result['check_rave']['mean_F1']
    print(json.dumps(result))


if __name__ == '__main__':
    main()

"""Fetches Raveform's audio from YouTube on your own machine and keeps only what training needs: the five onset-band levels at 60 fps.

Raveform (Kim et al., TISMIR 2026, labels CC BY 4.0) has 1,423 expert-labelled EDM tracks; its audio is only on YouTube, which refuses
downloads from cloud machines. Run this where YouTube works for you. No audio is kept: each track is decoded, turned into band levels by
levels.py (the same Web Audio filters the app uses) and deleted.

    pip install "yt-dlp[default]" numpy scipy        # and ffmpeg, and node or deno (yt-dlp uses it for YouTube's player script)
    curl -L -o raveform.zip https://huggingface.co/datasets/taejunkim/raveform/resolve/main/raveform.zip
    unzip raveform.zip 'raveform/structures/*'
    python scripts/section-eval/raveform-fetch.py raveform/structures/segments.json raveform-levels [--jobs 3] [--limit 50]

Output: raveform-levels/<key>.f16 per track (raw float16, frames x 5, 60 fps; about 1.2 KB a second, about 350 MB for all of it) and
raveform-levels/fetched.json (what was fetched, what failed and why). It skips tracks already done, so it can be stopped and run again.
Then zip the folder and share it (Google Drive works), or connect the folder to the cloud session with Remote Control.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def fetch(track: dict, out: str) -> tuple[str, str | None]:
    key = track['key']
    target = os.path.join(out, f'{key}.f16')
    if os.path.exists(target):
        return key, None
    with tempfile.TemporaryDirectory() as tmp:
        audio = os.path.join(tmp, 'audio.%(ext)s')
        result = subprocess.run(['yt-dlp', '-q', '--no-warnings', '--no-playlist', '-f', 'bestaudio', '-o', audio,
                                 f"https://www.youtube.com/watch?v={track['id']}"], capture_output=True, text=True)
        files = [f for f in os.listdir(tmp)]
        if result.returncode != 0 or not files:
            return key, (result.stderr.strip().splitlines() or ['download failed'])[-1][:200]
        levels = os.path.join(tmp, 'levels.f32')
        result = subprocess.run([sys.executable, os.path.join(HERE, 'levels.py'), os.path.join(tmp, files[0]), levels], capture_output=True, text=True)
        if result.returncode != 0:
            return key, (result.stderr.strip().splitlines() or ['levels failed'])[-1][:200]
        np.fromfile(levels, dtype='<f4').astype('<f2').tofile(target + '.part')
        os.replace(target + '.part', target)
    return key, None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('segments')
    parser.add_argument('out')
    parser.add_argument('--jobs', type=int, default=3)
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    tracks = json.load(open(args.segments))
    if args.limit:
        tracks = tracks[: args.limit]
    log_path = os.path.join(args.out, 'fetched.json')
    log = json.load(open(log_path)) if os.path.exists(log_path) else {'ok': [], 'failed': {}}
    done = 0
    with ThreadPoolExecutor(args.jobs) as pool:
        for key, error in pool.map(lambda t: fetch(t, args.out), tracks):
            done += 1
            if error:
                log['failed'][key] = error
            else:
                log['failed'].pop(key, None)
                if key not in log['ok']:
                    log['ok'].append(key)
            print(f"{done}/{len(tracks)} {key} {'ok' if not error else 'FAILED: ' + error}", flush=True)
            if done % 20 == 0:
                json.dump(log, open(log_path, 'w'))
    json.dump(log, open(log_path, 'w'))
    print(f"{len(log['ok'])} tracks fetched, {len(log['failed'])} failed (see {log_path})")


if __name__ == '__main__':
    main()

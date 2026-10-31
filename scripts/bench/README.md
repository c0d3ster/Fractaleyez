# Beat / config-window benchmark

Measures frame pacing and main-thread cost of the visualizer in headed Chromium, with a synthetic drum loop fed in as a fake
microphone so the beat detector fires. Built to find stutter on beats, especially with the pop-out config window open (it shares
the main thread with the visualizer).

## Setup

```sh
pnpm client-dev                                   # app on :3001 (presets fall back to bundled ones, no API needed)
export BENCH_DIR=scripts/bench/out                # wavs, browser profiles, results (git-ignored)
export CHROME_PATH=/path/to/chrome                # any Chromium/Chrome executable
export PLAYWRIGHT_CORE=playwright-core            # module to require (optional if it is resolvable)
python scripts/bench/mkwav.py "$BENCH_DIR/drums.wav"
```

## Run

```sh
node scripts/bench/bench.js <label> [--popup] [--noshock] [--throttle=3] [--size=1700x1000] [--secs=20]
scripts/bench/rep.sh <prefix> <n> [bench args]     # n runs -> result-<prefix>-r<i>.json
node scripts/bench/agg.js <prefix> [<prefix> ...]  # table of averages across runs
```

`--popup` opens the config window (the case that matters). `--throttle=N` slows the CPU N times, which shows how a slower or busier
machine behaves. The columns that matter in `agg.js`: `nearBeat p95` against the overall `p95` (a beat hitch shows as near-beat frames
running slower), `near>9ms%` (frames that missed a vsync within 200 ms of a beat), and `busy ms/s` (main-thread time per second).

## Quality tiers

```sh
scripts/bench/rep.sh q-saver 3 --quality=saver
scripts/bench/rep.sh q-balanced 3 --quality=balanced
scripts/bench/rep.sh q-quality 3 --quality=quality
scripts/bench/rep.sh q-ultra 3 --quality=ultra
node scripts/bench/agg.js q-saver q-balanced q-quality q-ultra
```

`--quality=<auto|saver|balanced|quality|ultra>` picks the tier after load (the app's default is `auto`). Each tier should cost less
than the one above it: compare `busy ms/s` and, on Windows, the GPU ms per frame from `gpusumm.js`. A Saver run is frame-capped at
30fps: `fps` still counts display frames, so judge it on `drawnFps` (what the app drew), `busy ms/s` and GPU time. `--shot` saves `shot-<label>.png` four seconds into the measured
window, to compare how the tiers look. The `tier` column of `agg.js` is the tier the run ended on, and the result JSON's `tiers`
lists every change with its time in seconds (negative is before the measured window started).

To test Auto, start on `--quality=auto` with a heavy scene under `--throttle=4`: it should step down within about 3 to 8 seconds
and then stay put. On a healthy run it should not move at all.

## GPU runs (Windows)

```sh
node scripts/bench/bench.js <label> --gpu=nvidia --size=2560x1440 --pos=2560,59 --secs=15
node scripts/bench/gpusumm.js <prefix>     # GPU 3D% per adapter and GPU ms per frame
```

`--gpu=nvidia` launches with `--force_high_performance_gpu`, which puts Chrome on the dedicated GPU; without it Chrome uses the
integrated one on a hybrid laptop. `--pos` and `--size` place the window on a particular monitor. `--off=fractal,logo,glow,...`
switches layers (`video`, `fractal`, `orbit`, `logo`) and effects (`kaleidoscope`, `shockwave`, `glow`) off, to see what each
costs. GPU utilization comes from Windows GPU engine counters for the benchmark browser's processes (`gpu-util.ps1`), so close
any other copy of the app first or it will share the GPU and skew the numbers.

Runs vary by about ±100 ms/s between browser launches, so compare averages of several runs, not single ones.

## Digging into a result

```sh
node scripts/bench/trace.js <label> [--popup] [--secs=10]   # Chrome timeline + V8 CPU profile -> trace-<label>.json
node scripts/bench/analyze.js <label> 10                    # renderer main-thread events, JS entry points, GC
node scripts/bench/prof.js <label> 10 30                    # self time by function from the CPU profile
```

Add `--early` to `trace.js` to start tracing before the popup opens (catches animation composite failures).

# Beat / config-window benchmark

Measures frame pacing and main-thread cost of the visualizer in headed Chromium, with a synthetic drum loop fed in as a fake
microphone so the beat detector fires. Built to find stutter on beats, especially with the pop-out config window open (it shares
the main thread with the visualizer).

## Setup

```sh
pnpm client-dev                                   # app on :3000 (presets fall back to bundled ones, no API needed)
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

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

## Event hitches, GPU time per pass, and the config window

`bench.js` measures steady state. A hitch is one bad frame when something happens, which an average hides, so `hitch.js` measures those.
Both rely on the page's perf probe (`src/visualization/perf`): off unless the address has `?perf=1` (or `localStorage.perfProbe = '1'`), and
then `window.perfProbe.summary()` returns, per section (`audio`, `layers.plan`, `layer.<key>`, `post.composite`, `post.effects`, `camera`), the
CPU time to submit the work and the GPU time it took (`EXT_disjoint_timer_query_webgl2`), the whole frame on each, frame gaps over 25 and 50 ms,
the long animation frames of the page and of the pop-out window, and counters. If the browser hides the timer extension the summary says
`gpuTimer: 'unavailable'` and the GPU columns stay empty; readings that are impossible (software GL returns garbage) are dropped and counted in `gpuFaults`.

```sh
node scripts/bench/hitch.js <label> [--scenarios=idle,glow-first,orbit-drag|all] [--popup] [--quality=quality] [--headless]
node scripts/bench/hitch.js <label> --attribution          # popup idle and slider drags, once per widget hidden
node scripts/bench/hitch.js <label> --popup --hide=".perf-hud-wrapper"
```

Each scenario runs on a fresh page load, because first-use costs (a shader compile on the first Glow toggle, the first layer drawn) only
happen once per load. Read `gapMax`, `gapP99`, `>25` and `>50` (display frame gaps), `cpuP95/cpuMax` (drawn frames, submit only) and `gpuP95`.

**Measure with the expanded config window open.** The pop-out is not a separate app: its React root is created from the page's script, so every
config change re-renders the page's tree and the pop-out's tree on the thread that draws the visualizer, and the pop-out then needs frames of its
own. The page's long animation frames (`loaf.page`) show the React work; the pop-out's (`loaf.popup`) show its style, layout and paint. The
`popup-drag-*` scenarios use a real pointer drag on a slider, which sets the value from the console would skip. `popupCommits` and
`changeToPopupMs` say how many commits a drag caused and how long the pop-out took to show a change. Run `--attribution` to see which widget
costs what; the earlier perf work (#181, #224, #236) found the answer was one animating widget at a time, not the sliders.

Software GL (`BENCH_CHROME_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader"`) only proves the scripts run: its frames take hundreds of
milliseconds and say nothing about a real GPU. Use a headed browser on the target hardware (an integrated GPU is where the video and pop-out problems showed).

## How much does supersampling buy?

```sh
node scripts/bench/scale-probe.js [1,1.25,1.5,1.75,2] [4] [outdir]
```

Renders one Ultra-tier fractal frame at each scale and measures the error against a true reference (the page drawn `4x` larger without supersampling and averaged in 4x4
blocks). On the one frame tried: 1.25 closes about two thirds of the gap between 1x and 2x, 1.5 only a little more for 44% more pixels, 1.75 is no better than 1.5, and 2 is clearly best
because a whole-number scale gives the GPU's bilinear lookup an even 2x2 average. That is why Ultra is 1.25. One frame and one view of the fractal, so try your own presets.

## Proving a rendering change leaves the picture alone

```sh
node scripts/bench/parity.js capture <dir>          # on the code before the change
node scripts/bench/parity.js capture <dir2>         # again after it
node scripts/bench/parity.js compare <dir> <dir2> [--tolerance=2]
```

`capture` loads the app on a virtual clock (`performance.now`, `Date` and `requestAnimationFrame` replaced, `Math.random` seeded with a separate stream for
three.js's UUIDs, no microphone), draws an exact number of frames per scenario and saves the canvas pixels. `compare` prints how many pixels differ and by how much.
Software GL is fine, since only the pixels matter. On one machine and browser, `fractal-only`, `orbit-only`, `orbit-levels` and `fractal-orbit` are bit-identical run to run;
scenes that also have the logo or video layers drift by a few hundred pixels of at most 2 levels. Capture the unchanged code twice to see that floor, and treat anything inside it as no change.
It cannot see anything that needs a beat (Switcheroo, shockwave): `hopalong-visualizer.test.ts` covers Switcheroo directly.

## Digging into a result

```sh
node scripts/bench/trace.js <label> [--popup] [--secs=10]   # Chrome timeline + V8 CPU profile -> trace-<label>.json
node scripts/bench/analyze.js <label> 10                    # renderer main-thread events, JS entry points, GC
node scripts/bench/prof.js <label> 10 30                    # self time by function from the CPU profile
```

Add `--early` to `trace.js` to start tracing before the popup opens (catches animation composite failures).

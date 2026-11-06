# Section evaluation tools

Offline tools for checking `SectionTracker` (`src/audioanalysis/sections.ts`) against real songs, instead of synthetic curves.

## Pipeline

1. `frames.mts <song.mp3> <out.frames.json>`: decodes the song, runs the same band filters (two cascaded 2nd-order Butterworth stages per edge, like `AudioStream`) and the real `OnsetDetector` at 60 fps, and saves the per-frame band levels and beats. Slow (about 10 s a song), so it is run once per song.
2. `replay.mts <in.frames.json> <out.json>`: replays the saved frames through the current `SectionTracker` and writes one record per 250 ms (band levels, beats, section, song index, clock). Fast, so it is the loop to iterate on.
3. `render.py <in.json> <out.png>`: draws a chart like the ones streaming apps show. Top: smoothed low (red), high (blue) and overall (white) level lines with 30 s time labels. Middle: the five bands as a heatmap (air on top, bass at the bottom). Below: beat density, then the tracker's section as a colored strip (cyan intro, grey quiet, green groove, yellow buildup, blue break, red drop, purple outro). Red ticks on the lowest strip are song changes. Needs numpy only.

## Setup

```sh
cd scripts/section-eval
npm i --no-save mpg123-decoder   # MP3 decoder (WASM), not a project dependency
../../node_modules/.bin/tsx frames.mts song.mp3 song.frames.json
../../node_modules/.bin/tsx replay.mts song.frames.json song.json
python render.py song.json song.png
```

## Test songs

Audio is not committed. The set used so far is 11 tracks from *Most Wanted* by Starfrosch (CC BY-NC-ND 3.0, on archive.org as `starfrosch-mostwanted`): trap, dubstep, house and EDM with real builds and drops. They are only decoded and analyzed locally. ccMixter would also be a fit but blocks non-browser downloads (403), so archive.org was used.

## Other tools

- `summarize.py <dir>`: one line per song listing every section run of 1.5 s or more (except groove), the number of songs detected, and the total seconds per label. Quick way to scan many songs after a change. Each file in the test set is one song, so `songs=` should always be 1.
- `probe.mts <frames.json> <from s> <to s> <step s>`: prints the tracker's internals (relative levels and the climb/fall fits) while replaying, to see why a label fired. It reaches into private members, so it is a debugging aid only.
- `tempoprobe.mts <frames.json> <from s> <to s>`: prints the tempo estimate every 4 s, which is how the tempo estimator's wobble on real music was found.

## Status

See `docs/implementation-plans/song-sections.md`. In short: after a rebuild guided by these charts, breaks and the drops that end them are found on most test songs and each song reads as one song, but there is no ground-truth annotation yet (the charts are read by eye), buildup recall on real songs is unproven (the test set has few classic riser builds), and outro and intro are the weakest labels. Marking true sections per song and scoring the tracker against them is the next step.

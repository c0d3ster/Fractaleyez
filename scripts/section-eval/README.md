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

## Status (when this was written)

The tracker was tuned on two short synthetic-ish tracks and then checked on real songs for the first time. It does badly:

- It labels long steady, loud stretches as **buildup** for up to 40 s (the "holding" rule is trivially true in a loud song, and the "rising" test fires on sidechain pumping and beat-count noise).
- A real buildup into a drop is often missed, and the drop is not marked.
- Bridges read as outro and the start of a build reads as intro.
- Keyboard noise with no music reads as groove (the default label is groove, with no "no song" state).

Next steps that were planned: mark the true sections on each chart, score the tracker against them (drop within a few seconds, overlap for buildup, break, intro and outro, and false positives in steady stretches), and redesign the rising/buildup detection around sustained trends (slope of the high band, low-end removal) rather than a recent-vs-prior comparison.

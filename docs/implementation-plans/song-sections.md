# Song Sections

## Context

The Beat HUD names the rhythm pattern (four on the floor, half time, and so on) from the last 12 seconds of beats. That window is far too short to say anything about song structure. A buildup lasts 8 to 32 bars (roughly 15 to 60 seconds), and a drop only means something relative to what came before it.

This plan adds a long-memory layer that labels the current part of a song (intro, groove, buildup, break, drop, outro, quiet) and notices when one song ends and the next begins. It is a separate effort from Auto mode and a prerequisite for it: see `auto-mode.md`, which consumes the signal this plan produces. Nothing in this plan changes how the visuals look.

Code: `src/audioanalysis/sections.ts` (`SectionTracker`, pure, clock injected), fed by `AudioFeed` every frame, exposed as `window.getSongSection` / `getSectionHistory`, drawn by `SectionHud` under the Beat HUD. Evaluation tools: `scripts/section-eval/`.

## Status

The first version was tuned on synthetic curves and two short tracks and was **bad on real songs** (long false buildups on steady loud stretches, drops missed, bridges read as outro, typing on a keyboard read as groove). The detection was rebuilt around what a section looks like in the band levels, and checked against 11 real Creative Commons tracks with a chart renderer. Current state:

- Real breaks and the drops that end them are found on most of the tracks that have them. Each of the 11 tracks (single songs) reads as exactly one song.
- False buildups from steady loud stretches are mostly gone; real, classic riser buildups are rare in the test set, so **buildup recall on real songs is not yet validated** (only on synthetic builds).
- Outro is conservative: only a deep, long fade late in a song. Late breaks and outros look alike while they happen.
- There is no ground-truth annotation yet. Quality so far was judged by reading the charts, which is subjective. Marking true sections on each chart and scoring the tracker against them is the obvious next step.

## What a section looks like

Modern tracks are nearly flat in overall loudness, so structure shows up as **changes in band balance and sustained trends**, not as loudness swings. The tracker works on 250 ms slots (total, low = bass+lo, mid, high = hi+air, and the beat count), keeps 2 minutes, and judges everything against the song's own levels, never absolute ones.

Building blocks:

- **Climb or fall**: a line fitted to one-second means of a group's level in dB (6 s for most things, 9 s for buildups). It has to be steep enough (0.45 dB/s), straight enough (fit R squared 0.6 or more) and big enough (3 dB, 6 dB for buildups and 6 dB for an intro).
- **Relative level**: where a group is now (last 2 s) against the 90th percentile of that group's 2 s means over the song's last 90 s. 0 dB is "full", negative is under it. Using 2 s means (not raw slots) matters: the pumping of a sidechained kick otherwise lifts the top and makes every groove look low.

| Section | Signature |
| --- | --- |
| quiet | Shown whenever no song is confirmed (no regular beat: silence, a fan, typing). Also the whole level about 14 dB under the song's slow loudness memory, for a second |
| intro | A big climb (6 dB or more over 6 s, in the whole level) in the first 45 s of a song, and the stretch after a song change; ends 2 s after the climb stops |
| groove | The default once a song is confirmed |
| buildup | A sustained 9 s climb of at least 6 dB in the mids, highs or the whole, held for about a second. Ends when no climb has been seen for 2.5 s, or after 30 s. Not within 8 s after a drop |
| break | The low end 4 dB or more under its own peak, or the whole 3.5 dB under, for about 4 s (a leaky counter, so kick pumping does not reset it). Ends after 2 s back near the peak |
| drop | The low end (+6 dB), the whole (+4 dB) or the highs (+8 dB) step up over the previous 1.5 to 5 s, to within 3.5 dB of the peak, right after a buildup of 2.5 s or more, a break of 3 s or more, a quiet stretch of 2 s or more, or a fade. Held for 4 s |
| outro | A fall (6 s fit) late in a song (150 s or more) to 12 dB or more under the peak. Shallower falls stay breaks. If the level comes back within 8 s it was a pause and a drop can fire straight out of it |

**A song is playing** once a regular beat has been going: at least 8 beats in 8 s with tempo consistency 0.5 or more, after 10 s. Until then everything shows as quiet. This is also what gates the song clock. It is lost after 25 s with almost no beats.

**Song change** starts a new song (intro, reset loudness memory, clock restarts, `songIndex` goes up). It happens when:

- **silence** (more than 24 dB under the song's loudness, or digitally silent, so a mic noise floor of a few percent of the music counts) lasts about 5 s or more and sound returns for half a second. It is timed from when the sound actually stopped and works from the first seconds of a song. A song needs at least 6 beats to count, so the app opening on silence then music is the first song,
- the level comes back after an outro lasting 8 s or more, or climbs well over an outro's quietest point,
- the level comes back after a quiet stretch of 10 s or more, or any quiet stretch that followed an outro,
- the tempo, read cleanly (consistency 0.75 or more), stays different from the one the song held for three checks in a row. This is weak: the tempo estimator wobbles on real music (a steady 128 BPM track reads 96, 127, 160 and 176 along the way), so this rule is deliberately hard to trigger.

The Section strip shows the section name below the graph, the intensity at the top right and a song clock at the top left (shown once a song is confirmed, hidden in silence and on stray noise).

## Steps

1. **Recorder and debug strip** (done).
2. **Tune on real songs** (in progress): the rebuild above. Next: mark the true sections on each chart, score against them, and add more tracks with classic riser builds.
3. **Intro, outro and song change** (done in a first form, see above). Intro and outro are still the weakest.
4. Auto mode starts only after the labels can be trusted. See `auto-mode.md`.

## Offline evaluation on real songs

`scripts/section-eval/` decodes a song, runs the real band filters and `OnsetDetector` once, saves the per-frame levels and beats, and replays them through the current tracker in seconds. A chart renderer draws level lines (low red, high blue, overall white), the five bands as a heatmap, beat density and the tracker's sections as a colored strip, so the labels can be compared with the song the way a streaming app's chart is.

Things learned from it:

- A recent-versus-earlier comparison (the first buildup rule) fires on kick pumping and beat-count noise in loud, flat masters, and a "holding" rule then keeps it on for the maximum time. A regression slope with a fit check over 6 to 9 s does not.
- Dips recover quickly; real buildups last bars. A 9 s window with a 6 dB minimum rise tells them apart.
- A late break and an outro are not separable by shape alone while they happen. Only a deep fade is called an outro.
- The tempo estimator is not reliable enough to call song changes on its own.

## Limits

- Works best on electronic music with clear structure. Weaker on rock, jazz and live music.
- A drop is detected by reacting to it, so it lands a beat or two late unless the buildup was seen first.
- Mic capture of a room is noisier than a clean feed, which is why every threshold is relative to the song's own levels.
- The song clock counts from when the tracker thinks the song began, so it is an estimate.
- Not tuned on live mic audio yet.

## Verification

- Unit tests (`sections.test.ts`, `sections.stress.test.ts`) with synthetic curves: noise, a quiet mic, builds and drops, breaks with kick pumping, quick dips, fades and the next song, silences of 20 s (digital and with a mic noise floor), tempo changes, the song clock, and typing on a keyboard.
- The 11-track real-song check above (each reads as one song; breaks, drops and outros listed in the section summaries).

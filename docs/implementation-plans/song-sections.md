# Song Sections

## Context

The Beat HUD names the rhythm pattern (four on the floor, half time, and so on) from the last 12 seconds of beats. That window is far too short to say anything about song structure. A buildup lasts 8 to 32 bars (roughly 15 to 60 seconds), and a drop only means something relative to what came before it.

This plan adds a long-memory layer that labels the current part of the song (quiet, groove, buildup, break, drop, later intro, outro and song change). It is a separate effort from Auto mode and a prerequisite for it: see `auto-mode.md`, which consumes the signal this plan produces. Nothing in this plan changes how the visuals look.

The first test case is the simplest one: a buildup (hits getting denser, commonly 1/4 to 1/8 to 1/16, then a turnaround) followed by a drop.

## What exists today

- `BeatMonitor` (`src/audioanalysis/beat.ts`) keeps about 5 s of per-band samples (`level`, `loudness`, `trigger`) and 12 s of beat times.
- `OnsetDetector` produces per-band levels (% of full scale, 20 ms smoothed) and the one shared definition of a beat.
- `estimateTempo` (`tempo.ts`) reads BPM and a pattern name from beat times.
- `AudioFeed.tick` is the single producer that records each frame into the beat monitor.

## Locked decisions

1. **Rule-based, no ML.** A small state machine over slow features. Thresholds are relative to the song's own recent levels, never absolute, so a quiet mic and a loud feed behave the same.
2. **Slow features, long memory.** Every 250 ms slot stores total, low (bass and lo), and high (hi and air) level plus the number of beats in the slot. About 2 minutes are kept (480 slots). Cheap enough to run every frame.
3. **Pure tracker, injected clock.** `SectionTracker` takes timestamps in its input, has no DOM or audio dependencies, and is unit tested with synthetic level curves.
4. **Debug strip before anything moves.** A strip under the Beat HUD shows the current section, intensity and the last 2 minutes as colored segments over an energy trace. Thresholds get tuned on real songs by eye before Auto mode is wired to anything.
5. **Output is a small signal**: `{ section, intensity (0..1), buildupProgress (0..1), sinceMs }`. Visuals read it the way they read `beat`.

## Section signatures

| Section | Signature |
| --- | --- |
| intro | A song that opened from near silence and is still climbing, or the stretch right after a song change. Ends when the level stops climbing and is close to its peak, or after 30 s |
| quiet | Total level far below the song's recent loudness (about -14 dB) for a second, with hysteresis on the way out |
| groove | Steady level and beat, the default state |
| buildup | Beat density rising, or high band energy rising by a few dB, while the total level holds. Needs to persist about 1.5 s to enter |
| break | Low end drops well below the loudness memory while the total falls, but the highs stay. Needs about a second to enter, 2 s minimum |
| drop | Low band jumps back (about +6 dB over the previous few seconds, measured over 1 s) right after a buildup, break, quiet stretch or short outro that lasted long enough. Held for 4 s |
| outro | Everything fades together: total about -5 dB and the highs about -6 dB under the song's loudness, for about 5 s. Unlike a break, the highs go too |

**Song change** starts a new song, which opens with an intro and resets the loudness memory. It happens when:

- the level comes back after an outro lasting 8 s or more (a fade that comes back sooner was a pause, and the song goes on),
- the level climbs well over an outro's quietest point, even if the next song opens quietly,
- **silence of about 5 s or more** ends and sound returns (see below),
- the level comes back after a quiet stretch of 10 s or more, or any quiet stretch that followed an outro, or
- the tempo stays different from the one the song held (not counting half time, double time or triplet feel) for two readings in a row.

**Silence** is separate from quiet. Quiet is a soft bridge, about -14 dB under the song's loudness. Silence is a paused player or the gap between songs: more than 24 dB under it (or digitally silent), which also covers a mic noise floor of a few percent of the music's level. It is timed from when the sound actually stopped, it works from the first seconds of a song (the 20 s warm-up does not apply to it), and when sound has been back for half a second the next song begins. A pause of a few seconds before a drop is not long enough to count. A feed that opens on silence and then music is the first song, not the second (a song needs at least 6 beats to count).

The Section strip shows a clock in its top left: about how long the current song has been going. It appears once a beat has been going for 10 s, and goes away in quiet, so silence and stray noise do not get one.

`buildupProgress` is time based for now (elapsed over a typical 12 s ramp, clamped). It can be sharpened later once real tracks show how long builds run.

## Steps

1. **Recorder and debug strip** (this PR). `SectionTracker` with slot recording and the state machine, `window.getSongSection` / `getSectionHistory`, a `SectionHud` strip under the Beat HUD, unit tests with synthetic buildup, drop, break and quiet curves.
2. **Tune buildup and drop** on a handful of real tracks the user picks. Adjust constants, add a test per failure found.
3. **Intro, outro and song change** (done in this pass, see below). Still to tune on live audio.

Auto mode work starts after step 2 at the earliest, since it needs labels that can be trusted.

## First offline check on real audio

Before any listening session, two of the user's own 2-minute tracks were run through the real onset detector and the tracker offline (a band-pass filter bank matching the app's, 60 fps frames). The first pass flickered between break and groove, called the intro ramp a buildup, and fired drops off single kicks. What changed as a result:

- **A slow loudness memory** (jumps up at once, forgets over about 45 s) replaces a 30 s rolling baseline for break, quiet and drop. A long break stays a break instead of becoming the new normal.
- **No labels for the first 20 s** of a song, since that stretch is an intro ramping up from silence.
- **Minimum durations and entry counts**: a break needs about a second to start and 2 s to end, quiet needs a second to start and 3 s to end, and a drop only counts after a buildup of 2.5 s, a break of 3 s or a quiet stretch of 2 s.
- **A 1 s window for the low end coming back**, so one kick against a quiet average is not a drop.
- **Coming back up from silence is not a buildup**, and a rise cannot start within 9 s of a quiet stretch.
- A gap of more than 2 minutes between samples (a background tab) restarts the tracker.

Result on both tracks: one long break from about 0:47, a short quiet bridge, one drop where the low end returns around 1:14, and a second break at the end. Left to tune: a short break in the intro near 0:21.

The tracker costs about 1.3 microseconds per frame, so performance is not a concern.

## Intros, outros and song changes

A listening session turned up the gap: an outro that fell to about 40% loudness was labeled a break, and the next song starting was never noticed. Added in response:

- **Outro vs break**: a break cuts the low end and leaves the highs; an outro takes everything down together, for several seconds. Real outros are long and a pause before a drop is a few seconds, so an outro needs about 5 s of fade, and a fade that comes back within 8 s of starting counts as a pause (and can set up a drop).
- **Intro vs drop**: a drop is the low end returning inside the same song after a setup. A return after an outro, a long quiet stretch or a tempo change is a new song, so it opens with an intro and the loudness memory restarts.
- **Tempo change**: one tempo estimate every 4 s is compared with the tempo the song has held. Readings from a window that mixes two songs read as an unsteady beat and are ignored, so only clean readings count.
- Checked by playing the two real tracks back to back offline: each opens with an intro and ends in an outro, the first track's outro leads into the second track's start as song 2, and the pause before the drop stays in the song.

### Silence fix

A listening session with 20 s of silence at 10 s and again at 40 s did not reset the song clock. The first silence fell inside the 20 s warm-up where nothing was judged, and a quiet stretch was timed from when it was noticed, not from when the sound stopped, so 20 s of silence measured as 9.8 s and stayed in the same song. Fixed with the silence rule above. Checked with synthetic silences (digital zero, and mic noise floors of 1% and 3%) and with 20 s of silence cut into a real track at 10 s and 40 s: three songs, with the clock restarting each time.

## Limits

- Works well on electronic music with clear structure. Weaker on rock, jazz and live music.
- A drop is detected by reacting to it, so it lands a beat or two late unless the buildup was seen first. The buildup is the useful early signal, and drop timing can later be predicted from the bar grid once a buildup is confirmed.
- Mic capture of a room is noisier than a clean feed, which is why every threshold is relative to the song's own baseline.
- Song change detection is the weakest part and is deliberately last.

## Verification

- Unit tests for `SectionTracker` with synthetic curves (steady groove, rising hats into a bass return, low-end cut, fade to silence).
- Watch the debug strip on a few real tracks and compare labels with what is heard before Auto mode is wired to anything.

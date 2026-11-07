# Tempo

## Context

The Beat HUD's BPM was read afresh twice a second from the last 12 s of detected beats (`estimateTempo` in `tempo.ts`). It jumped about 10 times a minute and was within 4% of the right tempo 59% of the time on clean audio. Three causes: the beats it reads are sparse (at most one per 250 ms, from the bass and hi bands only), nothing carries over from one reading to the next, and nothing prefers the tempos music is usually counted at, so a 128 BPM track could read 96 or 176.

`TempoTracker` (`src/audioanalysis/tempo-tracker.ts`) replaces it for the BPM shown. `estimateTempo` still names the rhythm pattern and gives the consistency figure, and the section tracker still uses it to confirm a song is playing.

## How it works

1. Every frame, how much each onset band rose in dB over its own level of the last 20 ms (a follower), times the frame's length, each band scaled by its own running average (so a band that is empty on this input, like the bass on laptop speakers, neither dominates nor vanishes) and weighted toward the kick (bass 3, lo 1, mid 0.5, hi 0.5, air 0.25).
2. Every 500 ms, that onset strength over the last 12 s on a 10 ms grid (each frame's share spread over the time it covers), and its autocorrelation. A beat period scores its correlation plus half of its correlation at two and four periods (bars), plus 1.5 times its correlation at half a period (subdivision), times a log-normal prior around 145 BPM half an octave wide. Not three periods: that made dotted patterns win.
3. The scores are blended into a running score (8 s memory). The shown tempo follows small drifts of the same peak smoothly, and moves to a different peak only when it scores 15% higher for four readings in a row (2 s). With no onsets (a breakdown) it holds the last tempo for 30 s, then shows none.

About a millisecond of work every 500 ms.

## Measured

The GiantSteps tempo set (Knees et al. 2015, corrected tempos from Schreiber and Müller 2018): 664 two-minute EDM excerpts with labelled tempo and genre. The options were tuned on 116 of them; the numbers are on the other 546. "Laptop" is laptop speakers into the laptop mic (`levels.py --mic laptop`). A reading is right within 4% (the usual tolerance); "octave" also accepts half, double, a third or three times.

| | Old, clean | New, clean | Old, laptop | New, laptop |
| --- | --- | --- | --- | --- |
| Readings within 4% | 59% | 80% | 66% | 83% |
| Within 4% up to octave | 66% | 87% | 73% | 90% |
| Tracks whose usual reading is right | 76% | 84% | 82% | 85% |
| Visible jumps (over 4%) per minute | 10.8 | 0.6 | 9.5 | 0.4 |

At 60 fps. The app runs from 30 fps (Saver) to 144 and more, and the result holds across that: readings within 4% are 79% at 30 fps and 80% at 144 (the old estimator: 55% and 60%).

By genre (new, clean, readings within 4%): psy-trance 99%, breaks 97%, deep house 93%, techno 91%, trance 91%, tech-house 89%, electro-house 81%, dubstep 78%, house 78%, drum and bass 72%, electronica 71%, glitch-hop 62%, chill-out 62%. Drum and bass was the weak spot before the subdivision term (its two-step kick spaces kicks a beat and a half apart, read as 116 for 174); that term was added after seeing those errors on the test excerpts, but its weight was tuned on the 116 only.

Two bugs the frame-rate check caught, both now fixed and covered by the 30, 60 and 144 fps test: sampling one frame per 10 ms bin dropped a third of the frames at 144 fps (35% right there), and rises from one frame to the next counted every jitter as an onset, more of them the faster the frames.

## Next

- Beat phase: where the beats fall, not only how far apart. That and a downbeat give the bar and phrase grid the section tracker can use (see `song-sections.md`).
- Tempo through a real mic session, and on non-EDM music (untested).

## Verification

- `tempo-tracker.test.ts`: the right tempo at 30, 60 and 144 fps, dotted hats not taken for the beat, steady on a steady track, one clean switch on a real tempo change, held through a breakdown, nothing in silence, the same at a tenth of the level.
- `scripts/section-eval/bpm-eval.mts` and `bpm-score.py` against the GiantSteps labels.

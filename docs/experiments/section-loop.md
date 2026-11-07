# Section model loop (stage 6)

Automated improvement loop on the song section model and its decoder, stage 6 of `docs/overnight/pipeline.md`.

- Data: SSME's 339 labelled tracks (levels from `levels.py`: clean, `--mic room --seed id%100000`, `--mic laptop --seed id%100000+1`)
  and Raveform's 1,370 tracks (clean band levels, its sections mapped by `raveform-sections.py`).
- Split (`section-loop-split.json`): hidden first, SSME tracks with id mod 5 == 4 (62) and Raveform folds 6 and 7 (343). Tune: the other
  277 SSME tracks, 4-fold cross-validation (fold = id mod 5). Check: Raveform folds 0 to 5 (1,027 tracks).
- Frozen evaluation: `scripts/section-eval/section-loop-eval.py`. Tune metric: out-of-fold mean F1 (drop, buildup, break, `score.py`) of
  the TypeScript tracker (`run.mts`, fold models from `train.py` on clean, room and laptop features), averaged over the clean and laptop
  feeds. Check: Raveform folds 0 to 5 scored by a model trained on all tune tracks (SSME alone), mean F1. The tracker runs without the beat
  grid, as the app does today.
- Keep a change only if the tune metric rises by at least 0.003 and the check does not fall below the current kept code's.
- Edit surface: `section-features.ts`, `train.py` settings, the decoder (`sections.ts`, mirrored in `decode.py`). Training is seeded
  (`random_state=0`), the mic simulation by track id, so the evaluation is deterministic.
- Note: the check set is labelled in Raveform's convention (a breakdown for most of the rise, a drop at every return to full energy, see
  `song-sections.md`), so it guards against a change that only fits SSME's tracks, not a target.

Run 1 was voided at iteration 2: the check ran the shipped model on Raveform's tracks instead of the loop's (run.mts picks a fold model by
id mod 5, NaN for Raveform's keys), so it only saw decoder changes. Fixed in the evaluation (it writes every track's fold), then the start
code and iteration 1 were scored again. Run 1's numbers for the record: start 0.4325 / check 0.2620, iteration 1 0.4385 / 0.2640, iteration 2
(drop label window -0.5 to 2.25 s) 0.4460 / 0.2640. The tune metric was unaffected by the bug.

Decoder and training ideas are screened first (`scripts/section-eval` run with the kept fold models, or a training into a scratch dir, tune
metric only); only those that screen well get a full evaluation, which is what the iterations below are. Screens are listed under the table.

| Iteration | Change | Tune metric | Check metric | Kept |
| --- | --- | --- | --- | --- |
| 0 | Start (feat/bar-grid at 432829d): clean 0.441 (drop 0.372, build 0.430, break 0.522), laptop 0.424 (drop 0.359, build 0.377, break 0.536) | 0.4325 | 0.2700 | start |
| 1 | Decoder: drop threshold 0.3 to 0.25, drop threshold while a buildup or break shows 0.5 to 0.6, buildup enter 0.3 to 0.25 | 0.4385 | 0.2770 | yes |
| 2 | Training: drop label window (-0.5, 1.25) to (-0.5, 2.25) s after the drop | 0.4460 | 0.2720 | no (check fell: Raveform drop precision 0.72 to 0.64) |

Screens (tune metric only, start of each against the kept code at the time):

- Decoder, from the start (0.4325): drop threshold 0.2 / 0.25 / 0.35: 0.4350 / 0.4350 / 0.4305; drop in context 0.4 / 0.6: 0.4330 / 0.4340;
  buildup enter 0.25 / 0.2 (and leave 0.15): 0.4350 / 0.4315; buildup leave 0.15: 0.4315; break enter 0.25: 0.4335; break leave 0.2:
  0.4330; smoothing 1 s: 0.4300; enter slots 3: 0.4295; drop 0.25 + buildup enter 0.25: 0.4365; plus drop in context 0.6: 0.4385 (iteration 1).
- Training, from iteration 1 (0.4385): drop window to 1.75 s: 0.4430; to 2.25 s: 0.4460; (0, 1.75): 0.4455; (0, 2.25): 0.4395; stage 2 with
  200 trees at learning rate 0.05: 0.4345.

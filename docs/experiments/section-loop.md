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

| Iteration | Change | Tune metric | Check metric | Kept |
| --- | --- | --- | --- | --- |

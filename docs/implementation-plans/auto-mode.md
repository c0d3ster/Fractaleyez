# Auto Mode

## Context

The visuals already respond to the music through the audio logic in the code (beats, band levels, the audio multipliers). Auto mode is a different thing: it is a way for the visualizer to keep working with nobody touching it, and it gives much more variance than audio reactivity alone. It follows the song's parts and energy to decide what to change at the scale of the whole look (which preset, which layers, which effects), the way a person running the visuals would. It is meant to become the default.

Auto does not replace or retune the audio reactivity. That keeps running underneath as it does today.

It depends on `song-sections.md`, which produces the signal it reads from `window.getSongSection`: `{ section, intensity, buildupProgress, sinceMs, dropCount, sinceDropMs, confidence, songIndex, songMs }`. A change in `dropCount` is the drop event (the one-shot moment), `section === 'drop'` is the full-energy stretch after it, and a change in `songIndex` is a new song. That analysis is a separate effort and a prerequisite, now measured against expert labels (see that plan for how often each label is right). Auto should lean on what is most reliable: the buildup before a drop (shown before about 80% of drops) and the drop section, and treat a single drop event as a cue that is right about 4 times in 10, so a missed or extra one should never look broken (prefer changes that also read well a few seconds late).

## Categories

Auto works on whole categories, never single controls, so only so much changes at once. The categories are:

- **Presets**: switching between presets.
- **Layers**: which layers are on (using the existing layer fade duration).
- **Effects**: which effects are active and how strong (kaleidoscope is the likely first one).
- **Global settings**: the user config section only. Audio is never automated: it is the input the whole system listens through, so Auto leaves it alone.

All of them can be automated at the same time. Auto is not limited to one category being on; the per-category states below only decide which ones the user has taken over.

## Model: a radio that stays on until you take over

Auto is a switch that is on by default. It stays on until the user does something manual.

### Phase 1 (MVP): all or nothing

One Auto switch covering the categories. For the MVP, build the section-to-target mapping for a small subset to prove the loop, then widen it:

- **Effects**: kaleidoscope segment count and rotation speed follow intensity, with a one-shot change on the drop.
- **Layers**: layers fade in and out with the section, for example fractal and video in on the drop, orbit alone in a quiet part.

Auto turns off when the user adjusts something in an automated category, or selects a preset, since a preset is a deliberate choice. A clear Auto control turns it back on. Auto only nudges targets and eases there over 1 to 2 seconds. It never overwrites the loaded preset's stored values, so turning Auto off returns to the preset.

### Phase 2: per-category control

Each category has its own automated or manual state, all automated by default. Adjusting something in one category frees only that category, and the others keep following the music. That gives variation while the user still holds control, without the noise of per-knob states. A category returns to Auto through a switch for that category, plus a global "all auto".

Open questions: how the category switches look in the sidebar and the popup, how a preset selection interacts with categories that are still automated, whether a manual category should still move relative to the music (as an offset), and where the user section gets its category switch.

## Targets

Each automated target gets a small descriptor (its category, what it controls, its range, and how each section maps to it), so adding one is one entry, in the same spirit as the layer descriptor registry in `visualizer-layers.md`.

## Steps

1. Wait for `song-sections.md` step 2 (buildup and drop tuned on real tracks).
2. Auto switch, section-to-target descriptors and easing, wired to a small subset (kaleidoscope under effects, layers).
3. Take-over rules: manual change or preset select turns Auto off.
4. Phase 2: per-category states.
5. Fill out the categories: the rest of effects, presets, then global settings (user).

# Auto Mode

## Context

The visuals already respond to the music through the audio logic in the code (beats, band levels, the audio multipliers). Auto mode is a different thing: it is a way for the visualizer to keep working with nobody touching it, and it gives much more variance than audio reactivity alone. It follows the song's parts and energy to decide what to change at the scale of the whole look (which preset, which layers, which effects), the way a person running the visuals would. It is meant to become the default.

Auto does not replace or retune the audio reactivity. That keeps running underneath as it does today.

It depends on `song-sections.md`, which produces the signal it reads from `window.getSongSection`: `{ section, intensity, buildupProgress, sinceMs, dropCount, sinceDropMs, confidence, songIndex, songMs }`. A change in `dropCount` is the drop event (the one-shot moment), `section === 'drop'` is the full-energy stretch after it, and a change in `songIndex` is a new song. That analysis is a separate effort and a prerequisite, now measured against expert labels (see that plan for how often each label is right). Auto should lean on what is most reliable: the buildup before a drop (shown before about 80% of drops) and the drop section, and treat a single drop event as a cue that is right about 4 times in 10, so a missed or extra one should never look broken (prefer changes that also read well a few seconds late).

## Status

Step 2 and 3 of the MVP are in, for one target: the **kaleidoscope** (effects category). Code: `src/automode/`.

- `AutoMode` (singleton `autoMode`) is on by default and holds nothing but the on/off switch. It never writes the config: `post-effects.ts` asks `autoMode.kaleidoscope(...)` each frame and, while Auto is on, draws that fold (on or off and the wedge count) instead of the stored kaleidoscope settings. Mode and source stay the user's. Turning Auto off puts the stored settings straight back.
- Mapping (`kaleidoscope-target.ts`): off in groove, break, intro, outro, quiet and before a song is playing; a buildup adds mirrors as `buildupProgress` climbs (2, 4, 6, 8); the turnaround holds 8; a drop lands on 16 and settles to 8 after 6 s.
- Built to survive wrong labels: a change has to be wanted for 1.2 s and the last one has to have shown for 2.5 s, so a flickering label never reaches the screen. A drop event skips the wait (late reads fine). A new song resets to off. The fold itself morphs over the user's crossfade time.
- Take-over: changing any `effects` item that starts with `kaleidoscope`, or choosing a preset (including Reset), turns Auto off. The Auto chip under the Section strip shows and flips the state. It is not persisted: a reload starts with Auto on.
- Ghosts: the config shows what Auto is doing without touching the stored values. `src/utils/ghostStore.ts` holds ghost values by `section.item` key (never saved, never in the config); `AutoMode` publishes `effects.kaleidoscope` (on or off) and `effects.kaleidoscopeCount` (only while the fold is on) each frame and clears them when it steps back. A control reads its own key with `useGhost`: the kaleidoscope chip goes faint green when Auto wants it on and the stored switch is off (dimmed when it is on and Auto wants it off), the dial shows a faded handle at Auto's count while the real handle stays on the stored count, and `ConfigSlider` / `ConfigCheckbox` take a `ghostKey` (`ConfigSectionItems` passes one for every row) so a future target only has to publish its key. The Julia visualizer uses the same store for the Tour slider: while Switcheroo has the shape hopped off the slider's spot, a faded thumb shows where it is headed.
- Not yet: rotation speed (the effect has none), layers, the per-category states of phase 2, a place for the switch outside the Section HUD, and any check on live music beyond the unit tests. Next target: layers fading with the section.

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

1. Wait for `song-sections.md` step 2 (buildup and drop tuned on real tracks). Done enough to start; labels are still imperfect, hence the smoothing above.
2. Auto switch, section-to-target descriptors and easing, wired to a small subset (kaleidoscope under effects done; layers next).
3. Take-over rules: manual change or preset select turns Auto off (done for the kaleidoscope).
4. Phase 2: per-category states.
5. Fill out the categories: the rest of effects, presets, then global settings (user).

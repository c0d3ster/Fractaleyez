# AI visuals: generated sprites, song match and lyric-reactive imagery

Research and plan only. Nothing here is built. Decisions marked **Decided** came from the owner; everything else is a proposal. Model names, speeds and prices are as of November 2026 and change monthly, so re-check them before building (see "Benchmark first").

## The three features

1. **Logo sprite generation.** The user types a prompt and gets a sprite, next to the existing upload. It is the foundation the other two build on.
2. **Song match.** Identify the playing song Shazam-style. That gives the tempo (a hint for beatsense), the timed lyrics, and time to generate high-quality images before each line is sung.
3. **Live lyric imagery.** For songs that can't be identified (unreleased tracks, edits, DJ mixes), roughly transcribe the vocals and generate fast images from the words, a few seconds behind the singer.

**Decided:** quality goes to the song-match path (images are generated ahead, so speed doesn't matter) and speed to the live path.

## Providers are options, not a commitment

**Decided:** the Vercel AI Gateway is one option, not the default. Keys on hand today are OpenAI and Anthropic. Other accounts get added only where they are the best choice.

| Need | With current keys | Other options |
|---|---|---|
| Quality image generation | OpenAI GPT Image 2 | AI Gateway (GPT Image, Imagen, FLUX.2 Pro, Recraft), Ideogram 4 |
| Fast image generation | none fast enough (see below) | fal or Replicate (Z-Image Turbo, FLUX 3 Klein), possibly the AI Gateway |
| Lyrics or words to an image idea | Anthropic (a small fast model, e.g. Claude Haiku) or OpenAI | AI Gateway |
| Streaming speech-to-text | OpenAI streaming transcription | Deepgram, AssemblyAI |
| Song identification | none | ACRCloud, AudD |
| Time-synced lyrics | none | Musixmatch (licensed) |

So the minimum new accounts are song identification and synced lyrics for song match, plus one fast-image host for the live path. Every provider sits behind a small server-side interface (`ImageGenerator`, `Transcriber`, `SongIdentifier`, `LyricsSource`), so swapping one is a config change, and keys stay on the server like the Stripe key.

## Image models

### Quality (song match, and the sprite generator's "high quality" option)

- **GPT Image 2** leads the Artificial Analysis quality leaderboard. Since August it can output a true transparent background (`background: "transparent"`, PNG or WebP, still a preview feature), which gives clean sprite edges with no background removal. Available with the current OpenAI key.
- **Ideogram 4** has a dedicated transparent-background endpoint and is the main alternative.
- Google's Imagen and Nano Banana models fill much of the top 15.

These take tens of seconds per image and cost more, which is fine when generating ahead.

### Speed (live lyric imagery, and a "quick" sprite option)

- **Z-Image Turbo** is the usual fastest: under a second on a hosted data-center GPU, about $0.01 an image.
- **FLUX 3 Klein** was the fastest of 20 hosted APIs in a November 2026 same-prompt test.

Both are distilled models (a handful of steps). Neither makes transparent backgrounds, so prompt for a plain black background and run the result through `sprite-strip`, as uploads already are.

### Sprite size is the biggest speed lever

Benchmarks measure 1024px images. A sprite needs 256 to 512px, which is a fraction of the work, so about a second per image is realistic on the fast models.

### Benchmark first

Before picking: the same 20 prompts at sprite size through 4 or 5 candidates (GPT Image 2, one Google model, Ideogram 4, Z-Image Turbo, FLUX 3 Klein), timing each end to end from this server and comparing the results side by side. About an afternoon, and it replaces trusting any leaderboard.

## Song match

### Identification

**On Pioneer gear, ask the decks first.** CDJs share the loaded track's title, artist, BPM, beat grid and (on CDJ-3000s) phrase analysis and exact playhead position over Pro DJ Link, the moment a track is loaded and before it plays (`docs/implementation-plans/pioneer-pro-dj-link.md`). That gives the identity and the offset with no lookup, works for edits and unreleased tracks, and gives a whole cue-up of lead time to prepare images and lyrics. Fingerprinting is the fallback for everything else.

Fingerprinting services (ACRCloud, AudD) take 5 to 10 seconds of audio and return the song and the **offset into it**. The offset is what lines lyrics and tempo up with what is playing. Check once per song, not continuously: a lookup takes a few seconds and costs a little.

Where it fails: DJ sets (tracks pitched, tempo-shifted, blended), remixes, live versions, unreleased music. On Pioneer gear the decks cover those; elsewhere they fall back to the live path.

### Tempo and beat as a hint to beatsense

The song's known BPM (from a metadata service, or Musixmatch's track data where it has it) seeds the tempo tracker. That removes half- and double-time lock and settles the tempo in seconds instead of bars. The exact beat phase (where beat 1 falls) is rarely in any public database, so beatsense still finds it, which is much easier with the tempo known. A hint, not a replacement: when nothing is identified, beatsense runs as today. This belongs in the beatsense package as an optional tempo prior, keeping it provider-free.

### Lyrics and pre-generation

1. Fetch the time-synced lyrics (a timestamp per line).
2. A small language model groups lines into scenes (a verse, a chorus) and writes one image prompt per scene, in a consistent style for the song.
3. Generate the images in parallel in the background. The first scene is ready within the first verse, and later ones well before they arrive.
4. Swap sprites on cue from the song offset, landing on a beat or a section change from beatsense.

### Caching makes it cheap

The same song has the same lyrics, so images are cached per song, scene and style. The first play of a song pays to generate its set; every later play, by anyone, is free and instant. For popular songs the cost per play rounds to nothing. Storage is R2, like uploaded particles.

### Licensing

Lyrics are licensed content. Musixmatch is the usual licensed source and has display rules and costs. Using lyrics only to choose imagery, never showing them, may change what is needed; that needs checking with the provider, not assuming. This is not legal advice.

## Live lyric imagery

### Why dictation is fast, and why songs are harder

Phone dictation streams: it processes audio in slices of about a tenth of a second, guesses words continuously and revises them, with a language model filling in likely words. It is trained on speech. Singing over a full mix is much harder: instruments cover the voice, vowels stretch across notes, effects and harmonies blur it, and lyrics don't follow normal sentences. Separating the vocals first (Demucs and similar) helps but costs compute and delay.

### Rough words are enough

Accuracy isn't needed to pick an image. Catching "fire", "ocean" and "falling" is enough for a language model to turn into imagery. The chain:

| Step | Rough time |
|---|---|
| Streaming transcription of the vocals | 1 to 3 s |
| Words to an image prompt (small fast model) | about 0.5 s |
| Fast image model at sprite size | about 1 s |

About 3 to 5 seconds behind the singer: too slow to hit a word, fine for visuals that shift each verse or chorus. It works on any song, and since nothing is displayed it sidesteps most of the lyrics licensing question.

### Cost control

Generate on a cadence, not per word: at most one image per scene or every N seconds, and only when the words have changed enough. Transcription is billed by audio minute, so it should run only while the feature is on.

## Tiers and cost

All three cost money per use, so they fit the paid tiers (tier names from the monetization plan: Dream free, Lucid, Third Eye):

- **Sprite generation:** a monthly allowance on Lucid, more or unlimited on Third Eye. Possibly a few free generations on Dream as a taste.
- **Song match:** Third Eye. Cached songs could be free to everyone who plays them, which makes the feature feel generous at almost no cost.
- **Live lyric imagery:** Third Eye, since transcription runs per minute.

Entitlements get a feature flag and a monthly count each, through `getEntitlements` like the other gates.

## Phased plan

1. **Benchmark** the image models (see above). No product changes.
2. **Sprite generation** behind a prompt box next to upload, server-side through an `ImageGenerator` interface, result through `sprite-strip`, saved to R2, with a monthly allowance per tier.
3. **Song identification** alone, feeding the tempo hint to beatsense. Useful by itself, with no images or lyrics.
4. **Song match imagery:** synced lyrics, scene prompts, pre-generation, per-song cache.
5. **Live lyric imagery** as the fallback for unidentified songs.

## Open questions

- Which song identification and lyrics providers, and what Musixmatch's terms allow for imagery-only use.
- Monthly generation allowances per tier.
- A style control (the user picks a look that every generated sprite follows), and whether it is per preset.
- Whether generated sprites are shareable in presets and packs like uploaded ones.
- Moderation: prompts and lyrics can ask for anything; the image providers' own filters may be enough, or may not.

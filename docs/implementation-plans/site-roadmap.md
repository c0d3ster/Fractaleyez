# Beyond the Visualizer: Site Roadmap

## Context

Fractaleyez started as the visualizer. This plan is for the site around it: a place where people learn how it works, get started without friction, share and find looks, buy and sell packs, and book a live show. One goal shapes several of these: bringing Fractaleyez to festivals as an **art exhibit**, an installation people walk into, not only visuals behind a DJ. It ties together plans that already exist (`learn-page.md`, `docs/research/monetization.md`, `docs/research/preset-visibility.md`) and adds the rest, so each piece can be built on its own but fits one site.

The guiding rule stays the same as in the app: the visualizer is the product and stays simple; everything that explains, organizes or sells lives around it, never inside the visual.

## Site map

| Page | What it is | Plan |
| --- | --- | --- |
| The visualizer (`/`) | The app, with the intro overlay on a first visit | Onboarding below, `preset-visibility.md` (intro overlay) |
| Learn | How everything works, at two depths | `learn-page.md` |
| Reference | Controls, shortcuts, FAQ, what's new | Reference below |
| Library | Your presets and packs: rename, organize, publish | `preset-visibility.md` (UI direction) |
| Market | Packs and presets to browse, preview and buy; starts as a Browse tab in the Library | Marketplace below, `monetization.md` |
| Creator pages | A creator's public packs, presets and clips | Marketplace below |
| Book | Book a live VJ show or an exhibit | Booking below, Festival exhibit below |
| Exhibit | The installation: artist statement, past exhibits, what it needs on site | Festival exhibit below |
| Gallery | Clips and looks made with Fractaleyez | Community below |

## Onboarding

Today a first visit drops straight into the visual. A guided start makes the first minute work for someone who has never seen it. `/` stays the visual: `preset-visibility.md` already decides on an intro overlay over it (a title that fades, with **Explore** and **Show me the way**, remembered in localStorage) and a walkthrough of about five steps. This builds on that.

- **Before the mic prompt:** the overlay is the natural place to ask, since it is a user gesture with context. say why the mic is needed (it listens to the music in the room; nothing is recorded or sent anywhere) so the browser prompt is not a surprise. If they decline or have no music playing, offer a built-in demo track so the visual still reacts.
- **Pick a vibe:** three or four presets shown as moving thumbnails, so the first look is one they chose.
- **The tour:** the overlay's **Show me the way** walkthrough. Its step-by-step design is in progress separately (the onboarding design doc): it fades the visual down to just the logo and builds the layers back one at a time with their hotkeys, then effects, palette, steering, the second-screen pop-out and saving. Skippable, and replayable from the menu.
- **Let it run:** Auto on, so the show keeps changing with nobody touching it, with a hint that everything can be tuned.
- **Progressive hints:** small one-time tips when someone first opens a section (for example, what the Shape pad is), linking to Learn for more.
- **Measure it:** how many first visits grant the mic, finish or skip the tour, and come back.

## Learn and reference

- **Learn** (`learn-page.md`): the deep dives for every system, from the fractal math to the Hopalong orbit, the Droste zoom, blending and the audio analysis.
- **Reference:** the controls and effects tables, keyboard shortcuts and quality tiers, moved out of the README into the site, with links from the app's info strip.
- **FAQ:** mic access, which browser, why it is slow on a laptop, using it on a projector or in OBS.
- **What's new:** a short changelog of features people can see (new fractal types, the logo spiral), which also gives each release something to share.

## Library and sharing

- **Library page:** manage your own presets and packs outside the visual, as `preset-visibility.md` describes (private, unlisted, public).
- **Share links:** a link that opens the visualizer on a preset, with a generated preview image or short clip for social cards.
- **Record a clip:** capture a few seconds of the visual (with the audio, where the browser allows it) to post. Cheap to build with the browser's MediaRecorder, and the best way for the community to spread it.

## Marketplace

Builds on `monetization.md`, which already has built-in versus creator packs (`Pack.origin`), purchases and the plan for Stripe Connect payouts.

- **Browse and preview:** as `preset-visibility.md` decides, browsing starts as a Browse tab beside My library, and a separate Market page waits until there is enough content to justify it. Packs get moving previews; the existing 15 second premium preview lets people try a look before buying.
- **Creators:** seller onboarding with Stripe Connect, a revenue share, a public creator page, and payouts.
- **Trust:** moderation and reporting (the visibility plan), ratings or "used in N shows", and refunds.
- **What Third Eye includes:** once creator packs exist, include all built-in packs and sell creator packs separately (or at a discount), as `monetization.md` already plans.
- **Commissions, later:** artists or events ordering a custom pack (their logo, colors and looks), made by the team or a creator.

## Booking

A page to book a live VJ show.

- **First version:** what a show includes, photos and clips from past shows, technical needs (projector or LED wall, a laptop input, the audio feed), and an inquiry form that sends the date, venue, type of event and budget to email or a calendar.
- **Packages:** a few clear options (for example, a set, a full night, a custom-branded show with the artist's or event's logo), priced or "from" prices.
- **Exhibits:** the same page books the installation (see Festival exhibit), with its own package and technical needs.
- **Later:** other creators bookable through the same page, as a directory of VJs who use Fractaleyez, with the site taking a booking fee.

## Festival exhibit

An installation at a festival: a room, dome or wall where the visuals run for hours, react to the music around them and to the people in front of them, and explain themselves to anyone curious. Much of the rest of this plan comes together here.

### Running unattended

- **Exhibit mode:** a full-screen kiosk mode with no UI, Auto running the show (presets, layers, fractal Types and Tours changing with the music), and a hidden key or long press to get back to the controls.
- **Hours of uptime:** a soak test of 12 hours or more watching memory, GPU resources and frame rate; recover on its own from a lost camera or audio input (the camera already reconnects), a GPU context loss, or a crash (reload into exhibit mode).
- **Offline:** everything an exhibit uses (presets, sprites, video clips, the demo track) cached locally, since festival internet is unreliable.
- **Scheduling:** a playlist of looks by time of day (calmer by day, heavier at night), or tied to the stage's set times.

### Interactive

- **See yourself in it:** the camera on the video layer, with the dream effects from `video-dream-effects.md`, so people walking up see themselves melt into the fractals. The strongest hook for an exhibit.
- **Presence:** the camera's motion or the number of people in front of it drives the visuals too (more movement, more energy), alongside the music.
- **Hands-on station:** a tablet or MIDI controller with a few big, safe controls (fractal Type, Tour, kaleidoscope, a palette), so visitors can play without breaking the show.
- **Phones as controllers, later:** scan a QR code to nudge the shape or palette from your phone, with a shared queue so many people can take turns.

### Explaining it

- **Placards:** short "how it works" panels next to the screens, written from the Learn page's plain level (the Shape pad as the parameter plane, the endless zoom, the Hopalong orbit), each with a QR code to the full deep dive.
- **Take it home:** a QR code on screen that opens the visualizer on the look that is playing, or saves a short clip of it, so the exhibit sends people to the site.

### Scale and setup

- **Multiple screens:** several outputs (one per wall or projector) from one machine, each running a different layer mix or a time offset of the same show.
- **Projection:** mapping onto domes, sculptures or uneven surfaces through projection mapping software (MadMapper, Resolume) fed by the clean output window.
- **Hardware list:** what an exhibit needs (a machine with a good GPU, projectors or LED walls, a camera, an audio line from the stage or a room mic) and the power and space.

### Getting in

- **Exhibit pitch kit:** an artist statement, photos and clips from past shows, the technical needs and a budget, which also feeds the Exhibit and Book pages.
- **Where to apply:** festival art programs and art grants usually open months ahead, so the pitch kit and a few documented installations are worth having early.

## Hearing the mix

What the app hears decides how good it looks, and a room mic hears the crowd, the PA's echo and the bass of the next stage. Feeding it the mix directly is one of the biggest upgrades available, for shows and exhibits alike.

### Line in

- **Any audio input:** the browser can open a specific input (an audio interface, a USB mixer, the mixer's booth or record output), not only the default mic. Add an input picker that works like the camera picker (`camera-source.ts`: a device list, the choice kept per browser), then measure how much the beat and section detection improve on a line feed.
- **Raw input:** browsers apply echo cancellation, noise suppression and automatic gain to the mic by default, which flattens drops and eats transients. The app already turns all three off (`MIC_CONSTRAINTS` in beatsense's `audio-source.ts`), so a line feed arrives clean. What is missing is choosing the input: today it takes the default one.
- **Levels:** a small input meter and gain trim, since a line feed is far hotter or quieter than a mic.

### Channels from the mixer

- **Multichannel input:** DJ mixers with a USB audio interface (Pioneer DJM, Allen & Heath, Rane) send each channel separately, before the faders. With those channels, the app can listen to the deck that is playing and the deck that is coming next, separately.
- **Know the next song before it plays:** analyze the incoming deck while the DJ cues it in their headphones: its tempo, its key, where its drop is. The show can prepare the next look and land the change exactly when the DJ brings it in.
- **Per-channel roles:** in a live band setup, a kick or vocal channel gives cleaner beats or vocal moments than the full mix.

### Track data from the DJ setup

- **What is loaded on each deck:** Pioneer CDJs and XDJs share the loaded track's title, artist, beat grid and which deck is on air over Pro DJ Link (readable with Deep Symmetry's open-source Beat Link). VirtualDJ speaks OS2L, Ableton Link shares tempo and phase, and Rekordbox, Serato and Traktor expose now playing through their history or plugins.
- **A small companion app:** browsers cannot speak these local network protocols, so a small desktop helper on the DJ's laptop (or the exhibit machine) reads them and passes the data to the visualizer over a local WebSocket. The same helper can carry MIDI and the output to Spout, Syphon or NDI.

### Knowing the song ahead

Once the app knows which song is coming, before it plays, it can get ready for it:

- **AI logo generation from the lyrics:** look up the song's lyrics and themes and generate logo art and palettes for it ahead of time, so they are ready the moment the track comes in instead of being generated live. Needs its own plan: the model, the prompt from the lyrics, cost and speed per song, and caching per track.
- **Synced lyrics:** time-coded lyrics can trigger moments on specific lines (a word on screen, a burst on the hook).
- **Licensing:** showing lyrics needs a licensed source (Musixmatch, LyricFind or similar). Check the terms for using them to drive generated art too, and keep generated art per track private to the show unless cleared.
- **Pick the look:** choose a preset, fractal Type or palette that fits the next track's tempo, key and energy.

## Live performance tools

For people running it at shows, which is also what makes the booking credible.

- **MIDI control:** map knobs and pads to sliders, layers and effects, with learn mode.
- **Output:** a clean full-screen output window without the UI, notes for OBS (browser source or window capture), and a look at Spout/Syphon/NDI through a small desktop wrapper later.
- **Setlists and cues:** an ordered list of presets to step through, crossfading on a key or on the next drop.
- **Tap tempo and BPM lock:** for when no line feed is available and the mic hears the room badly.

## Community

- **Gallery:** clips people record and choose to share, linked to the preset that made them.
- **Challenges:** a monthly theme with a pack or a Third Eye month as the prize.
- **Where people already are:** Reddit (the fractal and VJ communities), Discord for feedback and requests, and posting each new feature there (the fractal types are the first).

## Other ideas

- **Embed:** a small embeddable player for musicians' sites or event pages, running a chosen preset.
- **Branded editions:** event or artist editions with their logo layer, palette and a fixed set of presets, as a paid product for festivals and labels.
- **Phone:** make the site installable (a PWA) and tune a light mode of the visual for phones.
- **Collaborations:** packs made with artists and released with their music.

## Phases

1. **Now, around launch:** onboarding (the intro overlay and walkthrough, the mic explanation, pick a vibe, the demo track), the Learn page v1, the reference pages, and share links.
2. **Next:** line in (the audio input picker and a level meter), the Library page and visibility, recording clips, the booking page, a "what's new" page, and for exhibits: exhibit mode, the soak test, offline caching, the pitch kit and the interactive pieces (the camera dream, presence and the hands-on station).
3. **Later:** the mixer channels and the companion app (track data from the DJ setup, knowing the song ahead, AI logo generation from lyrics), the creator marketplace with payouts, live performance tools (MIDI, setlists, the output window), phone control and multiple screens for exhibits, the gallery and challenges, embeds and branded editions.

## Open questions

- One site or two: the content pages in the same app (it is one webpack SPA today, so this needs a router and Vercel rewrites, as the Library already does) or a separate content site that links to the app.
- How the booking side is branded: Fractaleyez shows, a personal VJ name, or both.
- Which phase the demo track and recording need, since both may matter most for first impressions.
- Whether the companion app is worth building early, since it unlocks the mixer channels, DJ track data, MIDI and video outputs at once.

# Pioneer: CDJs and DJM over Pro DJ Link

## Context

Most club and festival booths are Pioneer CDJs and a DJM mixer, and many DJs play straight from USB sticks with no laptop. That setup already knows a lot about the music: each CDJ knows the track it has loaded (title, artist, BPM, key), its beat grid and, from rekordbox's analysis, its phrase structure, and the players share this over Pro DJ Link, the Ethernet network that joins them. If Fractaleyez can read that network, it knows **which song is coming before the DJ brings it in**, where its drops are, and exactly where in each track the playhead is. That is better than listening alone, and better than Shazam-style identification (`docs/research/ai-visuals.md`), which this makes unnecessary whenever the gear is Pioneer.

**Priority:** high. Test gear on hand: a DJM-900NXS2 and CDJ-3000s.

## What the network gives us

Per player, through a Pro DJ Link library (see Architecture):

- **The loaded track:** title, artist, album art, BPM, key, duration, from the rekordbox export on the USB stick, the moment a track is loaded (before it plays).
- **Beat grid and waveform**, from rekordbox's analysis.
- **Phrase analysis** (song structure such as intro, verse, chorus, bridge, outro, and up and down for EDM), on CDJ-3000s with tracks analyzed in rekordbox.
- **Playback state:** playing or cued, tempo and pitch, the current beat, and on CDJ-3000s the exact playhead position (updated about every 30 ms).
- **Which deck is on air:** the mixer reports which channels are up, so we know which track the crowd is hearing.

So the visualizer can:

- **Know the song ahead.** When a track is loaded on the deck that is not on air, look up its identity, start preparing its look and, from `ai-visuals.md`, generate its images and fetch its lyrics before it plays. No fingerprinting, and it works for edits and unreleased tracks too, since the name comes from the DJ's own library.
- **Know the beat exactly.** The CDJs share the beat and tempo, so beatsense gets the real tempo and beat phase instead of finding them, which is its hardest job. Beatsense keeps listening as a fallback.
- **Know the structure ahead.** Phrase analysis says where the chorus or the drop is, so Auto mode can land a change exactly on it, with the section model as the fallback for tracks without phrase data.
- **Sync lyrics exactly.** The playhead position replaces the fingerprint offset for timed lyrics and pre-generated scene images.

## Audio from the DJM

The network carries data, not audio. For listening (beatsense, the per-deck analysis):

- **Simplest:** the DJM's booth or record output into an audio interface, or the master over USB, as a line feed (see "Hearing the mix" in `site-roadmap.md`).
- **Per channel:** the DJM-900NXS2 has two built-in USB audio interfaces, and its Settings Utility routes several sources to the computer, including each channel. A channel's raw input (before the fader) lets the app hear the incoming deck while the DJ cues it in their headphones. Which sources the 900NXS2 offers per channel (post-fader, or the raw "control tone" input) needs checking on the actual mixer.

With CDJ data, per-channel audio matters less, since the data already says what is coming. Start with one line feed plus the network.

## Architecture

A browser cannot join Pro DJ Link (it is UDP broadcast on the local network), so this needs a small desktop helper on the visuals machine, working name **Fractaleyez Link**:

- It joins the network and keeps the state of every deck, then sends it to the visualizer over a local WebSocket (`ws://localhost`). The visualizer works exactly as today when the helper is not running.
- Its first job is Pro DJ Link; it is also the natural home for MIDI, the outputs for OBS, Resolume and similar (Spout, Syphon, NDI) and the exhibit's offline cache (see `site-roadmap.md`), so it is worth building once.
- Written in TypeScript (Node, packaged as a small app), to stay in the repo's stack, maybe as a workspace package like beatsense.

Two ways to read the network, to compare in the spike:

1. **Directly, with a library.** `alphatheta-connect` (TypeScript, a fork of `prolink-connect`) lists CDJ-3000 support including the 30 ms playhead position and phrase analysis. Beat Link (Java, by Deep Symmetry, the most mature implementation, behind Beat Link Trigger) is the reference to check behavior against. These are reverse engineered, not official: they join the network as a virtual player, which uses a player number, and a firmware update could change things.
2. **Through Pioneer's official PRO DJ LINK Bridge**, a free app that connects players to visual software, read over TCNet (`node-tcnet`). It is officially supported and keeps the visuals off the DJ's own network, but it has to be running on a Mac or Windows machine, and it may not expose everything (phrase analysis in particular).

Prefer the official Bridge if it gives what we need, and fall back to the direct library for what it does not.

## rekordbox on a laptop

DJs playing from rekordbox on a laptop (Performance mode, or Link Export to CDJs) appear on the same network, so the same helper covers them. Lower priority than standalone CDJs, which is what most booths are.

## Test plan (DJM-900NXS2 and CDJ-3000s)

1. Network: the CDJs, the DJM and the visuals machine on one switch (or the players' usual link), with the helper running a library or the Bridge.
2. Load tracks from a rekordbox USB export and check that title, artist, BPM, key, beat grid and phrase analysis arrive for each deck, and how fast after loading.
3. Play and cue: check the playhead position against the CDJ's display, the beat packets against the audio, and that on-air status follows the faders.
4. Change tempo, pitch bend, loop and hot cue, and check the state follows.
5. Audio: route a line feed (booth, record out or USB) and, separately, try each per-channel USB source in the Settings Utility to see which give the raw incoming deck.
6. Check nothing disturbs the DJ: the players keep linking, syncing and sharing tracks normally with the helper on the network (the main risk of the direct route).

## Phases

1. **Spike:** the helper reads deck state from the CDJ-3000s and prints it, through both routes. Decide on the route.
2. **Beat and tempo:** feed the CDJ beat and tempo to beatsense as a prior; show the loaded tracks on the Beat HUD.
3. **Know the song ahead:** on load, show the next track and prepare its look; Auto lands changes on phrase boundaries.
4. **AI visuals per track:** the song-match path of `ai-visuals.md`, keyed on the CDJ's track identity, with images and lyrics prepared while the track is cued.
5. **More of the helper:** MIDI and the video outputs.

## Open questions

- The official Bridge versus a direct library, after the spike.
- How the helper is installed and updated (signed builds for macOS and Windows).
- Whether per-deck data is shown to the DJ (a small "next up" in the HUD) or only used behind the scenes.

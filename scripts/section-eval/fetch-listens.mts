// Pulls the listening sessions the app recorded (Settings, Training recorder; src/spotify/listen-recorder.ts) from MongoDB into one
// replayable log per song, plus an index of what was heard.
//
//   tsx fetch-listens.mts <out dir> [--env=production] [--since 2026-11-01]
//
// <out dir>/<listen id>.json is a version 3 section log: the version 2 fields (replay-log.mts reads it) plus each tick's peak, onsets
// and spectrum, the player readings and the song's place on the tick clock. <out dir>/index.json lists every listen with its track and
// the track's Deezer and confirmed BPM. Already-fetched listens are skipped.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { decodeTicks } from '../../src/audioanalysis/tick-encoding.ts'

createRequire(import.meta.url)('../loadEnv.js')

type ListenDoc = {
  _id: mongoose.Types.ObjectId
  trackId: string
  trackName: string
  artists: string[]
  startedAt: Date
  ticks: { buffer: Uint8Array } | Uint8Array
  [field: string]: unknown
}

type TrackDoc = { trackId: string; deezerBpm: number | null; confirmedBpm: number | null }

const args = process.argv.slice(2)
const out = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--since')
if (!out) throw new Error('usage: tsx fetch-listens.mts <out dir> [--since <date>]')
const since = args.includes('--since') ? new Date(args[args.indexOf('--since') + 1]!) : new Date(0)
mkdirSync(out, { recursive: true })

const uri = process.env.MONGO_URI
if (!uri) throw new Error('MONGO_URI is not set')
await mongoose.connect(uri)
const db = mongoose.connection.db!
const listens = await db.collection<ListenDoc>('listens').find({ startedAt: { $gte: since } }).sort({ startedAt: 1 }).toArray()
const tracks = new Map((await db.collection<TrackDoc>('tracks').find({}).toArray()).map((t) => [t.trackId, t]))

const index = listens.map((listen) => {
  const id = String(listen._id)
  const track = tracks.get(listen.trackId)
  const path = join(out, `${id}.json`)
  if (!existsSync(path)) {
    const raw = listen.ticks
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer)
    const { _id, ticks: _ticks, ...meta } = listen
    writeFileSync(path, JSON.stringify({ version: 3, tickMs: listen.tickMs, savedAt: listen.startedAt, ...meta, id, ticks: decodeTicks(bytes) }))
  }
  return {
    id,
    trackId: listen.trackId,
    trackName: listen.trackName,
    artists: listen.artists,
    startedAt: listen.startedAt,
    endReason: listen.endReason,
    playedMs: listen.playedMs,
    deezerBpm: track?.deezerBpm ?? null,
    confirmedBpm: track?.confirmedBpm ?? null,
  }
})
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 1))
console.log(`${listens.length} listens of ${new Set(listens.map((l) => l.trackId)).size} tracks in ${out}`)
await mongoose.disconnect()

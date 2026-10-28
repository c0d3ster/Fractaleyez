// node mp4info.js <file.mp4> [focusSec ...]   prints the first video track's codec, size, frame rate, keyframe times, biggest frames and
// the bitrate around each focus time (seconds). For finding why a clip stalls at the same position every loop.
const fs = require('fs')

const file = process.argv[2]
const focus = process.argv.slice(3).map(Number)
const buf = fs.readFileSync(file)
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])

const boxes = (start, end) => {
  const out = []
  let pos = start
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    let header = 8
    if (size === 1) { size = Number(buf.readBigUInt64BE(pos + 8)); header = 16 }
    if (size === 0) size = end - pos
    if (size < header) break
    out.push({ type, start: pos + header, end: pos + size })
    pos += size
  }
  return out
}

const tracks = []
const walk = (list, track) => {
  list.forEach((box) => {
    if (box.type === 'trak') { const t = {}; tracks.push(t); walk(boxes(box.start, box.end), t); return }
    if (CONTAINERS.has(box.type)) { walk(boxes(box.start, box.end), track); return }
    if (!track) return
    track[box.type] = box
  })
}
walk(boxes(0, buf.length), null)

const track = tracks.find((t) => t.hdlr && buf.toString('latin1', t.hdlr.start + 8, t.hdlr.start + 12) === 'vide')
if (!track) throw new Error('no video track')

const mdhd = track.mdhd.start
const version = buf.readUInt8(mdhd)
const timescale = version === 1 ? buf.readUInt32BE(mdhd + 20) : buf.readUInt32BE(mdhd + 12)

// Sample decode times from stts.
const sttsAt = track.stts.start + 4
const sttsCount = buf.readUInt32BE(sttsAt)
const dts = []
let t = 0
for (let i = 0; i < sttsCount; i++) {
  const count = buf.readUInt32BE(sttsAt + 4 + i * 8)
  const delta = buf.readUInt32BE(sttsAt + 8 + i * 8)
  for (let k = 0; k < count; k++) { dts.push(t / timescale); t += delta }
}
// Sample sizes from stsz.
const stszAt = track.stsz.start + 4
const fixed = buf.readUInt32BE(stszAt)
const n = buf.readUInt32BE(stszAt + 4)
const sizes = Array.from({ length: n }, (_, i) => (fixed !== 0 ? fixed : buf.readUInt32BE(stszAt + 8 + i * 4)))
// Keyframes from stss (all samples when absent).
const keys = track.stss
  ? Array.from({ length: buf.readUInt32BE(track.stss.start + 4) }, (_, i) => buf.readUInt32BE(track.stss.start + 8 + i * 4) - 1)
  : sizes.map((_, i) => i)
const hasCtts = Boolean(track.ctts)

// Codec, picture size and (for avc1) profile and level.
const stsd = track.stsd.start + 8
const codec = buf.toString('latin1', stsd + 4, stsd + 8)
const width = buf.readUInt16BE(stsd + 8 + 24)
const height = buf.readUInt16BE(stsd + 8 + 26)
let profile = ''
const entryEnd = stsd + buf.readUInt32BE(stsd)
boxes(stsd + 8 + 78, entryEnd).forEach((b) => {
  if (b.type === 'avcC') profile = `profile ${buf.readUInt8(b.start + 1)} level ${(buf.readUInt8(b.start + 3) / 10).toFixed(1)}`
  if (b.type === 'hvcC') profile = 'hevc'
})
const duration = dts.length ? dts[dts.length - 1] + (dts[1] ?? 0) - (dts[0] ?? 0) : 0
const bytes = sizes.reduce((s, x) => s + x, 0)
console.log(`${file.split(/[\\/]/).pop()}: ${codec} ${width}x${height} ${profile}, ${n} frames over ${duration.toFixed(2)}s (${(n / duration).toFixed(2)} fps), ${(bytes * 8 / duration / 1e6).toFixed(2)} Mbit/s, B-frame reordering: ${hasCtts ? 'yes' : 'no'}`)
const gaps = keys.slice(1).map((k, i) => dts[k] - dts[keys[i]])
console.log(`keyframes: ${keys.length}; spacing ${Math.min(...gaps).toFixed(2)}-${Math.max(...gaps).toFixed(2)}s; at ${keys.map((k) => dts[k].toFixed(2)).join(', ')}`)
const big = sizes.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, 6)
console.log('biggest frames:', big.map(([s, i]) => `${dts[i].toFixed(2)}s ${(s / 1024).toFixed(0)}KB${keys.includes(i) ? ' (key)' : ''}`).join(' | '))
const perSecond = {}
sizes.forEach((s, i) => { const sec = Math.floor(dts[i]); perSecond[sec] = (perSecond[sec] || 0) + s })
const avg = bytes / duration
console.log('bitrate per second (Mbit/s):', Object.entries(perSecond).map(([s, b]) => `${s}:${(b * 8 / 1e6).toFixed(1)}`).join(' '))
focus.forEach((f) => {
  const lo = f - 0.5
  const hi = f + 0.5
  const inWin = sizes.map((s, i) => [s, i]).filter(([, i]) => dts[i] >= lo && dts[i] <= hi)
  const sum = inWin.reduce((s, [x]) => s + x, 0)
  const nearestKey = keys.map((k) => dts[k]).reduce((best, x) => (Math.abs(x - f) < Math.abs(best - f) ? x : best), Infinity)
  console.log(`around ${f}s: ${(sum * 8 / 1e6).toFixed(2)} Mbit in that second (clip average ${(avg * 8 / 1e6).toFixed(2)} Mbit/s), largest frame ${(Math.max(...inWin.map(([x]) => x)) / 1024).toFixed(0)}KB, nearest keyframe ${nearestKey.toFixed(2)}s`)
})

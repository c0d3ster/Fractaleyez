import { describe, expect, it } from 'vitest'

import { addPass, fromViewId, parseLabFile, parseSongFile, passBounds, removePass, serializeSongFile, setPassLabels, setPassOffset, songBounds, songFileName, songFromSession, songLabels, viewId } from '../../lab/recording/songFile'
import { agreementByKind, groupLabels } from '../../lab/recording/mergeLabels'
import { serializeSessionFile, type LabSessionFile } from '../../lab/recording/sessionFile'
import { SessionRecorder } from '../../lab/recording/sessionRecorder'
import type { LabelKind } from '../../lab/recording/labels'
import { syntheticReadings } from './syntheticFrames'

/** A session from `start` (audio clock) with labels at the given times. */
const session = (start: number, labels: Array<[LabelKind, number]>): LabSessionFile => {
  const recorder = new SessionRecorder()
  recorder.start(start)
  syntheticReadings(120, Math.ceil(start / (1000 / 60))).forEach((reading) => recorder.addFrame(reading))
  labels.forEach(([kind, t]) => recorder.addLabel(kind, t))
  recorder.stop(start + 2000)
  return recorder.toFile({ sectionTicks: [], sampleRate: 48000 })!
}

// The same song twice: pass 2's clock is 10 s behind pass 1's, so song time = its clock + 10000.
const PASS_1 = session(1000, [['kick', 1200], ['kick', 1700], ['snare', 1450]])
const PASS_2 = session(-8800, [['kick', -8790], ['kick', -8300], ['hat', -8500]])
const twoPasses = (): ReturnType<typeof songFromSession> =>
  addPass(songFromSession(PASS_1, 'take1.json'), { name: 'take2.json', offsetMs: 10000, alignment: { score: 0.95, runnerUp: 0.7 }, session: PASS_2 })

describe('song file', () => {
  it('starts from a session, titled after its file', () => {
    const song = songFromSession(PASS_1, 'my-song-labelled.json')
    expect(song.title).toBe('my-song')
    expect(song.passes).toEqual([{ name: 'my-song-labelled.json', offsetMs: 0, alignment: null, session: PASS_1 }])
  })

  it('puts every pass\'s labels on song time, with ids unique across passes', () => {
    const labels = songLabels(twoPasses())
    expect(labels.map(({ t, passIndex, kind }) => [t, passIndex, kind])).toEqual([
      [1200, 0, 'kick'], [1210, 1, 'kick'], [1450, 0, 'snare'], [1500, 1, 'hat'], [1700, 0, 'kick'], [1700, 1, 'kick'],
    ])
    expect(new Set(labels.map(({ id }) => id)).size).toBe(6)
    expect(fromViewId(viewId(1, 2))).toEqual({ passIndex: 1, labelId: 2 })
    expect(songLabels(twoPasses(), new Set([1])).every(({ passIndex }) => passIndex === 1)).toBe(true)
  })

  it('covers the time of every pass', () => {
    expect(passBounds(twoPasses().passes[1]!)).toEqual({ startMs: 1200, endMs: 3200 })
    expect(songBounds(twoPasses())).toEqual({ startMs: 1000, endMs: 3200 })
  })

  it('edits one pass\'s labels and offset, and never drops the first pass', () => {
    const song = setPassLabels(twoPasses(), 1, [{ id: 1, kind: 'kick', t: -8780 }], new Date('2026-11-14T00:00:00Z'))
    expect(song.passes[1]!.session.labels).toEqual([{ id: 1, kind: 'kick', t: -8780 }])
    expect(song.passes[1]!.session.editedAt).toBe('2026-11-14T00:00:00.000Z')
    expect(song.passes[0]!.session.labels).toHaveLength(3)
    const nudged = setPassOffset(song, 1, 10020)
    expect(nudged.passes[1]!.offsetMs).toBe(10020)
    expect(nudged.passes[1]!.alignment).toBeNull()
    expect(removePass(nudged, 0).passes).toHaveLength(2)
    expect(removePass(nudged, 1).passes).toHaveLength(1)
  })

  it('round-trips through its text, and opens a session file as a song of one pass', () => {
    const song = twoPasses()
    const text = serializeSongFile(song, new Date('2026-11-14T00:00:00Z'))
    expect(parseSongFile(text)).toEqual({ ...song, savedAt: '2026-11-14T00:00:00.000Z' })
    expect(parseLabFile(text, 'x.song.json').passes).toHaveLength(2)
    expect(parseLabFile(serializeSessionFile(PASS_1), 'take1.json').passes).toHaveLength(1)
  })

  it('says what is wrong with a song it cannot read', () => {
    const song = JSON.parse(serializeSongFile(twoPasses())) as Record<string, unknown>
    expect(() => parseSongFile(JSON.stringify({ ...song, version: 2 }))).toThrow('version 2')
    expect(() => parseSongFile(JSON.stringify({ ...song, passes: [] }))).toThrow('no passes')
    const badPass = { ...(song.passes as unknown[])[1] as object, session: { format: 'nope' } }
    expect(() => parseSongFile(JSON.stringify({ ...song, passes: [(song.passes as unknown[])[0], badPass] }))).toThrow('pass 2')
  })

  it('names the file after the title', () => {
    expect(songFileName('Daft Punk / One More Time')).toBe('Daft-Punk-One-More-Time.song.json')
    expect(songFileName('///')).toBe('song.song.json')
  })
})

describe('agreement across passes', () => {
  it('groups one kind\'s labels from different passes that land close together', () => {
    const labels = songLabels(twoPasses())
    const groups = groupLabels(labels)
    const kicks = groups.filter(({ kind }) => kind === 'kick')
    expect(kicks.map(({ members }) => members.length)).toEqual([2, 2])
    expect(kicks[0]!.t).toBe(1205)
    // The snare and the hat are each one pass's alone.
    expect(groups.filter(({ kind }) => kind !== 'kick').map(({ members }) => members.length)).toEqual([1, 1])
  })

  it('never puts two labels of one pass in a group', () => {
    const song = setPassLabels(twoPasses(), 1, [{ id: 1, kind: 'kick', t: -8790 }, { id: 2, kind: 'kick', t: -8780 }])
    const groups = groupLabels(songLabels(song)).filter(({ kind }) => kind === 'kick')
    expect(groups.every(({ members }) => new Set(members.map(({ passIndex }) => passIndex)).size === members.length)).toBe(true)
  })

  it('counts agreement only among the passes that labelled the kind', () => {
    const labels = songLabels(twoPasses())
    const agreement = agreementByKind(groupLabels(labels), labels)
    expect(agreement.kick).toEqual({ passes: 2, groups: 2, agreed: 2 })
    // Only pass 1 did snares and only pass 2 did hats: each of their labels is all its passes agree on.
    expect(agreement.snare).toEqual({ passes: 1, groups: 1, agreed: 1 })
    expect(agreement.hat).toEqual({ passes: 1, groups: 1, agreed: 1 })
    expect(agreement.drop).toEqual({ passes: 0, groups: 0, agreed: 0 })
  })
})

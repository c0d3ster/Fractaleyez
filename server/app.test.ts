import type { Request, Response } from 'express'
import request from 'supertest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from './app'
import * as presets from './routes/presetsHandler'
import * as preset from './routes/presetHandler'
import * as savePreset from './routes/savePresetHandler'
import * as packs from './routes/packsHandler'
import * as myPacks from './routes/myPacksHandler'
import * as createPack from './routes/createPackHandler'
import * as upload from './routes/uploadParticleHandler'
import * as me from './routes/meHandler'
import * as clerk from './routes/clerkWebhookHandler'
import * as ping from './routes/pingHandler'
import * as getConfig from './routes/getConfigHandler'

// Each stub answers with its own name plus what the route received, so a test sees which handler ran and with what body.
// Hoisted because vi.mock factories run before the rest of the module.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => vi.fn(async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ handler: name, isBuffer: Buffer.isBuffer(req.body), body: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body, params: req.params })
  }),
}))

vi.mock('./routes/presetsHandler', () => ({ presetsHandler: stub('presets') }))
vi.mock('./routes/presetHandler', () => ({ presetHandler: stub('preset') }))
vi.mock('./routes/savePresetHandler', () => ({ savePresetHandler: stub('savePreset') }))
vi.mock('./routes/packsHandler', () => ({ packsHandler: stub('packs') }))
vi.mock('./routes/myPacksHandler', () => ({ myPacksHandler: stub('myPacks') }))
vi.mock('./routes/createPackHandler', () => ({ createPackHandler: stub('createPack') }))
vi.mock('./routes/uploadParticleHandler', () => ({ uploadParticleHandler: stub('uploadParticle'), MAX_UPLOAD_BYTES: 64 }))
vi.mock('./routes/meHandler', () => ({ meHandler: stub('me'), updateMeHandler: stub('updateMe') }))
vi.mock('./routes/clerkWebhookHandler', () => ({ clerkWebhookHandler: stub('clerkWebhook'), MAX_WEBHOOK_BYTES: 1024 }))
vi.mock('./routes/pingHandler', () => ({ pingHandler: stub('ping') }))
vi.mock('./routes/getConfigHandler', () => ({ getConfigHandler: stub('getConfig') }))

const app = createApp()

describe('createApp routing', () => {
  beforeEach(() => {
    for (const mod of [presets, preset, savePreset, packs, myPacks, createPack, upload, me, clerk, ping, getConfig]) {
      for (const fn of Object.values(mod)) if (vi.isMockFunction(fn)) fn.mockClear()
    }
  })

  it.each([
    ['get', '/api/me', 'me'],
    ['patch', '/api/me', 'updateMe'],
    ['get', '/api/presets', 'presets'],
    ['get', '/api/preset?id=x', 'preset'],
    ['post', '/api/savePreset', 'savePreset'],
    ['get', '/api/packs', 'packs'],
    ['get', '/api/packs/mine', 'myPacks'],
    ['get', '/api/myPacks', 'myPacks'],
    ['post', '/api/pack', 'createPack'],
    ['post', '/api/createPack', 'createPack'],
    ['get', '/api/ping', 'ping'],
  ] as const)('%s %s reaches %s', async (method, path, handler) => {
    const res = await request(app)[method](path).send({})
    expect(res.status).toBe(200)
    expect(res.body.handler).toBe(handler)
  })

  it('passes the preset name to getConfig', async () => {
    const res = await request(app).get('/api/getConfig/default')
    expect(res.body).toMatchObject({ handler: 'getConfig', params: { name: 'default' } })
  })

  it('gives the Clerk webhook the exact raw bytes', async () => {
    const payload = '{"id":"evt_1",  "spacing":"kept"}'
    const res = await request(app).post('/api/clerkWebhook').set('Content-Type', 'application/json').send(payload)
    expect(res.body).toMatchObject({ handler: 'clerkWebhook', isBuffer: true, body: payload })
  })

  it('parses JSON for the other routes', async () => {
    const res = await request(app).post('/api/savePreset').send({ name: 'mine', config: {} })
    expect(res.body).toMatchObject({ handler: 'savePreset', isBuffer: false, body: { name: 'mine', config: {} } })
  })

  it('takes a raw image upload and caps its size', async () => {
    const ok = await request(app).post('/api/uploadParticle').set('Content-Type', 'image/png').send(Buffer.alloc(32))
    expect(ok.body).toMatchObject({ handler: 'uploadParticle', isBuffer: true })
    const tooBig = await request(app).post('/api/uploadParticle').set('Content-Type', 'image/png').send(Buffer.alloc(128))
    expect(tooBig.status).toBe(413)
    expect(tooBig.body).toEqual({ error: 'Payload too large' })
  })

  it('answers malformed JSON and unknown API paths with JSON errors', async () => {
    const malformed = await request(app).post('/api/savePreset').set('Content-Type', 'application/json').send('{not json')
    expect(malformed.status).toBe(400)
    expect(malformed.body).toEqual({ error: 'Malformed request body' })

    const unknown = await request(app).get('/api/nope')
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ error: 'Not found' })
  })
})

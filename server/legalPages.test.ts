import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Static pages Vercel serves from public/ (vercel.json rewrites /terms and /privacy to them) and the Stripe portal links to.
const PUBLIC_DIR = path.join(import.meta.dirname, '../public')
const DRAFT_BANNER = 'Draft for review. Not legal advice. Not yet in effect.'
const PROCESSORS = ['Clerk', 'Stripe', 'MongoDB', 'Cloudflare R2', 'Vercel']

const readPage = (name: string): string => fs.readFileSync(path.join(PUBLIC_DIR, name, 'index.html'), 'utf8')

describe('legal pages', () => {
  const pages = { terms: readPage('terms'), privacy: readPage('privacy') }

  it.each(Object.entries(pages))('%s shows the draft banner', (_name, html) => {
    expect(html).toContain(DRAFT_BANNER)
  })

  it('link to each other and back to the app', () => {
    expect(pages.terms).toContain('href="/privacy"')
    expect(pages.privacy).toContain('href="/terms"')
    expect(pages.terms).toContain('href="/"')
    expect(pages.privacy).toContain('href="/"')
  })

  it.each(PROCESSORS)('privacy policy names %s', (processor) => {
    expect(pages.privacy).toContain(processor)
  })

  it('terms cover billing through Stripe and uploads on Cloudflare R2', () => {
    expect(pages.terms).toContain('Stripe')
    expect(pages.terms).toContain('Cloudflare R2')
    expect(pages.terms).toContain('Clerk')
  })

  it('are rewritten at their clean URLs on Vercel', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../vercel.json'), 'utf8')) as {
      rewrites: { source: string; destination: string }[]
    }
    expect(vercel.rewrites).toEqual(expect.arrayContaining([
      { source: '/terms', destination: '/terms/index.html' },
      { source: '/privacy', destination: '/privacy/index.html' },
    ]))
  })
})

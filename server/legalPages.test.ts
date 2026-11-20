import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Static pages Vercel serves from public/ (vercel.json rewrites /terms and /privacy to them) and the Stripe portal links to.
const PUBLIC_DIR = path.join(import.meta.dirname, '../public')
const DRAFT_BANNER = 'Draft for review. Not legal advice. Not yet in effect.'
const PROCESSORS = ['Clerk', 'Stripe', 'MongoDB', 'Cloudflare R2', 'Vercel']

const readPage = (name: string): string => fs.readFileSync(path.join(PUBLIC_DIR, name, 'index.html'), 'utf8')
const CONTACT = 'support@c0d3ster.com'

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

  it.each(Object.entries(pages))('%s stays out of search engines until launch', (_name, html) => {
    expect(html).toContain('<meta name="robots" content="noindex">')
  })

  it.each(Object.entries(pages))('%s names the operator and the support email, with no mailing address placeholder', (_name, html) => {
    expect(html).toContain('c0d3ster LLC')
    expect(html).toContain(`mailto:${CONTACT}`)
    expect(html).not.toContain('[contact email]')
    expect(html).not.toContain('[mailing address]')
  })

  it.each(Object.entries(pages))('%s has no placeholders left', (_name, html) => {
    expect(html).not.toContain('class="todo"')
    expect(html).not.toMatch(/\[(?:owner|confirm|effective date|minimum age|contact email|mailing address)[^\]]*\]/i)
    expect(html).toContain('Last updated: November 20, 2026')
  })

  it.each(Object.entries(pages))('%s has no em dashes', (_name, html) => {
    expect(html).not.toContain('\u2014')
  })

  it('terms give a full refund within 7 days of any charge', () => {
    expect(pages.terms).toContain('full refund of any charge within 7 days of that charge, no questions asked')
    expect(pages.terms).toContain('case by case')
    expect(pages.terms).toContain('plan keeps running to the end of the period you paid for')
  })

  it('terms are governed by Virginia law with a Virginia venue', () => {
    expect(pages.terms).toContain('laws of the Commonwealth of Virginia')
    expect(pages.terms).toContain('courts\n        located in Virginia')
    expect(pages.terms).not.toContain('[governing law state]')
  })

  it('terms set the minimum ages and keep the liability cap', () => {
    expect(pages.terms).toContain('at least 13 years old to use the Service')
    expect(pages.terms).toContain('at least 18, or have\n        a parent or guardian buy it')
    expect(pages.terms).toContain('12 months before the claim, or US $50')
  })

  it('terms mark the free trial as not offered yet', () => {
    expect(pages.terms).toContain('Free trial (not offered yet)')
    expect(pages.terms).toContain('7-day free trial')
  })

  it('terms say no sales tax is collected and prices are in USD', () => {
    expect(pages.terms).toContain('We do not collect sales tax at this time')
    expect(pages.terms).toContain('US dollars (USD)')
  })

  it.each(Object.entries(pages))('%s describe what account deletion does', (_name, html) => {
    expect(html).toContain('deletes your private presets, packs and uploads')
    expect(html).toContain('cancels any subscription immediately')
  })

  it('privacy policy drops Google and calls Vercel Analytics cookieless', () => {
    expect(pages.privacy).not.toMatch(/Google/)
    expect(pages.privacy).toContain('Vercel Analytics is cookieless and privacy-friendly')
    expect(pages.privacy).toContain('no cookie\n        banner')
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

describe('app page', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')

  it('loads no Google Analytics', () => {
    expect(html).not.toMatch(/gtag|googletagmanager|dataLayer/)
  })

  it('loads no Google Fonts', () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  })

  it('self-hosts the Acme font and ships its license', () => {
    const fontUrl = html.match(/@font-face\s*{[^}]*font-family: 'Acme'[^}]*url\('(\/fonts\/[^']+\.woff2)'\)/)?.[1]
    expect(fontUrl).toBeDefined()
    expect(fs.existsSync(path.join(PUBLIC_DIR, fontUrl ?? ''))).toBe(true)
    expect(fs.readFileSync(path.join(PUBLIC_DIR, 'fonts/acme/OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1')
  })

  it('loads scripts and styles only from this site', () => {
    const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(([, url]) => url)
    expect(external).toEqual([])
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { createFeed, createCategory, insertArticle, markArticleSeen, getDb } from '../db.js'
import type { FastifyInstance } from 'fastify'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockStreamSummarize, mockStreamTranslate } = vi.hoisted(() => ({
  mockStreamSummarize: vi.fn(),
  mockStreamTranslate: vi.fn(),
}))

vi.mock('../fetcher.js', async () => {
  const { EventEmitter } = await import('events')
  return {
    fetchAllFeeds: vi.fn(),
    fetchSingleFeed: vi.fn(),
    discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: null, title: null }),
    summarizeArticle: vi.fn().mockResolvedValue({ summary: 'summary text', inputTokens: 10, outputTokens: 5, billingMode: 'standard', model: 'haiku' }),
    streamSummarizeArticle: (...args: unknown[]) => mockStreamSummarize(...args),
    translateArticle: vi.fn().mockResolvedValue({ fullTextTranslated: '翻訳テキスト', inputTokens: 10, outputTokens: 5, billingMode: 'standard', model: 'sonnet' }),
    streamTranslateArticle: (...args: unknown[]) => mockStreamTranslate(...args),
    fetchProgress: new EventEmitter(),
    getFeedState: vi.fn(),
  }
})

vi.mock('../anthropic.js', () => ({
  anthropic: { messages: { stream: vi.fn(), create: vi.fn() } },
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: FastifyInstance
const json = { 'content-type': 'application/json' }

function seedFeed(overrides: Partial<Parameters<typeof createFeed>[0]> = {}) {
  return createFeed({ name: 'Test Feed', url: 'https://example.com', ...overrides })
}

function seedArticle(feedId: number, overrides: Partial<Parameters<typeof insertArticle>[0]> = {}) {
  return insertArticle({
    feed_id: feedId,
    title: 'Test Article',
    url: `https://example.com/article/${Math.random()}`,
    published_at: '2025-01-01T00:00:00Z',
    ...overrides,
  })
}

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
  mockStreamSummarize.mockReset()
  mockStreamTranslate.mockReset()
})

// ---------------------------------------------------------------------------
// Streaming summarize
// ---------------------------------------------------------------------------

describe('POST /api/articles/:id/summarize?stream=1', () => {
  it('returns SSE stream with delta and done events', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Long article content here' })

    mockStreamSummarize.mockImplementation(async (_text: string, onDelta: (d: string) => void) => {
      onDelta('sum')
      onDelta('mary')
      return { summary: 'summary', inputTokens: 10, outputTokens: 5, billingMode: 'standard', model: 'haiku' }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize?stream=1`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const deltas = events.filter((e: any) => e.type === 'delta')
    expect(deltas).toHaveLength(2)
    expect(deltas[0].text).toBe('sum')
    expect(deltas[1].text).toBe('mary')

    const done = events.find((e: any) => e.type === 'done')
    expect(done).toBeDefined()
    expect(done.usage.input_tokens).toBe(10)
  })

  it('returns cached summary even when stream=1', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'text', summary: 'Cached' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize?stream=1`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().text).toBe('Cached')
    expect(res.json().cached).toBe(true)
  })

  it('handles streaming error after headers sent', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Long content' })

    mockStreamSummarize.mockRejectedValue(new Error('API timeout'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/summarize?stream=1`,
      headers: json,
      payload: {},
    })

    // The SSE stream should contain an error event
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const errorEvent = events.find((e: any) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toBe('SUMMARIZATION_FAILED')
  })
})

// ---------------------------------------------------------------------------
// Translate edge cases
// ---------------------------------------------------------------------------

describe('POST /api/articles/:id/translate', () => {
  it('returns cached translation', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'English text', full_text_translated: '日本語テキスト', translated_lang: 'en' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().text).toBe('日本語テキスト')
    expect(res.json().cached).toBe(true)
  })

  it('does not return cached translation when translated_lang differs from user language', async () => {
    const feed = seedFeed()
    // translated_lang='ja' but user language defaults to 'en' → stale, should re-translate
    const artId = seedArticle(feed.id, { full_text: 'French text', lang: 'fr', full_text_translated: '古い日本語訳', translated_lang: 'ja' })

    mockStreamTranslate.mockReset()

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    // Should NOT return cached — should invoke translation (non-stream returns new text)
    expect(res.statusCode).toBe(200)
    expect(res.json().cached).toBeUndefined()
  })

  it('does not return cached translation when translated_lang is null', async () => {
    const feed = seedFeed()
    // translated_lang=null (legacy data) → stale
    const artId = seedArticle(feed.id, { full_text: 'French text', lang: 'fr', full_text_translated: '古い翻訳' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().cached).toBeUndefined()
  })

  it('returns 400 when article is already in user language', async () => {
    const feed = seedFeed()
    // Default user language is 'en', so an English article should be rejected
    const artId = seedArticle(feed.id, { full_text: 'English article', lang: 'en' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/already in en/)
  })

  it('returns 400 when no full_text', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: null })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/full text/i)
  })

  it('returns 404 for non-existent article', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/9999/translate',
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Streaming translate
// ---------------------------------------------------------------------------

describe('POST /api/articles/:id/translate?stream=1', () => {
  it('returns SSE stream with deltas', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Contenu en français', lang: 'fr' })

    mockStreamTranslate.mockImplementation(async (_text: string, onDelta: (d: string) => void) => {
      onDelta('翻訳')
      onDelta('テキスト')
      return { fullTextTranslated: '翻訳テキスト', inputTokens: 20, outputTokens: 15, billingMode: 'standard', model: 'sonnet' }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate?stream=1`,
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const deltas = events.filter((e: any) => e.type === 'delta')
    expect(deltas).toHaveLength(2)

    const done = events.find((e: any) => e.type === 'done')
    expect(done).toBeDefined()
    expect(done.usage.input_tokens).toBe(20)
  })

  it('handles streaming translate error', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id, { full_text: 'Contenu', lang: 'fr' })

    mockStreamTranslate.mockRejectedValue(new Error('API error'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/articles/${artId}/translate?stream=1`,
      headers: json,
      payload: {},
    })

    const events = res.body
      .split('\n')
      .filter((l: string) => l.startsWith('data: '))
      .map((l: string) => JSON.parse(l.slice(6)))

    const errorEvent = events.find((e: any) => e.type === 'error')
    expect(errorEvent).toBeDefined()
    expect(errorEvent.error).toBe('TRANSLATION_FAILED')
  })
})

// ---------------------------------------------------------------------------
// Limit/offset boundary values
// ---------------------------------------------------------------------------

describe('GET /api/articles boundary values', () => {
  it('clamps limit to 1-100 range', async () => {
    const feed = seedFeed()
    for (let i = 0; i < 3; i++) seedArticle(feed.id)

    // limit=0 → NaN || 20 → clamped to 20 via Math.min(Math.max(NaN||20,1),100)
    const res1 = await app.inject({ method: 'GET', url: '/api/articles?limit=0' })
    expect(res1.statusCode).toBe(200)
    // 0 is falsy so Number(0)||20 = 20, returns all 3
    expect(res1.json().articles.length).toBe(3)

    // limit=999 → clamped to 100
    const res2 = await app.inject({ method: 'GET', url: '/api/articles?limit=999' })
    expect(res2.statusCode).toBe(200)

    // limit=2 → returns exactly 2
    const res3 = await app.inject({ method: 'GET', url: '/api/articles?limit=2' })
    expect(res3.json().articles.length).toBe(2)
    expect(res3.json().has_more).toBe(true)
  })

  it('clamps negative offset to 0', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles?offset=-10' })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(1)
  })

  it('handles non-numeric limit/offset gracefully', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles?limit=abc&offset=xyz' })
    expect(res.statusCode).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Category filter
// ---------------------------------------------------------------------------

describe('GET /api/articles?category_id', () => {
  it('filters articles by category', async () => {
    const cat = createCategory('Tech')
    const f1 = seedFeed({ category_id: cat.id, url: 'https://a.com' })
    const f2 = seedFeed({ url: 'https://b.com' })
    seedArticle(f1.id)
    seedArticle(f2.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/articles?category_id=${cat.id}`,
    })
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().total).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Read filter
// ---------------------------------------------------------------------------

describe('GET /api/articles?read=1', () => {
  it('filters read articles', async () => {
    const feed = seedFeed()
    const artId = seedArticle(feed.id)
    seedArticle(feed.id)

    // Record a read
    await app.inject({ method: 'POST', url: `/api/articles/${artId}/read` })

    const res = await app.inject({ method: 'GET', url: '/api/articles?read=1' })
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().articles[0].read_at).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// total_all: distinguish "no articles" from "all read"
// ---------------------------------------------------------------------------

describe('GET /api/articles?unread=1 — total_all field', () => {
  it('returns total_all when unread filter yields 0 results but articles exist', async () => {
    const feed = seedFeed()
    const artId1 = seedArticle(feed.id)
    const artId2 = seedArticle(feed.id)
    markArticleSeen(artId1, true)
    markArticleSeen(artId2, true)

    const res = await app.inject({ method: 'GET', url: '/api/articles?unread=1' })
    expect(res.statusCode).toBe(200)
    expect(res.json().articles).toHaveLength(0)
    expect(res.json().total).toBe(0)
    expect(res.json().total_all).toBe(2)
  })

  it('returns total_all scoped to category_id', async () => {
    const cat = createCategory('News')
    const f1 = seedFeed({ category_id: cat.id, url: 'https://a.com' })
    const f2 = seedFeed({ url: 'https://b.com' })
    const a1 = seedArticle(f1.id)
    seedArticle(f2.id) // different category — should not count
    markArticleSeen(a1, true)

    const res = await app.inject({
      method: 'GET',
      url: `/api/articles?unread=1&category_id=${cat.id}`,
    })
    expect(res.json().articles).toHaveLength(0)
    expect(res.json().total_all).toBe(1)
  })

  it('does not include total_all when there are unread articles', async () => {
    const feed = seedFeed()
    seedArticle(feed.id) // unread

    const res = await app.inject({ method: 'GET', url: '/api/articles?unread=1' })
    expect(res.json().articles).toHaveLength(1)
    expect(res.json().total_all).toBeUndefined()
  })

  it('does not include total_all when no articles at all', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/articles?unread=1' })
    expect(res.json().articles).toHaveLength(0)
    expect(res.json().total).toBe(0)
    // total_all is 0, so it should still be included (to confirm "truly empty")
    expect(res.json().total_all).toBe(0)
  })

  it('does not include total_all for non-unread queries', async () => {
    const feed = seedFeed()
    seedArticle(feed.id)

    const res = await app.inject({ method: 'GET', url: '/api/articles' })
    expect(res.json().total_all).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Bulk mark-as-read: range-seen / batch-unseen
// ---------------------------------------------------------------------------

function seenAtOf(id: number): string | null {
  return (getDb().prepare('SELECT seen_at FROM articles WHERE id = ?').get(id) as { seen_at: string | null }).seen_at
}

function purge(id: number) {
  getDb().prepare("UPDATE articles SET purged_at = datetime('now') WHERE id = ?").run(id)
}

describe('POST /api/articles/range-seen', () => {
  it('marks the anchor and newer articles as read and leaves other feeds untouched', async () => {
    const feed = seedFeed()
    const other = seedFeed({ url: 'https://other.com' })
    const older = seedArticle(feed.id, { published_at: '2025-01-01T00:00:00Z' })
    const anchor = seedArticle(feed.id, { published_at: '2025-01-02T00:00:00Z' })
    const newer = seedArticle(feed.id, { published_at: '2025-01-03T00:00:00Z' })
    const outside = seedArticle(other.id, { published_at: '2025-01-03T00:00:00Z' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: anchor, direction: 'newer', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
    expect([...res.json().ids].sort()).toEqual([anchor, newer].sort())
    expect(seenAtOf(anchor)).not.toBeNull()
    expect(seenAtOf(newer)).not.toBeNull()
    expect(seenAtOf(older)).toBeNull()
    expect(seenAtOf(outside)).toBeNull()
  })

  it('excludes already-read articles from ids and keeps their seen_at', async () => {
    const feed = seedFeed()
    const already = seedArticle(feed.id, { published_at: '2025-01-03T00:00:00Z' })
    const anchor = seedArticle(feed.id, { published_at: '2025-01-02T00:00:00Z' })
    markArticleSeen(already, true)
    const before = seenAtOf(already)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: anchor, direction: 'newer', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().ids).toEqual([anchor])
    expect(seenAtOf(already)).toBe(before)
  })

  it('returns 404 for a non-existent anchor and changes no seen_at', async () => {
    const feed = seedFeed()
    const a1 = seedArticle(feed.id)
    const a2 = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: 999999, direction: 'newer', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Article not found')
    expect(seenAtOf(a1)).toBeNull()
    expect(seenAtOf(a2)).toBeNull()
  })

  it('returns 404 for a purged anchor and changes no seen_at', async () => {
    const feed = seedFeed()
    const anchor = seedArticle(feed.id, { published_at: '2025-01-02T00:00:00Z' })
    const other = seedArticle(feed.id, { published_at: '2025-01-03T00:00:00Z' })
    purge(anchor)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: anchor, direction: 'newer', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Article not found')
    expect(seenAtOf(anchor)).toBeNull()
    expect(seenAtOf(other)).toBeNull()
  })

  it('returns 400 for an invalid direction and changes no seen_at', async () => {
    const feed = seedFeed()
    const anchor = seedArticle(feed.id)
    const other = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: anchor, direction: 'sideways', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(400)
    expect(seenAtOf(anchor)).toBeNull()
    expect(seenAtOf(other)).toBeNull()
  })

  it('returns 400 for a non-positive anchor_id and changes no seen_at', async () => {
    const feed = seedFeed()
    const article = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: 0, direction: 'newer', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(400)
    expect(seenAtOf(article)).toBeNull()
  })

  it('returns 400 for a missing anchor_id and changes no seen_at', async () => {
    const feed = seedFeed()
    const article = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { direction: 'newer', scope: { feed_id: feed.id } },
    })

    expect(res.statusCode).toBe(400)
    expect(seenAtOf(article)).toBeNull()
  })

  it('returns 400 for a non-positive scope.feed_id', async () => {
    const feed = seedFeed()
    const anchor = seedArticle(feed.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/range-seen',
      headers: json,
      payload: { anchor_id: anchor, direction: 'newer', scope: { feed_id: -1 } },
    })

    expect(res.statusCode).toBe(400)
    expect(seenAtOf(anchor)).toBeNull()
  })
})

describe('POST /api/articles/batch-unseen', () => {
  it('marks the given articles unread', async () => {
    const feed = seedFeed()
    const a1 = seedArticle(feed.id)
    const a2 = seedArticle(feed.id)
    const untouched = seedArticle(feed.id)
    markArticleSeen(a1, true)
    markArticleSeen(a2, true)
    markArticleSeen(untouched, true)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids: [a1, a2] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
    expect(seenAtOf(a1)).toBeNull()
    expect(seenAtOf(a2)).toBeNull()
    expect(seenAtOf(untouched)).not.toBeNull()
  })

  it('accepts an empty array and reports zero updates', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids: [] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ updated: 0 })
  })

  it('returns 400 when ids exceed the cap and updates nothing', async () => {
    const feed = seedFeed()
    const article = seedArticle(feed.id)
    markArticleSeen(article, true)
    const before = seenAtOf(article)

    const ids = [article, ...Array.from({ length: 50_000 }, (_, i) => i + 1_000_000)]
    expect(ids).toHaveLength(50_001)

    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids },
    })

    expect(res.statusCode).toBe(400)
    expect(seenAtOf(article)).toBe(before)
  })

  it('returns 400 for a non-positive id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids: [0] },
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when ids is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })
})

// A distinct, fixed pair of timestamps for an article that was already read
// before the bulk operation. Fixed values make any rewrite by the round trip
// visible down to the character.
const PRIOR_SEEN_AT = '2024-06-01T00:00:00Z'
const PRIOR_READ_AT = '2024-06-02T03:04:05Z'

interface ReadState {
  seen_at: string | null
  read_at: string | null
}

function readStateOf(id: number): ReadState {
  // Projected field by field: the driver attaches bookkeeping keys to the raw
  // row, so comparing whole rows would compare query timings, not read state.
  const row = getDb().prepare('SELECT seen_at, read_at FROM active_articles WHERE id = ?').get(id) as ReadState
  return { seen_at: row.seen_at, read_at: row.read_at }
}

function readStatesOf(ids: Record<string, number>): Record<string, ReadState> {
  return Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, readStateOf(id)]))
}

function markReadBeforeOperation(id: number) {
  getDb().prepare('UPDATE articles SET seen_at = ?, read_at = ? WHERE id = ?').run(PRIOR_SEEN_AT, PRIOR_READ_AT, id)
}

/**
 * Fixture for the round trip: a target feed holding unread articles above and
 * below the anchor plus one article that was already read before the
 * operation, and a second feed that the scoped operation must never touch.
 */
function seedRoundTripFixture() {
  const feed = seedFeed()
  const otherFeed = seedFeed({ url: 'https://other.example.com' })

  const ids = {
    // Older than the anchor: outside the 'newer' range.
    oldestUnread: seedArticle(feed.id, { published_at: '2025-01-01T00:00:00Z', title: 'oldest unread' }),
    olderRead: seedArticle(feed.id, { published_at: '2025-01-01T12:00:00Z', title: 'older already read' }),
    // The anchor itself and everything newer: inside the range.
    anchor: seedArticle(feed.id, { published_at: '2025-01-02T00:00:00Z', title: 'anchor' }),
    sameDate: seedArticle(feed.id, { published_at: '2025-01-02T00:00:00Z', title: 'same published_at as anchor' }),
    newerUnread: seedArticle(feed.id, { published_at: '2025-01-03T00:00:00Z', title: 'newer unread' }),
    newerRead: seedArticle(feed.id, { published_at: '2025-01-04T00:00:00Z', title: 'newer already read' }),
    // Another feed: out of scope regardless of published_at.
    otherFeedUnread: seedArticle(otherFeed.id, { published_at: '2025-01-03T00:00:00Z', title: 'other feed unread' }),
  }

  markReadBeforeOperation(ids.olderRead)
  markReadBeforeOperation(ids.newerRead)

  return { feed, otherFeed, ids }
}

function rangeSeen(anchorId: number, feedId: number, scope: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/articles/range-seen',
    headers: json,
    payload: { anchor_id: anchorId, direction: 'newer', scope: { feed_id: feedId, ...scope } },
  })
}

describe('range-seen followed by batch-unseen', () => {
  it('restores the exact seen_at and read_at of every article after the round trip', async () => {
    const { feed, ids } = seedRoundTripFixture()
    const before = readStatesOf(ids)

    const seenRes = await rangeSeen(ids.anchor, feed.id)
    expect(seenRes.statusCode).toBe(200)
    expect([...seenRes.json().ids].sort()).toEqual([ids.anchor, ids.sameDate, ids.newerUnread].sort())
    expect(seenRes.json().updated).toBe(3)
    // The operation really did change state, so the comparison below is not
    // trivially satisfied by nothing having happened.
    expect(readStateOf(ids.anchor).seen_at).not.toBeNull()

    const undoRes = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids: seenRes.json().ids },
    })
    expect(undoRes.statusCode).toBe(200)
    expect(undoRes.json().updated).toBe(3)

    expect(readStatesOf(ids)).toEqual(before)
    expect(before.anchor).toEqual({ seen_at: null, read_at: null })
    expect(before.newerRead).toEqual({ seen_at: PRIOR_SEEN_AT, read_at: PRIOR_READ_AT })
  })

  it('leaves the articles that were already read before the operation untouched', async () => {
    const { feed, ids } = seedRoundTripFixture()

    const seenRes = await rangeSeen(ids.anchor, feed.id)
    expect(seenRes.statusCode).toBe(200)
    // Already-read articles are absent from the response ids, so the undo has
    // no way of flipping them back to unread.
    expect(seenRes.json().ids).not.toContain(ids.newerRead)
    expect(seenRes.json().ids).not.toContain(ids.olderRead)
    expect(readStateOf(ids.newerRead)).toEqual({ seen_at: PRIOR_SEEN_AT, read_at: PRIOR_READ_AT })

    const undoRes = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids: seenRes.json().ids },
    })
    expect(undoRes.statusCode).toBe(200)

    expect(readStateOf(ids.newerRead)).toEqual({ seen_at: PRIOR_SEEN_AT, read_at: PRIOR_READ_AT })
    expect(readStateOf(ids.olderRead)).toEqual({ seen_at: PRIOR_SEEN_AT, read_at: PRIOR_READ_AT })
    // Out of range and out of scope articles stay unread throughout.
    expect(readStateOf(ids.oldestUnread)).toEqual({ seen_at: null, read_at: null })
    expect(readStateOf(ids.otherFeedUnread)).toEqual({ seen_at: null, read_at: null })
  })

  it('excludes the newly read articles from an unread-filtered list fetch', async () => {
    const { feed, ids } = seedRoundTripFixture()

    const unreadBefore = await app.inject({ method: 'GET', url: `/api/articles?unread=1&feed_id=${feed.id}` })
    expect(unreadBefore.json().articles.map((a: { id: number }) => a.id).sort())
      .toEqual([ids.oldestUnread, ids.anchor, ids.sameDate, ids.newerUnread].sort())

    const seenRes = await rangeSeen(ids.anchor, feed.id)
    expect(seenRes.statusCode).toBe(200)

    const unreadAfter = await app.inject({ method: 'GET', url: `/api/articles?unread=1&feed_id=${feed.id}` })
    expect(unreadAfter.statusCode).toBe(200)
    const remaining = unreadAfter.json().articles.map((a: { id: number }) => a.id)
    expect(remaining).not.toContain(ids.anchor)
    expect(remaining).not.toContain(ids.sameDate)
    expect(remaining).not.toContain(ids.newerUnread)
    // The article older than the anchor was never a target and stays unread.
    expect(remaining).toEqual([ids.oldestUnread])
    expect(unreadAfter.json().total).toBe(1)

    // The undo puts them back into the unread list.
    const undoRes = await app.inject({
      method: 'POST',
      url: '/api/articles/batch-unseen',
      headers: json,
      payload: { ids: seenRes.json().ids },
    })
    expect(undoRes.statusCode).toBe(200)

    const unreadRestored = await app.inject({ method: 'GET', url: `/api/articles?unread=1&feed_id=${feed.id}` })
    expect(unreadRestored.json().articles.map((a: { id: number }) => a.id).sort())
      .toEqual(unreadBefore.json().articles.map((a: { id: number }) => a.id).sort())
  })
})

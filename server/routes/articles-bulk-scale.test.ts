import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { buildApp } from '../__tests__/helpers/buildApp.js'
import { createFeed, insertArticle, getDb } from '../db.js'
import type { FastifyInstance } from 'fastify'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../fetcher.js', async () => {
  const { EventEmitter } = await import('events')
  return {
    fetchAllFeeds: vi.fn(),
    fetchSingleFeed: vi.fn(),
    discoverRssUrl: vi.fn().mockResolvedValue({ rssUrl: null, title: null }),
    summarizeArticle: vi.fn(),
    streamSummarizeArticle: vi.fn(),
    translateArticle: vi.fn(),
    streamTranslateArticle: vi.fn(),
    fetchProgress: new EventEmitter(),
    getFeedState: vi.fn(),
  }
})

vi.mock('../anthropic.js', () => ({
  anthropic: { messages: { stream: vi.fn(), create: vi.fn() } },
}))

// The undo path syncs one search document per article. At this scale that
// would be tens of thousands of HTTP attempts against a Meilisearch that is
// not running in tests: pure noise that contributes nothing to the parameter
// limit proof. Only the two per-article sync entry points are stubbed; every
// other export, and all of the DB behaviour under test, stays real.
vi.mock('../search/sync.js', async (importOriginal) => ({
  ...(await importOriginal() as object),
  syncArticleFiltersToSearch: vi.fn(),
  syncArticleScoreToSearch: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Bind parameter ceiling of the libsql driver, measured empirically: a
 * statement with 32766 parameters is accepted and 32767 raises "too many SQL
 * variables". The first test in this file re-measures it so the fixture size
 * below can never silently drop under the real limit.
 */
const BIND_PARAM_CEILING = 32766

/**
 * Number of articles the bulk mark-as-read must cover: the anchor plus the
 * generated rows. It has to exceed BIND_PARAM_CEILING, otherwise every
 * statement fits in a single round and the internal chunk loops are never
 * exercised. It also has to stay under the 50000 cap of batch-unseen so the
 * undo of the very same id set is still accepted by the route.
 */
const GENERATED_COUNT = 33000
const TARGET_COUNT = GENERATED_COUNT + 1

const json = { 'content-type': 'application/json' }

let app: FastifyInstance

beforeEach(async () => {
  setupTestDb()
  app = await buildApp()
})

function unreadCount(feedId: number): number {
  return (getDb().prepare(
    'SELECT COUNT(*) AS cnt FROM active_articles WHERE feed_id = ? AND seen_at IS NULL',
  ).get(feedId) as { cnt: number }).cnt
}

function touchedCount(feedId: number): number {
  return (getDb().prepare(
    'SELECT COUNT(*) AS cnt FROM active_articles WHERE feed_id = ? AND (seen_at IS NOT NULL OR read_at IS NOT NULL)',
  ).get(feedId) as { cnt: number }).cnt
}

function unreadIds(feedId: number): number[] {
  return (getDb().prepare(
    'SELECT id FROM active_articles WHERE feed_id = ? AND seen_at IS NULL ORDER BY id',
  ).all(feedId) as { id: number }[]).map(r => r.id)
}

/**
 * A single feed holding TARGET_COUNT unread articles: one anchor and
 * GENERATED_COUNT newer ones, so the 'newer' direction covers all of them.
 *
 * The rows are produced by one recursive-CTE INSERT rather than a loop of
 * per-row inserts. Generating them from JavaScript is what makes a fixture of
 * this size collapse the vitest worker; letting SQLite materialise the series
 * costs a few hundred milliseconds and no JS-side allocation.
 */
function seedLargeFeed() {
  const feed = createFeed({ name: 'Bulk Feed', url: 'https://bulk.example.com' })
  const anchor = insertArticle({
    feed_id: feed.id,
    title: 'anchor',
    url: 'https://bulk.example.com/anchor',
    published_at: '2025-01-01T00:00:00Z',
  })
  getDb().prepare(`
    INSERT INTO articles (feed_id, title, url, published_at)
    WITH RECURSIVE seq(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?
    )
    SELECT ?, 'bulk ' || n, 'https://bulk.example.com/bulk/' || n, ? FROM seq
  `).run(GENERATED_COUNT, feed.id, '2025-02-01T00:00:00Z')

  expect(unreadCount(feed.id)).toBe(TARGET_COUNT)
  return { feed, anchor }
}

function rangeSeen(anchorId: number, feedId: number) {
  return app.inject({
    method: 'POST',
    url: '/api/articles/range-seen',
    headers: json,
    payload: { anchor_id: anchorId, direction: 'newer', scope: { feed_id: feedId } },
  })
}

function batchUnseen(ids: number[]) {
  return app.inject({
    method: 'POST',
    url: '/api/articles/batch-unseen',
    headers: json,
    payload: { ids },
  })
}

// ---------------------------------------------------------------------------
// Bulk mark-as-read at a scale that exceeds the bind parameter ceiling
// ---------------------------------------------------------------------------

describe('bulk mark-as-read beyond the bind parameter ceiling', () => {
  it('confirms one parameter per target would overflow a single statement', () => {
    const db = getDb()
    const statement = (n: number) =>
      `SELECT 1 WHERE 1 IN (${Array.from({ length: n }, () => '?').join(',')})`
    const args = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

    // The documented ceiling still holds in this environment...
    expect(() => db.prepare(statement(BIND_PARAM_CEILING)).get(...args(BIND_PARAM_CEILING))).not.toThrow()
    expect(() => db.prepare(statement(BIND_PARAM_CEILING + 1)).get(...args(BIND_PARAM_CEILING + 1)))
      .toThrow(/too many SQL variables/i)

    // ...and the fixture below is large enough that an unchunked statement
    // would hit it. Without this the scale tests could pass while proving
    // nothing.
    expect(TARGET_COUNT).toBeGreaterThan(BIND_PARAM_CEILING)
  })

  it('marks every article of the range as read in one request', async () => {
    const { feed, anchor } = seedLargeFeed()
    const expectedIds = unreadIds(feed.id)
    expect(expectedIds).toHaveLength(TARGET_COUNT)

    const res = await rangeSeen(anchor, feed.id)

    expect(res.statusCode).toBe(200)
    const body = res.json() as { updated: number; ids: number[] }
    expect(body.updated).toBe(TARGET_COUNT)
    expect(body.ids).toHaveLength(TARGET_COUNT)

    // The response carries the whole target set, with no duplicates padding
    // the count and nothing missing.
    const returned = new Set(body.ids)
    expect(returned.size).toBe(TARGET_COUNT)
    expect(expectedIds.filter(id => !returned.has(id))).toEqual([])

    // One operation, no leftovers: not a single article of the range stays
    // unread, so no partially applied state remains.
    expect(unreadCount(feed.id)).toBe(0)
  })

  it('restores every article of the range to unread in one undo request', async () => {
    const { feed, anchor } = seedLargeFeed()

    const seenRes = await rangeSeen(anchor, feed.id)
    expect(seenRes.statusCode).toBe(200)
    const ids = (seenRes.json() as { ids: number[] }).ids
    expect(ids).toHaveLength(TARGET_COUNT)
    expect(touchedCount(feed.id)).toBe(TARGET_COUNT)

    const undoRes = await batchUnseen(ids)

    expect(undoRes.statusCode).toBe(200)
    expect((undoRes.json() as { updated: number }).updated).toBe(TARGET_COUNT)
    // Every article is unread again: neither seen_at nor read_at survives on
    // any row of the range, so the undo left no partial state either.
    expect(touchedCount(feed.id)).toBe(0)
    expect(unreadCount(feed.id)).toBe(TARGET_COUNT)
  }, 120_000)
})

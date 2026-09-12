import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Fixed dataset replacing the demo seed, identical to the one in
 * demo-store.test.ts so the routed results can be pinned exactly:
 *
 *   a1 feed1 2024-01-05 unread
 *   a2 feed1 2024-01-04 unread   <- anchor with a published date
 *   a3 feed2 2024-01-04 unread   <- same published date as a2
 *   a4 feed1 2024-01-03 SEEN     <- already read before the operation
 *   a5 feed3 2024-01-02 unread   <- different category
 *   a6 feed1 (no date)  unread
 *   a7 feed2 (no date)  unread
 */
const seed = vi.hoisted(() => {
  const A4_SEEN_AT = '2024-02-01T00:00:00.000Z'

  const mkFeed = (id: number, categoryId: number | null, categoryName: string | null) => ({
    id,
    name: `Feed ${id}`,
    url: `https://example.com/feed-${id}`,
    rss_url: `https://example.com/feed-${id}/rss`,
    rss_bridge_url: null,
    category_id: categoryId,
    category_name: categoryName,
    lang: 'en',
    type: 'rss',
    disabled: 0,
    error_count: 0,
    last_error: null,
    requires_js_challenge: 0,
    etag: null,
    last_modified: null,
    last_content_hash: null,
    next_check_at: null,
    check_interval: null,
    created_at: '2024-01-01T00:00:00.000Z',
  })

  const mkArticle = (
    id: number,
    feedId: number,
    publishedAt: string | null,
    seenAt: string | null = null,
  ) => ({
    id,
    feed_id: feedId,
    title: `Article ${id}`,
    url: `https://example.com/article-${id}`,
    full_text: null,
    full_text_translated: null,
    summary: null,
    summary_ja: null,
    excerpt: null,
    lang: 'en',
    og_image: null,
    published_at: publishedAt,
    seen_at: seenAt,
    read_at: null,
    bookmarked_at: null,
    liked_at: null,
    fetched_at: '2024-01-01T00:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
  })

  return {
    A4_SEEN_AT,
    feeds: [mkFeed(1, 10, 'Tech'), mkFeed(2, 10, 'Tech'), mkFeed(3, 20, 'News')],
    articles: [
      mkArticle(1, 1, '2024-01-05T00:00:00.000Z'),
      mkArticle(2, 1, '2024-01-04T00:00:00.000Z'),
      mkArticle(3, 2, '2024-01-04T00:00:00.000Z'),
      mkArticle(4, 1, '2024-01-03T00:00:00.000Z', A4_SEEN_AT),
      mkArticle(5, 3, '2024-01-02T00:00:00.000Z'),
      mkArticle(6, 1, null),
      mkArticle(7, 2, null),
    ],
  }
})

vi.mock('./seed/feeds.json', () => ({ default: seed.feeds }))
vi.mock('./seed/articles.json', () => ({ default: seed.articles }))

const ANCHOR_WITH_DATE = 2
const MISSING_ANCHOR = 9999

type MockApi = typeof import('./mock-api')
type DemoStore = typeof import('./demo-store')['demoStore']
type ApiErrorClass = typeof import('../api-base')['ApiError']

let api: MockApi
let store: DemoStore
let ApiError: ApiErrorClass

beforeEach(async () => {
  // Fresh module instance per test: both the demo store and the mock API keep
  // module-level state, and every case here mutates seen_at.
  vi.resetModules()
  api = await import('./mock-api')
  store = (await import('./demo-store')).demoStore
  ApiError = (await import('../api-base')).ApiError
})

function seenIds(): number[] {
  return store.getArticles({ limit: 100 }).articles
    .filter(a => a.seen_at != null)
    .map(a => a.id)
    .sort((x, y) => x - y)
}

function sorted(ids: number[]): number[] {
  return [...ids].sort((x, y) => x - y)
}

describe('POST /api/articles/range-seen', () => {
  it('returns the production RangeSeenResponse shape', async () => {
    const res = await api.demoApiPost('/api/articles/range-seen', {
      anchor_id: ANCHOR_WITH_DATE,
      direction: 'newer',
      scope: {},
    }) as { updated: number; ids: number[] }

    expect(Object.keys(res).sort()).toEqual(['ids', 'updated'])
    expect(sorted(res.ids)).toEqual([1, 2, 3])
    expect(res.updated).toBe(res.ids.length)
    expect(seenIds()).toEqual([1, 2, 3, 4])
  })

  it('reaches the demo store with the parsed anchor, direction and scope', async () => {
    const spy = vi.spyOn(store, 'markSeenByRange')

    const res = await api.demoApiPost('/api/articles/range-seen', {
      anchor_id: ANCHOR_WITH_DATE,
      direction: 'older',
      scope: { feed_id: 1, unread: true },
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(ANCHOR_WITH_DATE, 'older', { feed_id: 1, unread: true })
    expect(res).toBe(spy.mock.results[0].value)
  })

  it('does not fall through to the unknown-path fallback', async () => {
    const fallback = await api.demoApiPost('/api/articles/not-a-real-path', {
      anchor_id: ANCHOR_WITH_DATE,
      direction: 'newer',
      scope: {},
    })
    expect(fallback).toEqual({})

    const res = await api.demoApiPost('/api/articles/range-seen', {
      anchor_id: ANCHOR_WITH_DATE,
      direction: 'newer',
      scope: {},
    })
    expect(res).not.toEqual({})
  })

  it('defaults a missing scope to an empty filter', async () => {
    const res = await api.demoApiPost('/api/articles/range-seen', {
      anchor_id: ANCHOR_WITH_DATE,
      direction: 'newer',
    }) as { updated: number; ids: number[] }

    expect(sorted(res.ids)).toEqual([1, 2, 3])
  })

  it('throws a 404 ApiError and changes no seen state when the anchor is gone', async () => {
    const before = seenIds()

    await expect(api.demoApiPost('/api/articles/range-seen', {
      anchor_id: MISSING_ANCHOR,
      direction: 'newer',
      scope: {},
    })).rejects.toMatchObject({
      status: 404,
      message: 'Article not found',
      data: { error: 'Article not found' },
    })

    await expect(api.demoApiPost('/api/articles/range-seen', {
      anchor_id: MISSING_ANCHOR,
      direction: 'newer',
      scope: {},
    })).rejects.toBeInstanceOf(ApiError)

    expect(seenIds()).toEqual(before)
  })
})

describe('POST /api/articles/batch-unseen', () => {
  it('returns the production BatchUnseenResponse shape and restores the ids to unread', async () => {
    const marked = await api.demoApiPost('/api/articles/range-seen', {
      anchor_id: ANCHOR_WITH_DATE,
      direction: 'newer',
      scope: {},
    }) as { updated: number; ids: number[] }

    const res = await api.demoApiPost('/api/articles/batch-unseen', { ids: marked.ids }) as { updated: number }

    expect(Object.keys(res)).toEqual(['updated'])
    expect(res.updated).toBe(marked.ids.length)
    // a4 was already read before the operation, so it stays read.
    expect(seenIds()).toEqual([4])
  })

  it('reaches the demo store with the requested ids', async () => {
    const spy = vi.spyOn(store, 'batchUnseen')

    const res = await api.demoApiPost('/api/articles/batch-unseen', { ids: [1, 2] })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith([1, 2])
    expect(res).toBe(spy.mock.results[0].value)
  })

  it('does not fall through to the unknown-path fallback', async () => {
    const fallback = await api.demoApiPost('/api/articles/batch-unseen-nope', { ids: [1] })
    expect(fallback).toEqual({})

    const res = await api.demoApiPost('/api/articles/batch-unseen', { ids: [1] })
    expect(res).toEqual({ updated: 1 })
  })

  it('treats an empty id list as nothing to undo', async () => {
    const res = await api.demoApiPost('/api/articles/batch-unseen', { ids: [] })
    expect(res).toEqual({ updated: 0 })
  })
})

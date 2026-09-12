import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ArticleListItem } from '../../../shared/types'

/**
 * Fixed dataset replacing the demo seed so the direction predicate table from
 * design.md can be pinned exactly:
 *
 *   a1 feed1 2024-01-05 unread
 *   a2 feed1 2024-01-04 unread   <- anchor with a published date
 *   a3 feed2 2024-01-04 unread   <- same published date as a2
 *   a4 feed1 2024-01-03 SEEN     <- already read before the operation
 *   a5 feed3 2024-01-02 unread   <- different category
 *   a6 feed1 (no date)  unread   <- anchor without a published date
 *   a7 feed2 (no date)  unread
 *
 * feed1 / feed2 are in category 10, feed3 is in category 20.
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
const ANCHOR_WITHOUT_DATE = 6

type DemoStore = typeof import('./demo-store')['demoStore']

let store: DemoStore

beforeEach(async () => {
  // Fresh module instance per test: the demo store keeps its articles in
  // module-level state and every case here mutates seen_at.
  vi.resetModules()
  store = (await import('./demo-store')).demoStore
})

function allArticles(): ArticleListItem[] {
  return store.getArticles({ limit: 100 }).articles
}

function article(id: number): ArticleListItem {
  const found = allArticles().find(a => a.id === id)
  if (!found) throw new Error(`article ${id} not found`)
  return found
}

function seenIds(): number[] {
  return allArticles().filter(a => a.seen_at != null).map(a => a.id).sort((x, y) => x - y)
}

function sorted(ids: number[]): number[] {
  return [...ids].sort((x, y) => x - y)
}

describe('demoStore.markSeenByRange', () => {
  describe('direction predicate table (design.md 方向判定の規則)', () => {
    it('anchor with published_at + newer targets articles published at or after the anchor', () => {
      const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'newer', {})
      // a1 is newer, a2 is the anchor, a3 shares the anchor's date.
      expect(sorted(result!.ids)).toEqual([1, 2, 3])
      expect(result!.updated).toBe(3)
      expect(seenIds()).toEqual([1, 2, 3, 4])
    })

    it('anchor with published_at + older targets articles published at or before the anchor plus undated ones', () => {
      const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', {})
      // a4 is in range but was already read, so it is not reported.
      expect(sorted(result!.ids)).toEqual([2, 3, 5, 6, 7])
      expect(result!.updated).toBe(5)
      expect(article(1).seen_at).toBeNull()
    })

    it('anchor without published_at + newer targets every article in the scope', () => {
      const result = store.markSeenByRange(ANCHOR_WITHOUT_DATE, 'newer', {})
      expect(sorted(result!.ids)).toEqual([1, 2, 3, 5, 6, 7])
      expect(seenIds()).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('anchor without published_at + older targets only undated articles', () => {
      const result = store.markSeenByRange(ANCHOR_WITHOUT_DATE, 'older', {})
      expect(sorted(result!.ids)).toEqual([6, 7])
      expect(article(5).seen_at).toBeNull()
    })
  })

  it('includes an article sharing the anchor published_at when going newer', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'newer', {})
    expect(result!.ids).toContain(3)
  })

  it('includes an article sharing the anchor published_at when going older', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', {})
    expect(result!.ids).toContain(3)
  })

  it('always includes the anchor itself regardless of direction', () => {
    const newer = store.markSeenByRange(ANCHOR_WITH_DATE, 'newer', {})
    expect(newer!.ids).toContain(ANCHOR_WITH_DATE)

    store.batchUnseen(newer!.ids)
    const older = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', {})
    expect(older!.ids).toContain(ANCHOR_WITH_DATE)
  })

  it('applies the feed filter from the scope', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', { feed_id: 1 })
    // Only feed 1: a2 (anchor) and a6 (undated). a4 was already read.
    expect(sorted(result!.ids)).toEqual([2, 6])
    expect(article(3).seen_at).toBeNull()
    expect(article(7).seen_at).toBeNull()
  })

  it('applies the category filter from the scope', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', { category_id: 10 })
    // Category 10 covers feed 1 and feed 2, so a5 on feed 3 stays unread.
    expect(sorted(result!.ids)).toEqual([2, 3, 6, 7])
    expect(article(5).seen_at).toBeNull()
  })

  it('applies the unread filter from the scope without changing the outcome', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', { unread: true })
    expect(sorted(result!.ids)).toEqual([2, 3, 5, 6, 7])
    expect(article(4).seen_at).toBe(seed.A4_SEEN_AT)
  })

  it('excludes already read articles and leaves their seen_at untouched', () => {
    const before = article(4).seen_at
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', {})
    expect(result!.ids).not.toContain(4)
    expect(article(4).seen_at).toBe(before)
    expect(article(4).seen_at).toBe(seed.A4_SEEN_AT)
  })

  it('reports updated as the length of ids', () => {
    const result = store.markSeenByRange(ANCHOR_WITHOUT_DATE, 'newer', {})
    expect(result!.updated).toBe(result!.ids.length)
  })

  it('returns null and changes nothing when the anchor does not exist', () => {
    const before = seenIds()
    expect(store.markSeenByRange(9999, 'older', {})).toBeNull()
    expect(seenIds()).toEqual(before)
  })
})

describe('demoStore.batchUnseen', () => {
  it('restores only the given ids to unread', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'older', {})
    expect(result!.ids).toContain(3)

    const undone = store.batchUnseen([2])
    expect(undone.updated).toBe(1)
    expect(article(2).seen_at).toBeNull()
    expect(article(3).seen_at).not.toBeNull()
  })

  it('restores the exact pre-operation state when given the ids of a bulk mark-as-read', () => {
    const before = seenIds()
    const result = store.markSeenByRange(ANCHOR_WITHOUT_DATE, 'newer', {})
    expect(seenIds()).not.toEqual(before)

    store.batchUnseen(result!.ids)
    expect(seenIds()).toEqual(before)
    expect(article(4).seen_at).toBe(seed.A4_SEEN_AT)
  })

  it('clears read_at as well as seen_at', () => {
    store.markArticleRead(1)
    expect(article(1).read_at).not.toBeNull()

    store.batchUnseen([1])
    expect(article(1).seen_at).toBeNull()
    expect(article(1).read_at).toBeNull()
  })

  it('returns 0 and changes nothing for an empty id list', () => {
    const before = seenIds()
    expect(store.batchUnseen([])).toEqual({ updated: 0 })
    expect(seenIds()).toEqual(before)
  })

  it('ignores ids that do not resolve to an article', () => {
    const result = store.markSeenByRange(ANCHOR_WITH_DATE, 'newer', {})
    const undone = store.batchUnseen([...result!.ids, 9999])
    expect(undone.updated).toBe(result!.ids.length)
    expect(seenIds()).toEqual([4])
  })
})

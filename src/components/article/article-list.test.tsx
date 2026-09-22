import type { Ref } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import { LocaleContext } from '../../lib/i18n'
import { KeyboardNavigationProvider } from '../../contexts/keyboard-navigation-context'
import type { ArticleListItem, BulkReadScope, FeedWithCounts } from '../../../shared/types'

// --- Mocks ---

// Control useSWRInfinite return value per test
let swrInfiniteReturn: any = {
  data: undefined,
  error: undefined,
  size: 1,
  setSize: vi.fn(),
  isLoading: true,
  isValidating: false,
  mutate: vi.fn(),
}

// Control useSWR return value for /api/feeds
let swrFeedsData: any = undefined

// Captures the getKey function ArticleList passes to useSWRInfinite, so tests
// can invoke it directly to inspect the query string it builds.
let capturedGetKey: ((pageIndex: number, previousPageData: any) => string | null) | undefined

vi.mock('swr/infinite', () => ({
  default: (getKey: any) => {
    capturedGetKey = getKey
    return swrInfiniteReturn
  },
}))

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return {
    ...actual,
    default: (key: string) => {
      if (key === '/api/feeds') return { data: swrFeedsData }
      return { data: undefined }
    },
    useSWRConfig: () => ({ mutate: vi.fn() }),
  }
})

vi.mock('../feed/feed-metrics-bar', () => ({
  FeedMetricsBar: ({ feed }: any) => <div data-testid="metrics-bar">{feed.name}</div>,
}))

vi.mock('../../lib/fetcher', () => ({
  fetcher: vi.fn(),
  apiPatch: vi.fn(() => Promise.resolve()),
  apiPost: vi.fn(() => Promise.resolve({ updated: 0, ids: [] })),
}))

vi.mock('../../lib/markSeenWithQueue', () => ({
  markSeenOnServer: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../lib/readTracker', () => ({
  trackRead: vi.fn(),
  isReadInSession: vi.fn(() => false),
}))

vi.mock('../../hooks/use-is-touch-device', () => ({
  useIsTouchDevice: vi.fn(() => false),
}))

vi.mock('../../hooks/use-clip-feed-id', () => ({
  useClipFeedId: vi.fn(() => null),
}))

vi.mock('../layout/pull-to-refresh', () => ({
  PullToRefresh: () => null,
}))

vi.mock('../../contexts/fetch-progress-context', () => ({
  useFetchProgressContext: () => ({
    progress: new Map(),
    startFeedFetch: vi.fn(() => Promise.resolve({ totalNew: 0 })),
    subscribeFeedFetch: vi.fn(),
  }),
}))


vi.mock('../ui/mascot', () => ({
  Mascot: () => <div data-testid="mascot" />,
}))

vi.mock('./swipeable-article-card', () => ({
  SwipeableArticleCard: ({ article }: { article: ArticleListItem }) => (
    <div data-testid={`swipeable-${article.id}`}>{article.title}</div>
  ),
}))

vi.mock('./article-card', () => ({
  ArticleCard: ({ article }: { article: ArticleListItem }) => (
    <div data-testid={`article-${article.id}`} data-seen={article.seen_at ? '1' : '0'}>
      {article.title}
    </div>
  ),
}))

vi.mock('./article-overlay', () => ({
  ArticleOverlay: () => null,
}))

vi.mock('./article-detail', () => ({
  ArticleDetail: ({ articleUrl }: { articleUrl: string }) => (
    <div data-testid="article-detail-preview">{articleUrl}</div>
  ),
}))

vi.mock('../feed/feed-error-banner', () => ({
  FeedErrorBanner: () => null,
}))

vi.mock('../ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={`animate-pulse ${className ?? ''}`} />,
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

import { ArticleList, type ArticleListHandle } from './article-list'
import { useIsTouchDevice } from '../../hooks/use-is-touch-device'
import { useClipFeedId } from '../../hooks/use-clip-feed-id'
import type { FeedUnreadOnlyState } from '../../hooks/use-feed-unread-only'
import type { CategoryUnreadOnly } from '../../hooks/use-category-unread-only'
import { apiPost } from '../../lib/fetcher'

const MENU_LABEL_ABOVE = 'Mark above (newer) as read'
const MENU_LABEL_BELOW = 'Mark below (older) as read'

function makeArticle(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: 1,
    feed_id: 1,
    feed_name: 'Test Feed',
    title: 'Test Article',
    url: 'https://example.com/1',
    published_at: '2026-01-01T00:00:00Z',
    lang: 'en',
    summary: null,
    excerpt: 'Excerpt text',
    og_image: null,
    seen_at: null,
    read_at: null,
    bookmarked_at: null,
    liked_at: null,
    ...overrides,
  }
}

const mockSettings = {
  colorMode: 'system' as const,
  setColorMode: vi.fn(),
  themeName: 'default',
  setTheme: vi.fn(),
  themes: [{ name: 'default', label: 'Default' }],
  dateMode: 'relative' as const,
  setDateMode: vi.fn(),
  autoMarkRead: 'off' as const,
  setAutoMarkRead: vi.fn(),
  showUnreadIndicator: 'on' as const,
  setShowUnreadIndicator: vi.fn(),
  indicatorStyle: 'dot' as const,
  internalLinks: 'on' as const,
  setInternalLinks: vi.fn(),
  showThumbnails: 'on' as const,
  setShowThumbnails: vi.fn(),
  showFeedActivity: 'on' as const,
  setShowFeedActivity: vi.fn(),
  highlightTheme: 'github-dark' as const,
  setHighlightTheme: vi.fn(),
  articleFont: 'sans' as const,
  setArticleFont: vi.fn(),
  save: vi.fn(),
}

function OutletWrapper() {
  return (
    <KeyboardNavigationProvider>
      <Outlet context={{ settings: mockSettings, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
    </KeyboardNavigationProvider>
  )
}

interface ArticleListTestProps {
  feedUnreadOnly?: FeedUnreadOnlyState
  onFeedUnreadOnlyChange?: (next: FeedUnreadOnlyState) => void
  categoryUnreadOnly?: CategoryUnreadOnly
  onCategoryUnreadOnlyChange?: (next: CategoryUnreadOnly) => void
  articleListRef?: Ref<ArticleListHandle>
}

function renderArticleList(initialPath = '/inbox', props: ArticleListTestProps = {}) {
  const {
    feedUnreadOnly = 'off',
    onFeedUnreadOnlyChange = vi.fn(),
    categoryUnreadOnly = 'off',
    onCategoryUnreadOnlyChange = vi.fn(),
    articleListRef,
  } = props
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <Routes>
          <Route element={<OutletWrapper />}>
            <Route path="feeds/:feedId" element={<ArticleList ref={articleListRef} feedUnreadOnly={feedUnreadOnly} onFeedUnreadOnlyChange={onFeedUnreadOnlyChange} categoryUnreadOnly={categoryUnreadOnly} onCategoryUnreadOnlyChange={onCategoryUnreadOnlyChange} />} />
            <Route path="categories/:categoryId" element={<ArticleList ref={articleListRef} feedUnreadOnly={feedUnreadOnly} onFeedUnreadOnlyChange={onFeedUnreadOnlyChange} categoryUnreadOnly={categoryUnreadOnly} onCategoryUnreadOnlyChange={onCategoryUnreadOnlyChange} />} />
            <Route path="*" element={<ArticleList ref={articleListRef} feedUnreadOnly={feedUnreadOnly} onFeedUnreadOnlyChange={onFeedUnreadOnlyChange} categoryUnreadOnly={categoryUnreadOnly} onCategoryUnreadOnlyChange={onCategoryUnreadOnlyChange} />} />
          </Route>
        </Routes>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

let scrollToSpy: ReturnType<typeof vi.spyOn>

describe('ArticleList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrFeedsData = undefined
    mockSettings.autoMarkRead = 'off' as any
    vi.mocked(useIsTouchDevice).mockReturnValue(false)
    vi.mocked(useClipFeedId).mockReturnValue(null)
    vi.mocked(apiPost).mockResolvedValue({ updated: 0, ids: [] })
    // Stub IntersectionObserver for tests that enable autoMarkRead
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    })
    // jsdom doesn't implement scrollTo; stub it for the toggle's scroll-reset behavior
    scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    // Reset to loading state
    swrInfiniteReturn = {
      data: undefined,
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    }
  })

  it('shows skeleton when loading', () => {
    renderArticleList()
    // Skeleton renders divs with animate-pulse class
    const pulses = document.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)
  })

  it('shows empty state when no articles', () => {
    swrInfiniteReturn = {
      data: [{ articles: [], total: 0, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('No articles')).toBeTruthy()
  })

  it('shows error state with retry button', () => {
    swrInfiniteReturn = {
      data: undefined,
      error: new Error('fetch failed'),
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('Failed to load')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('renders article cards', () => {
    swrInfiniteReturn = {
      data: [{
        articles: [
          makeArticle({ id: 1, title: 'First Article' }),
          makeArticle({ id: 2, title: 'Second Article' }),
        ],
        total: 2,
        has_more: false,
      }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('First Article')).toBeTruthy()
    expect(screen.getByText('Second Article')).toBeTruthy()
  })

  it('shows mascot at end of feed', () => {
    mockSettings.autoMarkRead = 'on' as any
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1 })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByTestId('mascot')).toBeTruthy()
    expect(screen.getByText("You're all caught up!")).toBeTruthy()
  })

  it('does not show mascot when article list is empty', () => {
    swrInfiniteReturn = {
      data: [{ articles: [], total: 0, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.queryByTestId('mascot')).toBeNull()
  })

  it('uses ArticleCard on non-touch devices', () => {
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 10, title: 'Desktop Article' })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByTestId('article-10')).toBeTruthy()
  })

  it('uses SwipeableArticleCard on touch devices', async () => {
    const { useIsTouchDevice } = await import('../../hooks/use-is-touch-device')
    vi.mocked(useIsTouchDevice).mockReturnValue(true)

    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 20, title: 'Mobile Article' })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByTestId('swipeable-20')).toBeTruthy()
  })

  it('does not show mascot when still loading', () => {
    renderArticleList()
    expect(screen.queryByTestId('mascot')).toBeNull()
  })

  it('renders multiple pages of articles', () => {
    swrInfiniteReturn = {
      data: [
        { articles: [makeArticle({ id: 1, title: 'Page 1' })], total: 2, has_more: true },
        { articles: [makeArticle({ id: 2, title: 'Page 2' })], total: 2, has_more: false },
      ],
      error: undefined,
      size: 2,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
  })

  it('renders FeedMetricsBar for current feed', () => {
    swrFeedsData = {
      feeds: [
        { id: 1, name: 'My Feed', type: 'rss', unread_count: 5, total_count: 10 },
      ],
    }
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1, feed_id: 1 })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList('/feeds/1')
    expect(screen.getByTestId('metrics-bar')).toBeTruthy()
    expect(screen.getByText('My Feed')).toBeTruthy()
  })

  it('does not render FeedMetricsBar for clip feed', () => {
    swrFeedsData = {
      feeds: [
        { id: 1, name: 'Clip Feed', type: 'clip', unread_count: 0, total_count: 3 },
      ],
    }
    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1, feed_id: 1 })], total: 1, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList('/feeds/1')
    expect(screen.queryByTestId('metrics-bar')).toBeNull()
  })

  it('retry button resets pagination', () => {
    const mockSetSize = vi.fn()
    swrInfiniteReturn = {
      data: undefined,
      error: new Error('fetch failed'),
      size: 3,
      setSize: mockSetSize,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    screen.getByText('Retry').click()
    expect(mockSetSize).toHaveBeenCalledWith(1)
  })

  it('skeleton respects showThumbnails=off', () => {
    mockSettings.showThumbnails = 'off' as any
    swrInfiniteReturn = {
      data: undefined,
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    // When showThumbnails is off, the 16x16 thumbnail placeholder should not be rendered
    const skeletonThumbnails = document.querySelectorAll('.w-16.h-16')
    expect(skeletonThumbnails.length).toBe(0)
    // Restore default
    mockSettings.showThumbnails = 'on' as any
  })

  it('data-article-unread attribute is set correctly', () => {
    swrInfiniteReturn = {
      data: [{
        articles: [
          makeArticle({ id: 1, title: 'Unread', seen_at: null }),
          makeArticle({ id: 2, title: 'Read', seen_at: '2026-01-01' }),
        ],
        total: 2,
        has_more: false,
      }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList()
    const unreadEl = document.querySelector('[data-article-id="1"]')
    const readEl = document.querySelector('[data-article-id="2"]')
    expect(unreadEl?.getAttribute('data-article-unread')).toBe('1')
    expect(readEl?.getAttribute('data-article-unread')).toBe('0')
  })

  it('validating state shows skeleton in sentinel', () => {
    // Stub IntersectionObserver for this test since sentinel ref callback uses it
    const observeMock = vi.fn()
    const disconnectMock = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = observeMock
      unobserve = vi.fn()
      disconnect = disconnectMock
    })

    swrInfiniteReturn = {
      data: [{ articles: [makeArticle({ id: 1 })], total: 2, has_more: true }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: true,
      mutate: vi.fn(),
    }
    renderArticleList()
    // Sentinel area should contain skeleton loading indicators (animate-pulse)
    const pulses = document.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThan(0)

    vi.unstubAllGlobals()
  })

  // ---------------------------------------------------------------------------
  // Bulk mark-as-read context menu integration
  // ---------------------------------------------------------------------------

  function setArticles(articles: ArticleListItem[], mutate = vi.fn()) {
    swrInfiniteReturn = {
      data: [{ articles, total: articles.length, has_more: false }],
      error: undefined,
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
      isValidating: false,
      mutate,
    }
    return mutate
  }

  async function openCardMenu(testId: string) {
    fireEvent.contextMenu(screen.getByTestId(testId))
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeTruthy()
    })
  }

  async function expectNoMenu(testId: string) {
    fireEvent.contextMenu(screen.getByTestId(testId))
    // Give Radix a real macrotask to open, so the absence is meaningful.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByText(MENU_LABEL_ABOVE)).toBeNull()
    expect(screen.queryByText(MENU_LABEL_BELOW)).toBeNull()
  }

  const menuViews = [
    { name: 'inbox shows the bulk mark-as-read menu', path: '/inbox', setup: () => {} },
    { name: 'feed view shows the bulk mark-as-read menu', path: '/feeds/1', setup: () => {} },
    {
      name: 'clip list shows the bulk mark-as-read menu',
      path: '/clips',
      setup: () => { vi.mocked(useClipFeedId).mockReturnValue(7) },
    },
    { name: 'category view shows the bulk mark-as-read menu', path: '/categories/3', setup: () => {} },
  ]

  it.each(menuViews)('$name', async ({ path, setup }) => {
    setup()
    setArticles([makeArticle({ id: 1, title: 'Anchor' })])
    renderArticleList(path)

    await openCardMenu('article-1')

    expect(screen.getByRole('menuitem', { name: MENU_LABEL_ABOVE })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: MENU_LABEL_BELOW })).toBeTruthy()
  })

  const menulessViews = [
    { name: 'bookmarks view has no bulk mark-as-read menu', path: '/bookmarks' },
    { name: 'favorites view has no bulk mark-as-read menu', path: '/likes' },
    { name: 'read-articles view has no bulk mark-as-read menu', path: '/history' },
  ]

  it.each(menulessViews)('$name', async ({ path }) => {
    setArticles([makeArticle({ id: 1, title: 'Anchor' })])
    renderArticleList(path)

    await expectNoMenu('article-1')
  })

  it('touch devices have no bulk mark-as-read menu', async () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    setArticles([makeArticle({ id: 1, title: 'Anchor' })])
    renderArticleList('/inbox')

    await expectNoMenu('swipeable-1')
  })

  const scopeCases: Array<{ name: string; path: string; props: ArticleListTestProps; scope: BulkReadScope }> = [
    {
      name: 'inbox sends the unread-only filter as the bulk scope',
      path: '/inbox',
      props: {},
      scope: { unread: true },
    },
    {
      name: 'feed view sends the feed id as the bulk scope',
      path: '/feeds/1',
      props: {},
      scope: { feed_id: 1 },
    },
    {
      name: 'clip list sends the resolved clip feed id as the bulk scope',
      path: '/clips',
      props: {},
      scope: { feed_id: 7 },
    },
    {
      name: 'category view sends the category id and its unread-only setting as the bulk scope',
      path: '/categories/3',
      props: { categoryUnreadOnly: 'on' },
      scope: { category_id: 3, unread: true },
    },
  ]

  it.each(scopeCases)('$name', async ({ path, props, scope }) => {
    if (path === '/clips') vi.mocked(useClipFeedId).mockReturnValue(7)
    setArticles([makeArticle({ id: 42, title: 'Anchor' })])
    renderArticleList(path, props)

    await openCardMenu('article-42')
    fireEvent.click(screen.getByRole('menuitem', { name: MENU_LABEL_ABOVE }))

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/articles/range-seen', {
        anchor_id: 42,
        direction: 'newer',
        scope,
      })
    })
  })

  it('keeps bulk-marked articles in place with the read look while unread-only is active', async () => {
    vi.mocked(apiPost).mockResolvedValue({ updated: 2, ids: [1, 2] })
    const listMutate = setArticles([
      makeArticle({ id: 1, title: 'Newest', published_at: '2026-01-03T00:00:00Z' }),
      makeArticle({ id: 2, title: 'Anchor', published_at: '2026-01-02T00:00:00Z' }),
      makeArticle({ id: 3, title: 'Older', published_at: '2026-01-01T00:00:00Z' }),
    ])
    // The inbox is always filtered to unread only.
    renderArticleList('/inbox')

    await openCardMenu('article-2')
    fireEvent.click(screen.getByRole('menuitem', { name: MENU_LABEL_ABOVE }))

    await waitFor(() => {
      expect(screen.getByTestId('article-1').getAttribute('data-seen')).toBe('1')
    })
    // Still present, in the same order, rendered as read rather than removed.
    expect(screen.getByTestId('article-2').getAttribute('data-seen')).toBe('1')
    expect(screen.getByTestId('article-3').getAttribute('data-seen')).toBe('0')
    expect(document.querySelector('[data-article-id="1"]')?.getAttribute('data-article-unread')).toBe('0')
    expect(document.querySelector('[data-article-id="2"]')?.getAttribute('data-article-unread')).toBe('0')
    expect(document.querySelector('[data-article-id="3"]')?.getAttribute('data-article-unread')).toBe('1')
    expect(document.querySelectorAll('[data-article-id]').length).toBe(3)
    // The article list itself must not be refetched, or the rows would vanish.
    expect(listMutate).not.toHaveBeenCalled()
  })

  it('disables only the direction that is in flight', async () => {
    let resolveRequest: (value: unknown) => void = () => {}
    vi.mocked(apiPost).mockReturnValue(new Promise(resolve => { resolveRequest = resolve }))
    setArticles([makeArticle({ id: 5, title: 'Anchor' })])
    renderArticleList('/inbox')

    await openCardMenu('article-5')
    fireEvent.click(screen.getByRole('menuitem', { name: MENU_LABEL_ABOVE }))

    await openCardMenu('article-5')
    expect(screen.getByRole('menuitem', { name: MENU_LABEL_ABOVE }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: MENU_LABEL_BELOW }).hasAttribute('data-disabled')).toBe(false)

    await act(async () => {
      resolveRequest({ updated: 0, ids: [] })
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  })

  // ---------------------------------------------------------------------------
  // Feed unread-only toggle (individual feed pages only)
  //
  // As of Task 5 (Issue #14), the toggle itself is rendered in the header by
  // ArticleListPage (see app.test.tsx), not by ArticleList. ArticleList's
  // remaining responsibilities are: composing `feedUnreadOnly` (now a prop,
  // not a hook it calls itself) into `unreadOnly`, exposing
  // `resetPagingAndScroll` via its imperative handle so the page component can
  // trigger the pagination/scroll reset after flipping the toggle, and the
  // empty-state guidance's "show all" action.
  // ---------------------------------------------------------------------------

  function setFeed(id: number, overrides: Partial<FeedWithCounts> = {}) {
    swrFeedsData = {
      feeds: [{ id, name: 'My Feed', type: 'rss', unread_count: 5, total_count: 10, ...overrides }],
    }
  }

  it('does not render a feed unread-only toggle itself (rendered by the header instead)', () => {
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1', { feedUnreadOnly: 'on' })
    expect(screen.queryByText('Unread only')).toBeNull()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it('includes unread=1 in the fetch key on a plain feed page when feedUnreadOnly is on', () => {
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1', { feedUnreadOnly: 'on' })
    expect(capturedGetKey).toBeDefined()
    const key = capturedGetKey!(0, null)
    expect(key).toContain('unread=1')
  })

  it('does not include unread=1 in the fetch key on a plain feed page when feedUnreadOnly is off', () => {
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1', { feedUnreadOnly: 'off' })
    expect(capturedGetKey).toBeDefined()
    const key = capturedGetKey!(0, null)
    expect(key).not.toContain('unread=1')
  })

  it('ignores feedUnreadOnly on views that are not a plain feed page', () => {
    renderArticleList('/inbox', { feedUnreadOnly: 'on' })
    expect(capturedGetKey).toBeDefined()
    // /inbox is already unread-only via isInbox, independent of feedUnreadOnly,
    // but the fetch key must not depend on feedUnreadOnly for this view.
    const key = capturedGetKey!(0, null)
    expect(key).toContain('unread=1')
  })

  it('exposes resetPagingAndScroll via the imperative handle, resetting pagination and scroll', () => {
    const mockSetSize = vi.fn()
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    swrInfiniteReturn.setSize = mockSetSize
    const articleListRef = { current: null as ArticleListHandle | null }
    renderArticleList('/feeds/1', { articleListRef })

    act(() => {
      articleListRef.current!.resetPagingAndScroll()
    })

    expect(mockSetSize).toHaveBeenCalledWith(1)
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
  })

  it('shows the reused empty-state guidance when the feed unread-only view has no unread articles, and its button resets the toggle and pagination', () => {
    const onFeedUnreadOnlyChange = vi.fn()
    const mockSetSize = vi.fn()
    setFeed(1)
    swrInfiniteReturn = {
      data: [{ articles: [], total: 0, has_more: false, total_all: 5 }],
      error: undefined,
      size: 1,
      setSize: mockSetSize,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    }
    renderArticleList('/feeds/1', { feedUnreadOnly: 'on', onFeedUnreadOnlyChange })
    expect(screen.getByText('All caught up!')).toBeTruthy()
    // The generic empty-list fallback must not render alongside this guidance.
    expect(screen.queryByText('No articles')).toBeNull()

    fireEvent.click(screen.getByText('Show read articles'))
    expect(onFeedUnreadOnlyChange).toHaveBeenCalledWith('off')
    expect(mockSetSize).toHaveBeenCalledWith(1)
  })

  // ---------------------------------------------------------------------------
  // Category (folder) unread-only toggle (folder pages only)
  //
  // As of folder-unread-only-toggle Task 5 (Issue #14), the toggle itself is
  // rendered in the header by ArticleListPage (see app.test.tsx), reusing the
  // headerRight slot and resetPagingAndScroll mechanism feed-unread-only-toggle
  // introduced. ArticleList's remaining responsibilities are: composing
  // categoryUnreadOnly (now a prop, not a hook it calls itself) into
  // unreadOnly, and the empty-state guidance's "show all" action. Navigation
  // and legacy-migration coverage moved to app.test.tsx, where the real
  // useCategoryUnreadOnly hook is exercised end to end.
  // ---------------------------------------------------------------------------
  describe('Category unread-only toggle (folder pages only)', () => {
    it('does not render a category unread-only toggle itself (rendered by the header instead)', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3', { categoryUnreadOnly: 'on' })
      expect(screen.queryByText('Unread only')).toBeNull()
      expect(screen.queryByText('Show all')).toBeNull()
    })

    it('does not include unread=1 in the fetch key on a category page when categoryUnreadOnly is off', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3', { categoryUnreadOnly: 'off' })
      expect(capturedGetKey).toBeDefined()
      const key = capturedGetKey!(0, null)
      expect(key).not.toContain('unread=1')
    })

    it('includes unread=1 in the fetch key on a category page when categoryUnreadOnly is on', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3', { categoryUnreadOnly: 'on' })
      expect(capturedGetKey).toBeDefined()
      const key = capturedGetKey!(0, null)
      expect(key).toContain('unread=1')
    })

    it('shows the reused empty-state guidance when the category unread-only view has no unread articles, and its button resets the toggle and pagination', () => {
      const onCategoryUnreadOnlyChange = vi.fn()
      const mockSetSize = vi.fn()
      swrInfiniteReturn = {
        data: [{ articles: [], total: 0, has_more: false, total_all: 5 }],
        error: undefined,
        size: 1,
        setSize: mockSetSize,
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      }
      renderArticleList('/categories/3', { categoryUnreadOnly: 'on', onCategoryUnreadOnlyChange })
      expect(screen.getByText('All caught up!')).toBeTruthy()
      // The generic empty-list fallback must not render alongside this guidance.
      expect(screen.queryByText('No articles')).toBeNull()

      fireEvent.click(screen.getByText('Show read articles'))
      expect(onCategoryUnreadOnlyChange).toHaveBeenCalledWith('off')
      expect(mockSetSize).toHaveBeenCalledWith(1)
    })
  })
})

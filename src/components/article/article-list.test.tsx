import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom'
import { LocaleContext } from '../../lib/i18n'
import { KeyboardNavigationProvider } from '../../contexts/keyboard-navigation-context'
import type { ArticleListItem, FeedWithCounts } from '../../../shared/types'

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

vi.mock('../../hooks/use-feed-unread-only', () => ({
  useFeedUnreadOnly: vi.fn(() => ['off', vi.fn()]),
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

import { ArticleList } from './article-list'
import { useIsTouchDevice } from '../../hooks/use-is-touch-device'
import { useClipFeedId } from '../../hooks/use-clip-feed-id'
import { useFeedUnreadOnly } from '../../hooks/use-feed-unread-only'
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

function renderArticleList(initialPath = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <Routes>
          <Route element={<OutletWrapper />}>
            <Route path="feeds/:feedId" element={<ArticleList />} />
            <Route path="categories/:categoryId" element={<ArticleList />} />
            <Route path="*" element={<ArticleList />} />
          </Route>
        </Routes>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

// --- Navigation helpers for feed-switch integration tests ---
//
// react-router keeps the layout route (OutletWrapper) and the matched child
// route element (ArticleList) mounted across a navigation between sibling
// routes that share the same path pattern (e.g. feeds/:feedId -> feeds/:feedId
// with a different param). This mirrors production, where /feeds/:id has no
// `key` prop and ArticleList never remounts on feed switches (see design.md's
// "Existing Architecture Analysis"). `MemoryRouter`'s `initialEntries` only
// seeds the history on first mount, so re-rendering with a new initial path
// does NOT navigate an already-mounted router. Instead, a helper component
// captures `useNavigate()` once and tests drive real navigation through it.
let capturedNavigate: ((path: string) => void) | undefined

function NavigationCapture() {
  const navigate = useNavigate()
  capturedNavigate = navigate
  return null
}

function OutletWrapperWithNavCapture() {
  return (
    <KeyboardNavigationProvider>
      <NavigationCapture />
      <Outlet context={{ settings: mockSettings, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
    </KeyboardNavigationProvider>
  )
}

function renderArticleListWithNav(initialPath = '/feeds/1') {
  capturedNavigate = undefined
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <Routes>
          <Route element={<OutletWrapperWithNavCapture />}>
            <Route path="feeds/:feedId" element={<ArticleList />} />
            <Route path="categories/:categoryId" element={<ArticleList />} />
            <Route path="*" element={<ArticleList />} />
          </Route>
        </Routes>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

/** Navigate the already-rendered tree to `path` using the captured navigate function. */
function navigateTo(path: string) {
  act(() => {
    capturedNavigate!(path)
  })
}

let scrollToSpy: ReturnType<typeof vi.spyOn>

describe('ArticleList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrFeedsData = undefined
    mockSettings.autoMarkRead = 'off' as any
    vi.mocked(useIsTouchDevice).mockReturnValue(false)
    vi.mocked(useClipFeedId).mockReturnValue(null)
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['off', vi.fn()])
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

  const scopeCases = [
    {
      name: 'inbox sends the unread-only filter as the bulk scope',
      path: '/inbox',
      setup: () => {},
      scope: { unread: true },
    },
    {
      name: 'feed view sends the feed id as the bulk scope',
      path: '/feeds/1',
      setup: () => {},
      scope: { feed_id: 1 },
    },
    {
      name: 'clip list sends the resolved clip feed id as the bulk scope',
      path: '/clips',
      setup: () => { vi.mocked(useClipFeedId).mockReturnValue(7) },
      scope: { feed_id: 7 },
    },
    {
      name: 'category view sends the category id and its unread-only setting as the bulk scope',
      path: '/categories/3',
      setup: () => { localStorage.setItem('category-unread-only:3', 'on') },
      scope: { category_id: 3, unread: true },
    },
  ]

  it.each(scopeCases)('$name', async ({ path, setup, scope }) => {
    setup()
    setArticles([makeArticle({ id: 42, title: 'Anchor' })])
    renderArticleList(path)

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
  // ---------------------------------------------------------------------------

  function setFeed(id: number, overrides: Partial<FeedWithCounts> = {}) {
    swrFeedsData = {
      feeds: [{ id, name: 'My Feed', type: 'rss', unread_count: 5, total_count: 10, ...overrides }],
    }
  }

  it('renders the feed unread-only toggle on a plain feed page', () => {
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    expect(screen.getByText('Unread only')).toBeTruthy()
  })

  it('passes the route feed id to useFeedUnreadOnly on a plain feed page', () => {
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    expect(useFeedUnreadOnly).toHaveBeenCalledWith(1)
  })

  const noToggleViews = [
    { name: 'the inbox', path: '/inbox' },
    { name: 'a category view', path: '/categories/3' },
    { name: 'the bookmarks view', path: '/bookmarks' },
    { name: 'the likes view', path: '/likes' },
    { name: 'the history view', path: '/history' },
    { name: 'the clips view', path: '/clips' },
  ]

  // A category view is excluded here: it legitimately renders the *category*
  // unread-only toggle (which shares the feed toggle's "Unread only"/"Show
  // all" label text), covered separately below in "Category unread-only
  // toggle (folder pages only)". This test only asserts the *feed* toggle's
  // absence on views that render no toggle at all.
  it.each(noToggleViews.filter(v => v.path !== '/categories/3'))('does not render the feed unread-only toggle on $name', ({ path }) => {
    setArticles([makeArticle({ id: 1 })])
    renderArticleList(path)
    expect(screen.queryByText('Unread only')).toBeNull()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it.each(noToggleViews)('passes undefined to useFeedUnreadOnly on $name', ({ path }) => {
    setArticles([makeArticle({ id: 1 })])
    renderArticleList(path)
    expect(useFeedUnreadOnly).toHaveBeenCalledWith(undefined)
  })

  it('includes unread=1 in the fetch key when the feed toggle is on', () => {
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['on', vi.fn()])
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    expect(capturedGetKey).toBeDefined()
    const key = capturedGetKey!(0, null)
    expect(key).toContain('unread=1')
  })

  it('does not include unread=1 in the fetch key when the feed toggle is off', () => {
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['off', vi.fn()])
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    expect(capturedGetKey).toBeDefined()
    const key = capturedGetKey!(0, null)
    expect(key).not.toContain('unread=1')
  })

  it('renders the feed unread-only toggle even when showFeedActivity is off', () => {
    mockSettings.showFeedActivity = 'off' as any
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    expect(screen.getByText('Unread only')).toBeTruthy()
    expect(screen.queryByTestId('metrics-bar')).toBeNull()
    mockSettings.showFeedActivity = 'on' as any
  })

  it('flips the persisted feed unread-only state when the toggle is clicked', () => {
    const setFeedUnreadOnly = vi.fn()
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['off', setFeedUnreadOnly])
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    fireEvent.click(screen.getByText('Unread only'))
    expect(setFeedUnreadOnly).toHaveBeenCalledWith('on')
  })

  it('resets pagination when the toggle is clicked', () => {
    const setFeedUnreadOnly = vi.fn()
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['off', setFeedUnreadOnly])
    const mockSetSize = vi.fn()
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    swrInfiniteReturn.setSize = mockSetSize
    renderArticleList('/feeds/1')
    fireEvent.click(screen.getByText('Unread only'))
    expect(mockSetSize).toHaveBeenCalledWith(1)
  })

  it('scrolls to the top when the toggle is clicked', () => {
    const setFeedUnreadOnly = vi.fn()
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['off', setFeedUnreadOnly])
    setFeed(1)
    setArticles([makeArticle({ id: 1, feed_id: 1 })])
    renderArticleList('/feeds/1')
    fireEvent.click(screen.getByText('Unread only'))
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
  })

  it('shows the reused empty-state guidance when the feed unread-only view has no unread articles, and its button resets the toggle and pagination', () => {
    const setFeedUnreadOnly = vi.fn()
    vi.mocked(useFeedUnreadOnly).mockReturnValue(['on', setFeedUnreadOnly])
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
    renderArticleList('/feeds/1')
    expect(screen.getByText('All caught up!')).toBeTruthy()
    // The generic empty-list fallback must not render alongside this guidance.
    expect(screen.queryByText('No articles')).toBeNull()

    fireEvent.click(screen.getByText('Show read articles'))
    expect(setFeedUnreadOnly).toHaveBeenCalledWith('off')
    expect(mockSetSize).toHaveBeenCalledWith(1)
  })

  // ---------------------------------------------------------------------------
  // Feed-switch integration: per-feed unread-only state restoration (task 4)
  //
  // Task 1.1's own unit tests (use-feed-unread-only.test.ts) already prove the
  // hook itself re-derives correctly per feedId in isolation. These tests are
  // the belt-and-suspenders check that the guarantee still holds once the hook
  // is wired into the full ArticleList tree and driven by real route
  // navigation — exactly the scenario the feasibility research flagged as
  // unsafe for a naive per-feed-id localStorage hook (see research.md,
  // "createLocalStorageHook のフィードID単位への転用可否": ArticleList does not
  // remount when navigating between /feeds/:id routes, so a hook that doesn't
  // re-derive on feedId change would leak state across feeds).
  //
  // The real useFeedUnreadOnly hook (and real localStorage, provided by
  // src/__tests__/setup.ts) is used here instead of the module-level mock,
  // since the mock's fixed per-test return value cannot express a value that
  // changes across a single render tree's feedId changes.
  // ---------------------------------------------------------------------------
  describe('feed switching restores per-feed unread-only state (real hook + real navigation)', () => {
    beforeEach(async () => {
      const actual = await vi.importActual<typeof import('../../hooks/use-feed-unread-only')>(
        '../../hooks/use-feed-unread-only',
      )
      vi.mocked(useFeedUnreadOnly).mockImplementation(actual.useFeedUnreadOnly)
      setFeed(1)
      setArticles([makeArticle({ id: 1, feed_id: 1 })])
    })

    it('does not leak an "on" state onto a feed with no stored preference (the leak this feature was built to prevent)', () => {
      renderArticleListWithNav('/feeds/1')
      fireEvent.click(screen.getByText('Unread only'))
      expect(screen.getByText('Show all')).toBeTruthy()
      expect(localStorage.getItem('feed-unread-only:1')).toBe('on')

      navigateTo('/feeds/2')

      // Feed 2 has no stored preference: must show the default (off), not
      // feed 1's 'on' state carried over by a stale, un-rederived hook.
      expect(screen.getByText('Unread only')).toBeTruthy()
      expect(screen.queryByText('Show all')).toBeNull()
    })

    it('restores a stored "on" preference when navigating to a feed that has one', () => {
      localStorage.setItem('feed-unread-only:2', 'on')
      renderArticleListWithNav('/feeds/1')
      expect(screen.getByText('Unread only')).toBeTruthy()

      navigateTo('/feeds/2')

      expect(screen.getByText('Show all')).toBeTruthy()
    })

    it('defaults to "off" (show all articles) for a feed with no stored preference', () => {
      renderArticleListWithNav('/feeds/3')

      expect(screen.getByText('Unread only')).toBeTruthy()
      expect(screen.queryByText('Show all')).toBeNull()
    })

    it('restores each feed\'s own state correctly across a three-way A -> B -> A navigation chain', () => {
      renderArticleListWithNav('/feeds/1')
      fireEvent.click(screen.getByText('Unread only')) // Feed 1: off -> on
      expect(screen.getByText('Show all')).toBeTruthy()

      navigateTo('/feeds/2') // Feed 2: no stored preference
      expect(screen.getByText('Unread only')).toBeTruthy()
      expect(screen.queryByText('Show all')).toBeNull()

      navigateTo('/feeds/1') // Back to feed 1: must restore 'on', not feed 2's 'off'
      expect(screen.getByText('Show all')).toBeTruthy()
      expect(screen.queryByText('Unread only')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Category (folder) unread-only toggle
  //
  // Unlike the feed toggle, useCategoryUnreadOnly is not mocked at the module
  // level here: the real hook (real localStorage, cleared after every test by
  // src/__tests__/setup.ts) is used throughout, since it has no dependencies
  // that need stubbing and this keeps the per-category persistence genuinely
  // under test rather than assumed.
  // ---------------------------------------------------------------------------
  describe('Category unread-only toggle (folder pages only)', () => {
    it('renders the category unread-only toggle on a category page', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3')
      expect(screen.getAllByText('Unread only').length).toBe(1)
    })

    const noCategoryToggleViews = [
      { name: 'the inbox', path: '/inbox' },
      { name: 'a plain feed view', path: '/feeds/1' },
      { name: 'the bookmarks view', path: '/bookmarks' },
      { name: 'the likes view', path: '/likes' },
      { name: 'the history view', path: '/history' },
      { name: 'the clips view', path: '/clips' },
    ]

    it.each(noCategoryToggleViews)('does not render the category unread-only toggle on $name', ({ path }) => {
      if (path === '/feeds/1') setFeed(1)
      setArticles([makeArticle({ id: 1, feed_id: 1 })])
      renderArticleList(path)
      // The category toggle's label text is identical to the feed toggle's
      // ("Unread only" / "Show all"). On a plain feed view the feed toggle
      // itself renders that text once; the category toggle must never add a
      // second instance. On every other non-category view, neither renders.
      expect(screen.queryAllByText('Unread only').length).toBeLessThanOrEqual(1)
      expect(screen.queryAllByText('Show all').length).toBe(0)
    })

    it('does not include unread=1 in the fetch key when the category toggle is off (default)', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3')
      expect(capturedGetKey).toBeDefined()
      const key = capturedGetKey!(0, null)
      expect(key).not.toContain('unread=1')
    })

    it('includes unread=1 in the fetch key when a stored per-category preference is on', () => {
      localStorage.setItem('category-unread-only:3', 'on')
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3')
      expect(capturedGetKey).toBeDefined()
      const key = capturedGetKey!(0, null)
      expect(key).toContain('unread=1')
    })

    it('flips to "unread only", persists it, and includes unread=1 in the fetch key when the toggle is clicked', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3')

      fireEvent.click(screen.getByText('Unread only'))

      expect(screen.getByText('Show all')).toBeTruthy()
      expect(localStorage.getItem('category-unread-only:3')).toBe('on')
      expect(capturedGetKey).toBeDefined()
      expect(capturedGetKey!(0, null)).toContain('unread=1')
    })

    it('resets pagination when the category toggle is clicked', () => {
      const mockSetSize = vi.fn()
      setArticles([makeArticle({ id: 1 })])
      swrInfiniteReturn.setSize = mockSetSize
      renderArticleList('/categories/3')
      fireEvent.click(screen.getByText('Unread only'))
      expect(mockSetSize).toHaveBeenCalledWith(1)
    })

    it('scrolls to the top when the category toggle is clicked', () => {
      setArticles([makeArticle({ id: 1 })])
      renderArticleList('/categories/3')
      fireEvent.click(screen.getByText('Unread only'))
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    })

    it('shows the reused empty-state guidance when the category unread-only view has no unread articles, and its button resets the toggle and pagination', () => {
      localStorage.setItem('category-unread-only:3', 'on')
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
      renderArticleList('/categories/3')
      expect(screen.getByText('All caught up!')).toBeTruthy()
      // The generic empty-list fallback must not render alongside this guidance.
      expect(screen.queryByText('No articles')).toBeNull()

      fireEvent.click(screen.getByText('Show read articles'))
      expect(localStorage.getItem('category-unread-only:3')).toBe('off')
      expect(mockSetSize).toHaveBeenCalledWith(1)
    })
  })
})

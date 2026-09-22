import { forwardRef, useImperativeHandle } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom'
import { LocaleContext } from './lib/i18n'
import { KeyboardNavigationProvider } from './contexts/keyboard-navigation-context'
import { FetchProgressProvider } from './contexts/fetch-progress-context'

// --- Mocks ---
//
// ArticleListPage's own responsibility (Task 5, Issue #14) is the wiring
// between useFeedUnreadOnly, FeedUnreadOnlyToggle, PageLayout's headerRight
// slot, and ArticleList's imperative handle. ArticleList itself already has
// exhaustive coverage in article-list.test.tsx, so it is stubbed here to keep
// these tests focused on the wiring rather than re-testing its internals.

let swrFeedsData: any = undefined
let swrCategoriesData: any = { categories: [] }

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return {
    ...actual,
    default: (key: string) => {
      if (key === '/api/feeds') return { data: swrFeedsData }
      if (key === '/api/categories') return { data: swrCategoriesData }
      return { data: undefined }
    },
  }
})

vi.mock('./lib/fetcher', () => ({
  fetcher: vi.fn(),
}))

vi.mock('./components/feed/feed-list', () => ({
  FeedList: () => null,
}))

const resetPagingAndScrollSpy = vi.fn()
let capturedArticleListProps: { feedUnreadOnly: string; onFeedUnreadOnlyChange: (next: string) => void } | undefined

vi.mock('./components/article/article-list', () => ({
  ArticleList: forwardRef((props: any, ref: any) => {
    capturedArticleListProps = props
    useImperativeHandle(ref, () => ({
      revalidate: vi.fn(),
      resetPagingAndScroll: resetPagingAndScrollSpy,
    }))
    return <div data-testid="article-list-stub" />
  }),
}))

import { ArticleListPage } from './app'

function OutletWrapper() {
  return (
    <FetchProgressProvider>
      <KeyboardNavigationProvider>
        <Outlet context={{ settings: {}, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
      </KeyboardNavigationProvider>
    </FetchProgressProvider>
  )
}

let capturedNavigate: ((path: string) => void) | undefined

function NavigationCapture() {
  const navigate = useNavigate()
  capturedNavigate = navigate
  return null
}

function OutletWrapperWithNavCapture() {
  return (
    <FetchProgressProvider>
      <KeyboardNavigationProvider>
        <NavigationCapture />
        <Outlet context={{ settings: {}, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
      </KeyboardNavigationProvider>
    </FetchProgressProvider>
  )
}

function renderArticleListPage(initialPath = '/inbox') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <Routes>
          <Route element={<OutletWrapper />}>
            <Route path="feeds/:feedId" element={<ArticleListPage />} />
            <Route path="categories/:categoryId" element={<ArticleListPage />} />
            <Route path="*" element={<ArticleListPage />} />
          </Route>
        </Routes>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

function renderArticleListPageWithNav(initialPath = '/feeds/1') {
  capturedNavigate = undefined
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <Routes>
          <Route element={<OutletWrapperWithNavCapture />}>
            <Route path="feeds/:feedId" element={<ArticleListPage />} />
            <Route path="categories/:categoryId" element={<ArticleListPage />} />
            <Route path="*" element={<ArticleListPage />} />
          </Route>
        </Routes>
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

function navigateTo(path: string) {
  act(() => {
    capturedNavigate!(path)
  })
}

function setFeed(id: number, name = 'My Feed') {
  swrFeedsData = { feeds: [{ id, name, type: 'rss', category_id: null, category_name: null }], clip_feed_id: null }
}

describe('ArticleListPage header wiring (Issue #14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    swrFeedsData = undefined
    swrCategoriesData = { categories: [] }
    capturedArticleListProps = undefined
    // PageLayout observes a sentinel with IntersectionObserver to track the
    // header's scrolled state; jsdom doesn't implement it.
    vi.stubGlobal('IntersectionObserver', class {
      constructor() {}
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    })
  })

  it('renders the feed unread-only toggle in the header on a plain feed page', () => {
    setFeed(1)
    renderArticleListPage('/feeds/1')
    expect(screen.getByText('Unread only')).toBeTruthy()
  })

  const noToggleViews = [
    { name: 'the inbox', path: '/inbox' },
    { name: 'a category view', path: '/categories/3' },
    { name: 'the bookmarks view', path: '/bookmarks' },
    { name: 'the likes view', path: '/likes' },
    { name: 'the history view', path: '/history' },
    { name: 'the clips view', path: '/clips' },
  ]

  it.each(noToggleViews)('does not render the feed unread-only toggle on $name', ({ path }) => {
    renderArticleListPage(path)
    expect(screen.queryByText('Unread only')).toBeNull()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it('passes the current feedUnreadOnly state down to ArticleList as a prop', () => {
    localStorage.setItem('feed-unread-only:1', 'on')
    setFeed(1)
    renderArticleListPage('/feeds/1')
    expect(capturedArticleListProps?.feedUnreadOnly).toBe('on')
  })

  it('passes "off" to ArticleList on views that are not a plain feed page', () => {
    renderArticleListPage('/inbox')
    expect(capturedArticleListProps?.feedUnreadOnly).toBe('off')
  })

  it('flips the persisted state and resets pagination/scroll on ArticleList when the toggle is clicked', () => {
    setFeed(1)
    renderArticleListPage('/feeds/1')

    fireEvent.click(screen.getByText('Unread only'))

    expect(localStorage.getItem('feed-unread-only:1')).toBe('on')
    expect(resetPagingAndScrollSpy).toHaveBeenCalledOnce()
    expect(screen.getByText('Show all')).toBeTruthy()
  })

  // ---------------------------------------------------------------------------
  // Feed-switch integration: per-feed unread-only state restoration, now
  // exercised at the page level since useFeedUnreadOnly's call site moved
  // from ArticleList to ArticleListPage (Task 5, Issue #14). This mirrors the
  // navigation-driven coverage that used to live in article-list.test.tsx
  // before the toggle moved to the header.
  // ---------------------------------------------------------------------------
  describe('feed switching restores per-feed unread-only state (real navigation)', () => {
    beforeEach(() => {
      setFeed(1)
    })

    it('does not leak an "on" state onto a feed with no stored preference', () => {
      renderArticleListPageWithNav('/feeds/1')
      fireEvent.click(screen.getByText('Unread only'))
      expect(screen.getByText('Show all')).toBeTruthy()

      setFeed(2)
      navigateTo('/feeds/2')

      expect(screen.getByText('Unread only')).toBeTruthy()
      expect(screen.queryByText('Show all')).toBeNull()
    })

    it('restores a stored "on" preference when navigating to a feed that has one', () => {
      localStorage.setItem('feed-unread-only:2', 'on')
      renderArticleListPageWithNav('/feeds/1')
      expect(screen.getByText('Unread only')).toBeTruthy()

      setFeed(2)
      navigateTo('/feeds/2')

      expect(screen.getByText('Show all')).toBeTruthy()
    })
  })
})

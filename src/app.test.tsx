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
let capturedArticleListProps: {
  feedUnreadOnly: string
  onFeedUnreadOnlyChange: (next: string) => void
  categoryUnreadOnly: string
  onCategoryUnreadOnlyChange: (next: string) => void
} | undefined

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

function setCategory(id: number, name = 'My Category') {
  swrCategoriesData = { categories: [{ id, name }] }
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
    { name: 'the bookmarks view', path: '/bookmarks' },
    { name: 'the likes view', path: '/likes' },
    { name: 'the history view', path: '/history' },
    { name: 'the clips view', path: '/clips' },
  ]

  // A category view is excluded from this list: it legitimately renders the
  // *category* toggle (same "Unread only"/"Show all" label text), covered
  // separately below. This only asserts views that render no toggle at all.
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

  // ---------------------------------------------------------------------------
  // Category (folder) unread-only toggle wiring (folder-unread-only-toggle
  // Task 5, Issue #14). Mirrors the feed toggle coverage above, but reuses the
  // same headerRight slot and resetPagingAndScroll mechanism rather than
  // introducing new ones (see design.md's Allowed Dependencies).
  // ---------------------------------------------------------------------------
  it('renders the category unread-only toggle in the header on a category page', () => {
    setCategory(3)
    renderArticleListPage('/categories/3')
    expect(screen.getByText('Unread only')).toBeTruthy()
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
    renderArticleListPage(path)
    // On a plain feed view the feed toggle renders this same text once; the
    // category toggle must never add a second instance. Everywhere else,
    // neither renders.
    expect(screen.queryAllByText('Unread only').length).toBeLessThanOrEqual(1)
    expect(screen.queryAllByText('Show all').length).toBe(0)
  })

  it('passes the current categoryUnreadOnly state down to ArticleList as a prop', () => {
    localStorage.setItem('category-unread-only:3', 'on')
    setCategory(3)
    renderArticleListPage('/categories/3')
    expect(capturedArticleListProps?.categoryUnreadOnly).toBe('on')
  })

  it('flips the persisted category state and resets pagination/scroll on ArticleList when the toggle is clicked', () => {
    setCategory(3)
    renderArticleListPage('/categories/3')

    fireEvent.click(screen.getByText('Unread only'))

    expect(localStorage.getItem('category-unread-only:3')).toBe('on')
    expect(resetPagingAndScrollSpy).toHaveBeenCalledOnce()
    expect(screen.getByText('Show all')).toBeTruthy()
  })

  it('shows only one toggle at a time when navigating between a feed page and a category page', () => {
    setFeed(1)
    setCategory(3)
    renderArticleListPageWithNav('/feeds/1')
    expect(screen.getAllByText('Unread only').length).toBe(1)

    navigateTo('/categories/3')
    expect(screen.getAllByText('Unread only').length).toBe(1)

    navigateTo('/feeds/1')
    expect(screen.getAllByText('Unread only').length).toBe(1)
  })

  describe('category switching restores per-category unread-only state (real navigation)', () => {
    beforeEach(() => {
      setCategory(1)
    })

    it('does not leak an "on" state onto a category with no stored preference', () => {
      renderArticleListPageWithNav('/categories/1')
      fireEvent.click(screen.getByText('Unread only'))
      expect(screen.getByText('Show all')).toBeTruthy()

      setCategory(2)
      navigateTo('/categories/2')

      expect(screen.getByText('Unread only')).toBeTruthy()
      expect(screen.queryByText('Show all')).toBeNull()
    })

    it('restores a stored "on" preference when navigating to a category that has one', () => {
      localStorage.setItem('category-unread-only:2', 'on')
      renderArticleListPageWithNav('/categories/1')
      expect(screen.getByText('Unread only')).toBeTruthy()

      setCategory(2)
      navigateTo('/categories/2')

      expect(screen.getByText('Show all')).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------------------
  // Migration fallback chain, end to end through ArticleListPage (Requirements
  // 4.1 / 4.3 / 5.1 / 5.2). Proves the legacy global "category unread-only"
  // setting's leftover localStorage value seeds each never-visited category's
  // initial state, and that an explicit per-category choice always wins once
  // made, even as the legacy value keeps changing afterward.
  // ---------------------------------------------------------------------------
  it('applies the legacy value as the initial state for an unvisited category, but a later legacy change only reaches categories that remain untouched', () => {
    localStorage.setItem('category-unread-only', 'off')
    setCategory(1)
    renderArticleListPageWithNav('/categories/1')

    // Category 1 has never been visited before: its initial state follows
    // the legacy value ('off').
    expect(screen.getByText('Unread only')).toBeTruthy()

    // Explicitly toggle category 1 on. From now on this takes priority over
    // the legacy key for category 1.
    fireEvent.click(screen.getByText('Unread only'))
    expect(screen.getByText('Show all')).toBeTruthy()
    expect(localStorage.getItem('category-unread-only:1')).toBe('on')

    // The legacy key changes after category 1's explicit override.
    localStorage.setItem('category-unread-only', 'on')

    // Category 2 has never been touched: it must reflect the *current*
    // legacy value ('on'), not inherit category 1's state.
    setCategory(2)
    navigateTo('/categories/2')
    expect(screen.getByText('Show all')).toBeTruthy()

    // The legacy key flips again.
    localStorage.setItem('category-unread-only', 'off')

    // Category 3, also untouched, picks up this newest legacy value fresh.
    setCategory(3)
    navigateTo('/categories/3')
    expect(screen.getByText('Unread only')).toBeTruthy()

    // Category 1 still shows its explicit 'on' override, even though the
    // legacy key is now 'off'.
    setCategory(1)
    navigateTo('/categories/1')
    expect(screen.getByText('Show all')).toBeTruthy()
    expect(localStorage.getItem('category-unread-only:1')).toBe('on')
  })
})

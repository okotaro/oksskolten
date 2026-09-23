import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MarkAllReadTarget } from '../../../shared/types'
import { LocaleContext, type Locale } from '../../lib/i18n'

const mockMarkAllRead = vi.fn()
const mockUseMarkAllRead = vi.fn()
vi.mock('../../hooks/use-mark-all-read', () => ({
  useMarkAllRead: (...args: unknown[]) => mockUseMarkAllRead(...args),
}))

import { MarkAllReadButton } from './mark-all-read-button'

function setup(overrides: { target?: MarkAllReadTarget; isPending?: boolean } = {}) {
  const target: MarkAllReadTarget = overrides.target ?? { type: 'feed', id: 1 }
  const onMarkedLocally = vi.fn()
  const onUnmarkedLocally = vi.fn()
  mockUseMarkAllRead.mockReturnValue({ markAllRead: mockMarkAllRead, isPending: overrides.isPending ?? false })
  render(<MarkAllReadButton target={target} onMarkedLocally={onMarkedLocally} onUnmarkedLocally={onUnmarkedLocally} />)
  return { target, onMarkedLocally, onUnmarkedLocally }
}

describe('MarkAllReadButton', () => {
  beforeEach(() => {
    mockMarkAllRead.mockReset()
    mockMarkAllRead.mockResolvedValue(undefined)
    mockUseMarkAllRead.mockReset()
  })

  it('passes target and callbacks through to useMarkAllRead', () => {
    const { target, onMarkedLocally, onUnmarkedLocally } = setup({ target: { type: 'feed', id: 42 } })
    expect(mockUseMarkAllRead).toHaveBeenCalledWith({ target, onMarkedLocally, onUnmarkedLocally })
  })

  it('renders the feed label for a feed target', () => {
    setup({ target: { type: 'feed', id: 1 } })
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDefined()
  })

  it('renders the category label for a category target', () => {
    setup({ target: { type: 'category', id: 1 } })
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDefined()
  })

  it('calls markAllRead when clicked while not pending', () => {
    setup({ isPending: false })
    fireEvent.click(screen.getByRole('button'))
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1)
  })

  it('disables the button while pending and does not call markAllRead on click', () => {
    setup({ isPending: true })
    const button = screen.getByRole('button')
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(mockMarkAllRead).not.toHaveBeenCalled()
  })

  it('is not disabled while not pending', () => {
    setup({ isPending: false })
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(false)
  })
})

// AC 1.5 (Requirement 1, Issue #16): the button's label must be provided in
// both Japanese and English. These render under an explicit LocaleContext so
// the assertion doesn't depend on the test environment's default locale
// resolution (see setup() above, which relies on that default and only ever
// observes the English string).
function renderWithLocale(locale: Locale, target: MarkAllReadTarget) {
  mockUseMarkAllRead.mockReturnValue({ markAllRead: mockMarkAllRead, isPending: false })
  render(
    <LocaleContext.Provider value={{ locale, setLocale: vi.fn() }}>
      <MarkAllReadButton target={target} onMarkedLocally={vi.fn()} onUnmarkedLocally={vi.fn()} />
    </LocaleContext.Provider>,
  )
}

describe('MarkAllReadButton locale rendering (AC 1.5, Issue #16)', () => {
  beforeEach(() => {
    mockMarkAllRead.mockReset()
    mockMarkAllRead.mockResolvedValue(undefined)
    mockUseMarkAllRead.mockReset()
  })

  it('renders the Japanese label for a feed target under locale ja', () => {
    renderWithLocale('ja', { type: 'feed', id: 1 })
    expect(screen.getByRole('button', { name: 'すべて既読にする' })).toBeDefined()
  })

  it('renders the English label for a feed target under locale en', () => {
    renderWithLocale('en', { type: 'feed', id: 1 })
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDefined()
  })

  it('renders the Japanese label for a category target under locale ja', () => {
    renderWithLocale('ja', { type: 'category', id: 1 })
    expect(screen.getByRole('button', { name: 'すべて既読にする' })).toBeDefined()
  })

  it('renders the English label for a category target under locale en', () => {
    renderWithLocale('en', { type: 'category', id: 1 })
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDefined()
  })
})

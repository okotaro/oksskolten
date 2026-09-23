import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeedUnreadOnlyToggle } from './feed-unread-only-toggle'

describe('FeedUnreadOnlyToggle', () => {
  it('renders both segments with the existing feed toggle labels as aria-labels', () => {
    render(<FeedUnreadOnlyToggle unreadOnly={false} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeDefined()
  })

  it('marks the "show all" segment active when unreadOnly is false', () => {
    render(<FeedUnreadOnlyToggle unreadOnly={false} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Show all' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Unread only' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks the "unread only" segment active when unreadOnly is true', () => {
    render(<FeedUnreadOnlyToggle unreadOnly={true} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Unread only' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Show all' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('invokes onToggle exactly once when the inactive segment is clicked', () => {
    const onToggle = vi.fn()
    render(<FeedUnreadOnlyToggle unreadOnly={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unread only' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith()
  })

  it('invokes onToggle when the already-active segment is clicked', () => {
    const onToggle = vi.fn()
    render(<FeedUnreadOnlyToggle unreadOnly={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith()
  })
})

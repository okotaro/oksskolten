import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeedUnreadOnlyToggle } from './feed-unread-only-toggle'

describe('FeedUnreadOnlyToggle', () => {
  it('shows the "switch to unread only" label when unreadOnly is false', () => {
    render(<FeedUnreadOnlyToggle unreadOnly={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Unread only')).toBeDefined()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it('shows the "switch to show all" label when unreadOnly is true', () => {
    render(<FeedUnreadOnlyToggle unreadOnly={true} onToggle={vi.fn()} />)
    expect(screen.getByText('Show all')).toBeDefined()
    expect(screen.queryByText('Unread only')).toBeNull()
  })

  it('invokes onToggle exactly once when clicked', () => {
    const onToggle = vi.fn()
    render(<FeedUnreadOnlyToggle unreadOnly={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByText('Unread only'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith()
  })
})

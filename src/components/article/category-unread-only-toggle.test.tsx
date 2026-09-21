import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CategoryUnreadOnlyToggle } from './category-unread-only-toggle'

describe('CategoryUnreadOnlyToggle', () => {
  it('shows the "switch to unread only" label when unreadOnly is false', () => {
    render(<CategoryUnreadOnlyToggle unreadOnly={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Unread only')).toBeDefined()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it('shows the "switch to show all" label when unreadOnly is true', () => {
    render(<CategoryUnreadOnlyToggle unreadOnly={true} onToggle={vi.fn()} />)
    expect(screen.getByText('Show all')).toBeDefined()
    expect(screen.queryByText('Unread only')).toBeNull()
  })

  it('invokes onToggle exactly once when clicked', () => {
    const onToggle = vi.fn()
    render(<CategoryUnreadOnlyToggle unreadOnly={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByText('Unread only'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith()
  })
})

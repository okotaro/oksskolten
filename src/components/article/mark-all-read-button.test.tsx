import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MarkAllReadTarget } from '../../../shared/types'

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

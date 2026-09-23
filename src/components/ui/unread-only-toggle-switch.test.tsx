import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnreadOnlyToggleSwitch } from './unread-only-toggle-switch'

describe('UnreadOnlyToggleSwitch', () => {
  it('renders both segments when unreadOnly is false', () => {
    render(
      <UnreadOnlyToggleSwitch unreadOnly={false} onChange={vi.fn()} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeDefined()
  })

  it('renders both segments when unreadOnly is true', () => {
    render(
      <UnreadOnlyToggleSwitch unreadOnly={true} onChange={vi.fn()} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Unread only' })).toBeDefined()
  })

  it('marks the "show all" segment active when unreadOnly is false', () => {
    render(
      <UnreadOnlyToggleSwitch unreadOnly={false} onChange={vi.fn()} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    expect(screen.getByRole('button', { name: 'Show all' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Unread only' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks the "unread only" segment active when unreadOnly is true', () => {
    render(
      <UnreadOnlyToggleSwitch unreadOnly={true} onChange={vi.fn()} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    expect(screen.getByRole('button', { name: 'Unread only' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Show all' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onChange with the opposite value when the inactive segment is clicked', () => {
    const onChange = vi.fn()
    render(
      <UnreadOnlyToggleSwitch unreadOnly={false} onChange={onChange} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unread only' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when the "show all" segment is clicked while unread-only is active', () => {
    const onChange = vi.fn()
    render(
      <UnreadOnlyToggleSwitch unreadOnly={true} onChange={onChange} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('calls onChange with the opposite value when the already-active segment is clicked', () => {
    const onChange = vi.fn()
    render(
      <UnreadOnlyToggleSwitch unreadOnly={false} onChange={onChange} showAllLabel="Show all" unreadOnlyLabel="Unread only" showAllText="All" unreadOnlyText="Unread" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

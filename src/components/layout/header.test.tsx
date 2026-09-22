import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from './header'

describe('Header', () => {
  it('renders menu button in list mode', () => {
    render(<Header mode="list" />)
    expect(screen.getByLabelText('Menu')).toBeTruthy()
  })

  it('renders back button in detail mode', () => {
    render(<Header mode="detail" />)
    expect(screen.getByLabelText('Back')).toBeTruthy()
  })

  it('shows feed name in list mode', () => {
    render(<Header mode="list" feedName="Tech News" />)
    expect(screen.getByText('Tech News')).toBeTruthy()
  })

  it('does not show feed name when not provided', () => {
    render(<Header mode="list" />)
    expect(screen.queryByText('Tech News')).toBeNull()
  })

  it('calls onMenuClick when menu button is clicked', async () => {
    const onMenuClick = vi.fn()
    render(<Header mode="list" onMenuClick={onMenuClick} />)
    await userEvent.click(screen.getByLabelText('Menu'))
    expect(onMenuClick).toHaveBeenCalledOnce()
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    render(<Header mode="detail" onBack={onBack} />)
    await userEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('applies scrolled border style', () => {
    render(<Header mode="list" isScrolled />)
    const header = document.querySelector('[data-header]')!
    expect(header.className).toContain('border-border')
  })

  it('applies transparent border when not scrolled', () => {
    render(<Header mode="list" isScrolled={false} />)
    const header = document.querySelector('[data-header]')!
    expect(header.className).toContain('border-transparent')
  })

  it('renders headerRight content in list mode', () => {
    render(<Header mode="list" headerRight={<span>Unread only</span>} />)
    expect(screen.getByText('Unread only')).toBeTruthy()
  })

  it('renders nothing extra in the right slot when headerRight is not provided', () => {
    render(<Header mode="list" feedName="Tech News" />)
    expect(screen.queryByText('Unread only')).toBeNull()
  })

  it('keeps the right slot position independent of the title length', () => {
    const { container: short } = render(<Header mode="list" feedName="A" headerRight={<span>Unread only</span>} />)
    const { container: long } = render(
      <Header mode="list" feedName="A very long feed title that could otherwise push things around" headerRight={<span>Unread only</span>} />,
    )
    // The right slot is a sibling of the title's flex-1 container, not nested
    // inside it, so its own box is unaffected by how long the title text is.
    const shortSlot = short.querySelector('[data-header] > .min-w-8')!
    const longSlot = long.querySelector('[data-header] > .min-w-8')!
    expect(shortSlot.className).toBe(longSlot.className)
  })
})

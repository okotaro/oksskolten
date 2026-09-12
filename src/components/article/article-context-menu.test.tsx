import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArticleContextMenu } from './article-context-menu'
import { LocaleContext, type Locale } from '../../lib/i18n'

const LABELS = {
  ja: {
    above: 'これより上（新しい）を既読にする',
    below: 'これより下（古い）を既読にする',
  },
  en: {
    above: 'Mark above (newer) as read',
    below: 'Mark below (older) as read',
  },
} as const

interface RenderOptions {
  locale?: Locale
  aboveDisabled?: boolean
  belowDisabled?: boolean
}

function renderMenu({ locale = 'ja', aboveDisabled, belowDisabled }: RenderOptions = {}) {
  const onMarkReadAbove = vi.fn()
  const onMarkReadBelow = vi.fn()

  render(
    <LocaleContext.Provider value={{ locale, setLocale: vi.fn() }}>
      <ArticleContextMenu
        onMarkReadAbove={onMarkReadAbove}
        onMarkReadBelow={onMarkReadBelow}
        aboveDisabled={aboveDisabled}
        belowDisabled={belowDisabled}
      >
        <div data-testid="article-card">記事カード</div>
      </ArticleContextMenu>
    </LocaleContext.Provider>,
  )

  return { onMarkReadAbove, onMarkReadBelow }
}

async function openMenu() {
  fireEvent.contextMenu(screen.getByTestId('article-card'))
  await waitFor(() => {
    expect(screen.getByRole('menu')).toBeTruthy()
  })
}

describe('ArticleContextMenu', () => {
  it('メニューを開かない間は包んだ子要素をそのまま描画する', () => {
    renderMenu()

    expect(screen.getByTestId('article-card').textContent).toBe('記事カード')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByText(LABELS.ja.above)).toBeNull()
    expect(screen.queryByText(LABELS.ja.below)).toBeNull()
  })

  it('右クリックでメニューを開き、上下2つの項目を訳文で表示する', async () => {
    renderMenu()
    await openMenu()

    expect(screen.getByRole('menuitem', { name: LABELS.ja.above })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: LABELS.ja.below })).toBeTruthy()
    // 子要素はメニューを開いた後も描画され続ける
    expect(screen.getByTestId('article-card')).toBeTruthy()
  })

  it('英語ロケールでは英語の文言を表示する', async () => {
    renderMenu({ locale: 'en' })
    await openMenu()

    expect(screen.getByRole('menuitem', { name: LABELS.en.above })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: LABELS.en.below })).toBeTruthy()
  })

  it('上方向の項目を選ぶと onMarkReadAbove だけを1回呼び、メニューを閉じる', async () => {
    const { onMarkReadAbove, onMarkReadBelow } = renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: LABELS.ja.above }))

    expect(onMarkReadAbove).toHaveBeenCalledTimes(1)
    expect(onMarkReadBelow).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('下方向の項目を選ぶと onMarkReadBelow だけを1回呼び、メニューを閉じる', async () => {
    const { onMarkReadAbove, onMarkReadBelow } = renderMenu()
    await openMenu()

    fireEvent.click(screen.getByRole('menuitem', { name: LABELS.ja.below }))

    expect(onMarkReadBelow).toHaveBeenCalledTimes(1)
    expect(onMarkReadAbove).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  it('aboveDisabled のとき上方向の項目を選択できない', async () => {
    const { onMarkReadAbove, onMarkReadBelow } = renderMenu({ aboveDisabled: true })
    await openMenu()

    const above = screen.getByRole('menuitem', { name: LABELS.ja.above })
    expect(above.getAttribute('aria-disabled')).toBe('true')
    expect(above.hasAttribute('data-disabled')).toBe(true)

    fireEvent.click(above)
    expect(onMarkReadAbove).not.toHaveBeenCalled()

    // 下方向は無効化されず、引き続き選択できる
    const below = screen.getByRole('menuitem', { name: LABELS.ja.below })
    expect(below.hasAttribute('data-disabled')).toBe(false)
    fireEvent.click(below)
    expect(onMarkReadBelow).toHaveBeenCalledTimes(1)
  })

  it('belowDisabled のとき下方向の項目を選択できない', async () => {
    const { onMarkReadAbove, onMarkReadBelow } = renderMenu({ belowDisabled: true })
    await openMenu()

    const below = screen.getByRole('menuitem', { name: LABELS.ja.below })
    expect(below.getAttribute('aria-disabled')).toBe('true')
    expect(below.hasAttribute('data-disabled')).toBe(true)

    fireEvent.click(below)
    expect(onMarkReadBelow).not.toHaveBeenCalled()

    // 上方向は無効化されず、引き続き選択できる
    const above = screen.getByRole('menuitem', { name: LABELS.ja.above })
    expect(above.hasAttribute('data-disabled')).toBe(false)
    fireEvent.click(above)
    expect(onMarkReadAbove).toHaveBeenCalledTimes(1)
  })

  it('メニュー外の操作ではハンドラを呼ばずにメニューを閉じる', async () => {
    const { onMarkReadAbove, onMarkReadBelow } = renderMenu()
    await openMenu()

    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull()
    })
    expect(onMarkReadAbove).not.toHaveBeenCalled()
    expect(onMarkReadBelow).not.toHaveBeenCalled()
  })
})

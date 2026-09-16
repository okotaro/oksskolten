import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { LocaleContext, useI18n } from './i18n'

function makeWrapper(locale: 'ja' | 'en' | 'zh') {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(LocaleContext.Provider, { value: { locale, setLocale: () => {} } }, children)
}

describe('useI18n', () => {
  it('returns Japanese text when locale is ja', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    expect(result.current.t('feeds.inbox')).toBe('Inbox')
    expect(result.current.t('feeds.title')).toBe('フィード')
  })

  it('returns English text when locale is en', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('en') })
    expect(result.current.t('feeds.title')).toBe('Feeds')
  })

  it('replaces parameters in text', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('en') })
    const text = result.current.t('feeds.deleteConfirm', { name: 'TestFeed' })
    expect(text).toContain('TestFeed')
    expect(text).not.toContain('${name}')
  })

  it('replaces parameters in Japanese text', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    const text = result.current.t('feeds.deleteConfirm', { name: 'テスト' })
    expect(text).toContain('テスト')
    expect(text).not.toContain('${name}')
  })

  it('replaces the count parameter in the bulk mark-read toast', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('en') })
    const text = result.current.t('toast.bulkMarkedRead', { count: '5' })
    expect(text).toContain('5')
    expect(text).not.toContain('${count}')
  })

  it('exposes locale value', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    expect(result.current.locale).toBe('ja')
  })

  it('provides feed unread-only toggle labels in Japanese', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper('ja') })
    expect(result.current.t('feed.unreadOnlyToggle.showUnreadOnly')).toBe('未読のみ表示')
    expect(result.current.t('feed.unreadOnlyToggle.showAll')).toBe('すべて表示')
  })

  it('resolves feed unread-only toggle labels to distinct, non-empty text in every locale', () => {
    for (const locale of ['ja', 'en', 'zh'] as const) {
      const { result } = renderHook(() => useI18n(), { wrapper: makeWrapper(locale) })
      const showUnreadOnly = result.current.t('feed.unreadOnlyToggle.showUnreadOnly')
      const showAll = result.current.t('feed.unreadOnlyToggle.showAll')
      expect(showUnreadOnly.length).toBeGreaterThan(0)
      expect(showAll.length).toBeGreaterThan(0)
      expect(showUnreadOnly).not.toBe(showAll)
    }
  })
})

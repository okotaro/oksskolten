import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCategoryUnreadOnly } from './use-category-unread-only'

describe('useCategoryUnreadOnly', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to "off" when nothing is stored for the category and no legacy value exists', () => {
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    expect(result.current[0]).toBe('off')
  })

  it('falls back to the legacy global value when no per-category value is stored', () => {
    localStorage.setItem('category-unread-only', 'on')
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    expect(result.current[0]).toBe('on')
  })

  it('treats any legacy value other than exactly "on" as off', () => {
    localStorage.setItem('category-unread-only', 'invalid')
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    expect(result.current[0]).toBe('off')
  })

  it('prefers the per-category stored value over the legacy value', () => {
    localStorage.setItem('category-unread-only', 'on')
    localStorage.setItem('category-unread-only:1', 'off')
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    expect(result.current[0]).toBe('off')
  })

  it('falls back to "off" for an invalid per-category stored value', () => {
    localStorage.setItem('category-unread-only:1', 'invalid')
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    expect(result.current[0]).toBe('off')
  })

  it('persists a setter call under a categoryId-scoped key', () => {
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    act(() => result.current[1]('on'))
    expect(result.current[0]).toBe('on')
    expect(localStorage.getItem('category-unread-only:1')).toBe('on')
  })

  it('never writes to the legacy key from the setter', () => {
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    act(() => result.current[1]('on'))
    expect(localStorage.getItem('category-unread-only')).toBeNull()
  })

  it('once a per-category value is stored, it always takes priority over the legacy value going forward', () => {
    localStorage.setItem('category-unread-only', 'on')
    const { result } = renderHook(() => useCategoryUnreadOnly(1))
    expect(result.current[0]).toBe('on')

    act(() => result.current[1]('off'))
    expect(result.current[0]).toBe('off')
    expect(localStorage.getItem('category-unread-only:1')).toBe('off')
    // Legacy value is still 'on', but the per-category value now wins.
    expect(localStorage.getItem('category-unread-only')).toBe('on')
  })

  it('returns "off" and never writes to storage when categoryId is undefined', () => {
    localStorage.setItem('category-unread-only', 'on')
    const { result } = renderHook(() => useCategoryUnreadOnly(undefined))
    expect(result.current[0]).toBe('off')

    act(() => result.current[1]('on'))
    expect(result.current[0]).toBe('off')
    expect(localStorage.getItem('category-unread-only:undefined')).toBeNull()
  })

  it('re-derives state per categoryId and does not leak the previous categoryId value (regression)', () => {
    localStorage.setItem('category-unread-only:2', 'on')
    const { result, rerender } = renderHook(
      ({ categoryId }) => useCategoryUnreadOnly(categoryId),
      {
        initialProps: { categoryId: 1 as number | undefined },
      },
    )

    act(() => result.current[1]('on'))
    expect(result.current[0]).toBe('on')
    expect(localStorage.getItem('category-unread-only:1')).toBe('on')

    rerender({ categoryId: 2 })
    expect(result.current[0]).toBe('on')
    expect(localStorage.getItem('category-unread-only:2')).toBe('on')

    rerender({ categoryId: 3 })
    expect(result.current[0]).toBe('off')

    rerender({ categoryId: undefined })
    expect(result.current[0]).toBe('off')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFeedUnreadOnly } from './use-feed-unread-only'

describe('useFeedUnreadOnly', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to "off" when nothing is stored for the feed', () => {
    const { result } = renderHook(() => useFeedUnreadOnly(1))
    expect(result.current[0]).toBe('off')
  })

  it('reads the stored value for the given feedId', () => {
    localStorage.setItem('feed-unread-only:1', 'on')
    const { result } = renderHook(() => useFeedUnreadOnly(1))
    expect(result.current[0]).toBe('on')
  })

  it('falls back to "off" for an invalid stored value', () => {
    localStorage.setItem('feed-unread-only:1', 'invalid')
    const { result } = renderHook(() => useFeedUnreadOnly(1))
    expect(result.current[0]).toBe('off')
  })

  it('persists a setter call under a feedId-scoped key', () => {
    const { result } = renderHook(() => useFeedUnreadOnly(1))
    act(() => result.current[1]('on'))
    expect(result.current[0]).toBe('on')
    expect(localStorage.getItem('feed-unread-only:1')).toBe('on')
  })

  it('returns "off" and never writes to storage when feedId is undefined', () => {
    const { result } = renderHook(() => useFeedUnreadOnly(undefined))
    expect(result.current[0]).toBe('off')

    act(() => result.current[1]('on'))
    expect(result.current[0]).toBe('off')
    expect(localStorage.length).toBe(0)
  })

  it('re-derives state per feedId and does not leak the previous feedId value (regression)', () => {
    localStorage.setItem('feed-unread-only:2', 'on')
    const { result, rerender } = renderHook(({ feedId }) => useFeedUnreadOnly(feedId), {
      initialProps: { feedId: 1 as number | undefined },
    })

    act(() => result.current[1]('on'))
    expect(result.current[0]).toBe('on')
    expect(localStorage.getItem('feed-unread-only:1')).toBe('on')

    rerender({ feedId: 2 })
    expect(result.current[0]).toBe('on')
    expect(localStorage.getItem('feed-unread-only:2')).toBe('on')

    rerender({ feedId: 3 })
    expect(result.current[0]).toBe('off')

    rerender({ feedId: undefined })
    expect(result.current[0]).toBe('off')
  })
})

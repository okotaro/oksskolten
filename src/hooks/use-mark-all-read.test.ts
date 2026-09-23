import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { MarkAllReadTarget } from '../../shared/types'

// --- Mocks ---

const mockApiPost = vi.fn()
vi.mock('../lib/fetcher', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}))

const mockGlobalMutate = vi.fn()
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return {
    ...actual,
    useSWRConfig: () => ({ mutate: mockGlobalMutate }),
  }
})

const { mockToast } = vi.hoisted(() => ({
  mockToast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('sonner', () => ({
  toast: mockToast,
}))

import { useMarkAllRead } from './use-mark-all-read'

type ToastAction = { label: string; onClick: () => void }
type ToastOptions = { duration?: number; action?: ToastAction }

function lastSuccessCall(): [string, ToastOptions | undefined] {
  const calls = mockToast.success.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1] as [string, ToastOptions | undefined]
}

function setup(overrides: Partial<Parameters<typeof useMarkAllRead>[0]> = {}) {
  const onMarkedLocally = vi.fn()
  const onUnmarkedLocally = vi.fn()
  const target: MarkAllReadTarget = { type: 'feed', id: 7 }
  const options = { target, onMarkedLocally, onUnmarkedLocally, ...overrides }
  const rendered = renderHook(() => useMarkAllRead(options))
  return { ...rendered, onMarkedLocally, onUnmarkedLocally, target: options.target }
}

/** Deferred promise so a request can be held in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useMarkAllRead', () => {
  beforeEach(() => {
    mockApiPost.mockReset()
    mockGlobalMutate.mockReset()
    mockToast.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
  })

  // Requirement 2.1, 2.3, 3.2, 4.1, 4.2, 4.3 — success with a non-empty result
  it('posts to the feed mark-all-seen endpoint, applies ids locally, revalidates feeds keys and shows an undoable toast', async () => {
    mockApiPost.mockResolvedValue({ updated: 3, ids: [11, 12, 13] })
    const { result, onMarkedLocally } = setup()

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/feeds/7/mark-all-seen')
    expect(onMarkedLocally).toHaveBeenCalledWith([11, 12, 13])

    expect(mockGlobalMutate).toHaveBeenCalled()
    const filter = mockGlobalMutate.mock.calls[0][0] as (key: unknown) => boolean
    expect(filter('/api/feeds')).toBe(true)
    expect(filter('/api/feeds?with_counts=1')).toBe(true)
    expect(filter('/api/articles?feed_id=7&unread=1')).toBe(false)
    expect(filter('/api/articles')).toBe(false)
    expect(filter(undefined)).toBe(false)

    const [message, options] = lastSuccessCall()
    expect(message).toContain('3')
    expect(options?.action).toBeTruthy()
    expect(typeof options?.action?.onClick).toBe('function')
    expect(options?.action?.label).toBeTruthy()
    expect(options?.duration).toBeGreaterThanOrEqual(10000)
  })

  it('posts to the category mark-all-seen endpoint when the target is a category', async () => {
    mockApiPost.mockResolvedValue({ updated: 1, ids: [99] })
    const { result } = setup({ target: { type: 'category', id: 42 } })

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/categories/42/mark-all-seen')
  })

  // Requirement 4.6 — zero target articles: notify without an undo action
  it('shows a toast without an undo action and does not reflect locally when there is nothing to mark', async () => {
    mockApiPost.mockResolvedValue({ updated: 0, ids: [] })
    const { result, onMarkedLocally } = setup()

    await act(async () => {
      await result.current.markAllRead()
    })

    const [message, options] = lastSuccessCall()
    expect(message).toBeTruthy()
    expect(options?.action).toBeUndefined()
    expect(onMarkedLocally).not.toHaveBeenCalled()
  })

  // Requirement 5.1, 5.3 — failure (including network failure) leaves local state untouched
  it('does not touch local read state and shows a failure toast when marking fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Network unreachable'))
    const { result, onMarkedLocally } = setup()

    await act(async () => {
      await result.current.markAllRead()
    })

    expect(onMarkedLocally).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledTimes(1)
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(mockGlobalMutate).not.toHaveBeenCalled()
  })

  // Requirement 4.4, 4.5 — undo posts the exact returned ids and restores local state
  it('undo posts the exact returned ids to batch-unseen, removes them locally and revalidates feeds keys', async () => {
    mockApiPost.mockResolvedValue({ updated: 2, ids: [21, 22] })
    const { result, onUnmarkedLocally } = setup()

    await act(async () => {
      await result.current.markAllRead()
    })

    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue({ updated: 2 })
    const [, options] = lastSuccessCall()

    await act(async () => {
      options?.action?.onClick()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/articles/batch-unseen', { ids: [21, 22] })
    })
    expect(onUnmarkedLocally).toHaveBeenCalledWith([21, 22])
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(2))
    expect(mockGlobalMutate).toHaveBeenCalledTimes(2)
    const undoFilter = mockGlobalMutate.mock.calls[1][0] as (key: unknown) => boolean
    expect(undoFilter('/api/feeds')).toBe(true)
    expect(undoFilter('/api/articles?feed_id=7')).toBe(false)
  })

  // Requirement 5.2 — undo failure restores the read-locally reflection
  it('restores ids to local read state and shows a failure toast when undo fails', async () => {
    mockApiPost.mockResolvedValue({ updated: 2, ids: [41, 42] })
    const { result, onMarkedLocally, onUnmarkedLocally } = setup()

    await act(async () => {
      await result.current.markAllRead()
    })
    expect(onMarkedLocally).toHaveBeenCalledTimes(1)

    mockApiPost.mockReset()
    mockApiPost.mockRejectedValue(new Error('boom'))
    const [, options] = lastSuccessCall()

    await act(async () => {
      options?.action?.onClick()
      await Promise.resolve()
    })

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1))
    expect(onUnmarkedLocally).toHaveBeenCalledWith([41, 42])
    expect(onMarkedLocally).toHaveBeenCalledTimes(2)
    expect(onMarkedLocally).toHaveBeenLastCalledWith([41, 42])
  })

  // Requirement 2.4 — duplicate calls while pending do not send a second request
  it('suppresses a duplicate call while the first markAllRead is still in flight', async () => {
    const first = deferred<{ updated: number; ids: number[] }>()
    mockApiPost.mockReturnValueOnce(first.promise)
    const { result } = setup()

    let pendingCall: Promise<void>
    act(() => {
      pendingCall = result.current.markAllRead()
    })

    await waitFor(() => expect(result.current.isPending).toBe(true))

    await act(async () => {
      await result.current.markAllRead()
    })
    expect(mockApiPost).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve({ updated: 1, ids: [51] })
      await pendingCall
    })

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })
})

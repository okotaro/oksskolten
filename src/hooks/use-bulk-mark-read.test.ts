import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { BulkReadScope } from '../../shared/types'

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

import { useBulkMarkRead } from './use-bulk-mark-read'

type ToastAction = { label: string; onClick: () => void }
type ToastOptions = { duration?: number; action?: ToastAction }

function lastSuccessCall(): [string, ToastOptions | undefined] {
  const calls = mockToast.success.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1] as [string, ToastOptions | undefined]
}

function setup(overrides: Partial<Parameters<typeof useBulkMarkRead>[0]> = {}) {
  const onMarkedLocally = vi.fn()
  const onUnmarkedLocally = vi.fn()
  const scope: BulkReadScope = { feed_id: 7, unread: true }
  const options = { scope, onMarkedLocally, onUnmarkedLocally, ...overrides }
  const rendered = renderHook(() => useBulkMarkRead(options))
  return { ...rendered, onMarkedLocally, onUnmarkedLocally, scope: options.scope }
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

describe('useBulkMarkRead', () => {
  beforeEach(() => {
    mockApiPost.mockReset()
    mockGlobalMutate.mockReset()
    mockToast.mockReset()
    mockToast.success.mockReset()
    mockToast.error.mockReset()
  })

  // Requirement 4.1, 4.2, 4.3 — 成功時の件数通知と取り消し手段
  it('posts the range-seen request, applies ids locally and shows an undoable toast', async () => {
    mockApiPost.mockResolvedValue({ updated: 3, ids: [11, 12, 13] })
    const { result, onMarkedLocally } = setup()

    await act(async () => {
      await result.current.markRange(11, 'newer')
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/articles/range-seen', {
      anchor_id: 11,
      direction: 'newer',
      scope: { feed_id: 7, unread: true },
    })
    expect(onMarkedLocally).toHaveBeenCalledWith([11, 12, 13])

    const [message, options] = lastSuccessCall()
    expect(message).toContain('3')
    expect(options?.action).toBeTruthy()
    expect(typeof options?.action?.onClick).toBe('function')
    expect(options?.action?.label).toBeTruthy()
    expect(options?.duration).toBeGreaterThanOrEqual(10000)
  })

  // Requirement 4.7 — 0件なら取り消し手段を提供しない
  it('shows a toast without an undo action when nothing was marked', async () => {
    mockApiPost.mockResolvedValue({ updated: 0, ids: [] })
    const { result, onMarkedLocally } = setup()

    await act(async () => {
      await result.current.markRange(11, 'older')
    })

    const [message, options] = lastSuccessCall()
    expect(message).toBeTruthy()
    expect(options?.action).toBeUndefined()
    expect(onMarkedLocally).not.toHaveBeenCalled()
  })

  // Requirement 3.3 + design Key Decision — 未読件数のキーだけを再検証する
  it('revalidates unread-count keys only and never the article list keys', async () => {
    mockApiPost.mockResolvedValue({ updated: 2, ids: [1, 2] })
    const { result } = setup()

    await act(async () => {
      await result.current.markRange(1, 'newer')
    })

    expect(mockGlobalMutate).toHaveBeenCalled()
    const filter = mockGlobalMutate.mock.calls[0][0] as (key: unknown) => boolean
    expect(filter('/api/feeds')).toBe(true)
    expect(filter('/api/feeds?with_counts=1')).toBe(true)
    expect(filter('/api/articles?feed_id=7&unread=1')).toBe(false)
    expect(filter('/api/articles')).toBe(false)
    expect(filter(undefined)).toBe(false)
  })

  // Requirement 4.4, 4.6 — 取り消しは応答で受け取ったIDをそのまま送り返す
  it('undo posts the exact returned ids to batch-unseen and removes them locally', async () => {
    mockApiPost.mockResolvedValue({ updated: 2, ids: [21, 22] })
    const { result, onUnmarkedLocally } = setup()

    await act(async () => {
      await result.current.markRange(21, 'newer')
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
    // Requirement 4.6 — 未読件数も操作前の値へ戻す
    expect(mockGlobalMutate).toHaveBeenCalledTimes(2)
    const undoFilter = mockGlobalMutate.mock.calls[1][0] as (key: unknown) => boolean
    expect(undoFilter('/api/feeds')).toBe(true)
    expect(undoFilter('/api/articles?feed_id=7')).toBe(false)
  })

  // Requirement 5.1, 5.4 — 失敗時はローカル既読状態を変えず、保留もしない
  it('does not touch local read state and shows a failure toast when marking fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Network unreachable'))
    const { result, onMarkedLocally } = setup()

    await act(async () => {
      await result.current.markRange(31, 'older')
    })

    expect(onMarkedLocally).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledTimes(1)
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(mockGlobalMutate).not.toHaveBeenCalled()
  })

  // Requirement 5.2 — 取り消し失敗時は取り除いたIDを戻す
  it('restores ids to local read state and notifies when undo fails', async () => {
    mockApiPost.mockResolvedValue({ updated: 2, ids: [41, 42] })
    const { result, onMarkedLocally, onUnmarkedLocally } = setup()

    await act(async () => {
      await result.current.markRange(41, 'newer')
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

  // Requirement 5.5, 6.4 — 進行中の同一組は重複要求を送らない
  it('suppresses a duplicate request for the same anchor and direction while in flight', async () => {
    const first = deferred<{ updated: number; ids: number[] }>()
    mockApiPost.mockReturnValueOnce(first.promise)
    const { result } = setup()

    let pendingCall: Promise<void>
    act(() => {
      pendingCall = result.current.markRange(51, 'newer')
    })

    await waitFor(() => expect(result.current.isPending(51, 'newer')).toBe(true))
    expect(result.current.isPending(51, 'older')).toBe(false)
    expect(result.current.isPending(52, 'newer')).toBe(false)

    await act(async () => {
      await result.current.markRange(51, 'newer')
    })
    expect(mockApiPost).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve({ updated: 1, ids: [51] })
      await pendingCall
    })

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.isPending(51, 'newer')).toBe(false))
  })

  // Requirement 2.4 経路 — 渡された絞り込みをそのまま送る
  it('forwards the scope verbatim in the request body', async () => {
    mockApiPost.mockResolvedValue({ updated: 0, ids: [] })
    const scope: BulkReadScope = { category_id: 3 }
    const { result } = setup({ scope })

    await act(async () => {
      await result.current.markRange(61, 'older')
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/articles/range-seen', {
      anchor_id: 61,
      direction: 'older',
      scope: { category_id: 3 },
    })
    expect(mockApiPost.mock.calls[0][1].scope).toBe(scope)
  })
})

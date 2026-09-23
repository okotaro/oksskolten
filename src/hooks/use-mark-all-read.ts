import { useCallback, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { apiPost } from '../lib/fetcher'
import { useI18n } from '../lib/i18n'
import type { BatchUnseenRequest, BatchUnseenResponse, MarkAllReadTarget, MarkAllSeenResponse } from '../../shared/types'

/** Undo must stay available for at least 10 seconds after the operation. */
const UNDO_TOAST_DURATION_MS = 10_000

export interface UseMarkAllReadOptions {
  target: MarkAllReadTarget
  /** Reflects newly-read ids in the visible list without refetching. */
  onMarkedLocally: (ids: number[]) => void
  /** Reverts the local reflection when the operation is undone or fails. */
  onUnmarkedLocally: (ids: number[]) => void
}

export interface UseMarkAllReadResult {
  markAllRead: () => Promise<void>
  isPending: boolean
}

function markAllSeenUrl(target: MarkAllReadTarget): string {
  return target.type === 'feed' ? `/api/feeds/${target.id}/mark-all-seen` : `/api/categories/${target.id}/mark-all-seen`
}

/**
 * Owns the side effects of mark-all-read for a single feed or category: request,
 * notification, undo and revalidation. The locally-read id state itself belongs
 * to the caller and is updated through the supplied callbacks.
 *
 * There is exactly one possible in-flight operation per hook instance (a single
 * button), so a plain boolean guards duplicate calls instead of a keyed set.
 *
 * The undo logic here intentionally duplicates use-bulk-mark-read.ts's undoRange
 * rather than sharing a core hook: that hook's pending state is a keyed Set (per
 * anchor/direction), while this one is a single flag, so forcing both into one
 * abstraction would be an abstraction for its own sake. See research.md.
 */
export function useMarkAllRead({ target, onMarkedLocally, onUnmarkedLocally }: UseMarkAllReadOptions): UseMarkAllReadResult {
  const { t } = useI18n()
  const { mutate: globalMutate } = useSWRConfig()

  // The ref is the source of truth for duplicate suppression because a second
  // call in the same tick would not yet observe the state update. The state
  // mirror only exists so consumers re-render when the operation starts/ends.
  const inFlight = useRef(false)
  const [isPending, setIsPending] = useState(false)

  // Revalidate only the keys that serve unread counts. The article list keys are
  // deliberately left alone: refetching them in an unread-only view would drop
  // the affected rows and make the undo unusable.
  const revalidateUnreadCounts = useCallback(() => {
    void globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feeds'))
  }, [globalMutate])

  const undo = useCallback(
    async (ids: number[]): Promise<void> => {
      // Optimistically restore the read look, then put it back if the request fails.
      onUnmarkedLocally(ids)
      const body: BatchUnseenRequest = { ids }
      try {
        await (apiPost('/api/articles/batch-unseen', body) as Promise<BatchUnseenResponse>)
        revalidateUnreadCounts()
        toast.success(t('toast.bulkUndone'))
      } catch {
        onMarkedLocally(ids)
        toast.error(t('toast.bulkUndoFailed'))
      }
    },
    [onMarkedLocally, onUnmarkedLocally, revalidateUnreadCounts, t],
  )

  const markAllRead = useCallback(async (): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setIsPending(true)

    try {
      const res = (await apiPost(markAllSeenUrl(target))) as MarkAllSeenResponse
      const ids = res?.ids ?? []
      if (ids.length > 0) {
        onMarkedLocally(ids)
        revalidateUnreadCounts()
        toast.success(t('toast.bulkMarkedRead', { count: String(res.updated) }), {
          duration: UNDO_TOAST_DURATION_MS,
          action: {
            label: t('toast.bulkUndo'),
            onClick: () => {
              void undo(ids)
            },
          },
        })
      } else {
        // Nothing was newly marked, so there is nothing to undo.
        toast.success(t('toast.bulkMarkedNone'))
      }
    } catch {
      // No offline queueing: an unreachable network is a plain failure and the
      // locally-read state stays untouched (nothing was optimistically applied).
      toast.error(t('toast.bulkMarkReadFailed'))
    } finally {
      inFlight.current = false
      setIsPending(false)
    }
  }, [onMarkedLocally, revalidateUnreadCounts, t, target, undo])

  return { markAllRead, isPending }
}

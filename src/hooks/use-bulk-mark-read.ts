import { useCallback, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { apiPost } from '../lib/fetcher'
import { useI18n } from '../lib/i18n'
import type {
  BatchUnseenRequest,
  BatchUnseenResponse,
  BulkReadDirection,
  BulkReadScope,
  RangeSeenRequest,
  RangeSeenResponse,
} from '../../shared/types'

/** Undo must stay available for at least 10 seconds after the operation. */
const UNDO_TOAST_DURATION_MS = 10_000

export interface UseBulkMarkReadOptions {
  /** Filter that limits the bulk range. Pass the article list's current conditions as-is. */
  scope: BulkReadScope
  /** Add ids to the locally-read state so the rows switch to the read look immediately. */
  onMarkedLocally: (ids: number[]) => void
  /** Remove ids from the locally-read state. Called when the operation is undone. */
  onUnmarkedLocally: (ids: number[]) => void
}

export interface UseBulkMarkReadResult {
  /** Mark a range read, given an anchor article and a direction. */
  markRange: (anchorId: number, direction: BulkReadDirection) => Promise<void>
  /** Whether that anchor/direction pair is in flight. Used to disable the menu item. */
  isPending: (anchorId: number, direction: BulkReadDirection) => boolean
}

function pendingKey(anchorId: number, direction: BulkReadDirection): string {
  return `${anchorId}:${direction}`
}

/**
 * Owns the side effects of bulk mark-as-read: request, notification, undo and
 * revalidation. The locally-read id state itself belongs to the caller and is
 * updated through the supplied callbacks.
 */
export function useBulkMarkRead({
  scope,
  onMarkedLocally,
  onUnmarkedLocally,
}: UseBulkMarkReadOptions): UseBulkMarkReadResult {
  const { t } = useI18n()
  const { mutate: globalMutate } = useSWRConfig()

  // The ref is the source of truth for duplicate suppression because a second
  // call in the same tick would not yet observe the state update. The state
  // mirror only exists so consumers re-render when a pair starts or finishes.
  const inFlight = useRef<Set<string>>(new Set())
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set<string>())

  const syncPending = useCallback(() => {
    setPendingKeys(new Set(inFlight.current))
  }, [])

  // Revalidate only the keys that serve unread counts. The article list keys are
  // deliberately left alone: refetching them in an unread-only view would drop
  // the affected rows and make the undo unusable.
  const revalidateUnreadCounts = useCallback(() => {
    void globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feeds'))
  }, [globalMutate])

  const undoRange = useCallback(
    async (ids: number[]): Promise<void> => {
      // Optimistically drop the ids, then put them back if the request fails.
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

  const markRange = useCallback(
    async (anchorId: number, direction: BulkReadDirection): Promise<void> => {
      const key = pendingKey(anchorId, direction)
      if (inFlight.current.has(key)) return
      inFlight.current.add(key)
      syncPending()

      const body: RangeSeenRequest = { anchor_id: anchorId, direction, scope }
      try {
        const res = (await apiPost('/api/articles/range-seen', body)) as RangeSeenResponse
        const ids = res?.ids ?? []
        if (ids.length > 0) {
          onMarkedLocally(ids)
          revalidateUnreadCounts()
          toast.success(t('toast.bulkMarkedRead', { count: String(res.updated) }), {
            duration: UNDO_TOAST_DURATION_MS,
            action: {
              label: t('toast.bulkUndo'),
              onClick: () => {
                void undoRange(ids)
              },
            },
          })
        } else {
          // Nothing was newly marked, so there is nothing to undo.
          toast.success(t('toast.bulkMarkedNone'))
        }
      } catch {
        // No offline queueing: an unreachable network is a plain failure and the
        // locally-read state stays untouched.
        toast.error(t('toast.bulkMarkReadFailed'))
      } finally {
        inFlight.current.delete(key)
        syncPending()
      }
    },
    [onMarkedLocally, revalidateUnreadCounts, scope, syncPending, t, undoRange],
  )

  const isPending = useCallback(
    (anchorId: number, direction: BulkReadDirection): boolean =>
      pendingKeys.has(pendingKey(anchorId, direction)),
    [pendingKeys],
  )

  return { markRange, isPending }
}

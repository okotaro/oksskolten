import { useState, useEffect, useCallback } from 'react'

export type FeedUnreadOnlyState = 'on' | 'off'

const STORAGE_KEY_PREFIX = 'feed-unread-only:'

function storageKey(feedId: number): string {
  return `${STORAGE_KEY_PREFIX}${feedId}`
}

function readStored(feedId: number): FeedUnreadOnlyState {
  const stored = localStorage.getItem(storageKey(feedId))
  return stored === 'on' ? 'on' : 'off'
}

/**
 * Tracks the "show all" / "show unread only" display state for an individual
 * feed, persisted to localStorage under a per-feedId key.
 *
 * This intentionally does NOT build on `createLocalStorageHook`: that factory
 * fixes its storage key in a closure and only reads it once, via useState's
 * lazy initializer, so it would not re-derive when `feedId` changes across
 * re-renders of the same hook instance (the consuming route does not remount
 * on feed navigation). Instead, a `useEffect` keyed on `feedId` re-derives
 * the state on every feed change, mirroring the existing feed/category reset
 * effect in `src/components/article/article-list.tsx`.
 *
 * When `feedId` is `undefined` (not on an individual feed page), the state is
 * always `'off'` and the setter never writes to storage.
 */
export function useFeedUnreadOnly(
  feedId: number | undefined,
): [FeedUnreadOnlyState, (next: FeedUnreadOnlyState) => void] {
  const [state, setState] = useState<FeedUnreadOnlyState>(() =>
    feedId === undefined ? 'off' : readStored(feedId),
  )

  // Re-derive the state whenever feedId changes, so a value from the
  // previous feedId is never carried over to the new one.
  useEffect(() => {
    setState(feedId === undefined ? 'off' : readStored(feedId))
  }, [feedId])

  const setFeedUnreadOnly = useCallback(
    (next: FeedUnreadOnlyState) => {
      // When feedId is undefined, the state must always stay 'off' and
      // nothing is persisted: ignore the call entirely.
      if (feedId === undefined) return
      setState(next)
      localStorage.setItem(storageKey(feedId), next)
    },
    [feedId],
  )

  return [state, setFeedUnreadOnly]
}

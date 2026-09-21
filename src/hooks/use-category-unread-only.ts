import { useState, useEffect, useCallback } from 'react'

export type CategoryUnreadOnly = 'on' | 'off'

const STORAGE_KEY_PREFIX = 'category-unread-only:'
const LEGACY_STORAGE_KEY = 'category-unread-only'

function storageKey(categoryId: number): string {
  return `${STORAGE_KEY_PREFIX}${categoryId}`
}

function readLegacy(): CategoryUnreadOnly {
  const stored = localStorage.getItem(LEGACY_STORAGE_KEY)
  return stored === 'on' ? 'on' : 'off'
}

function readStored(categoryId: number): CategoryUnreadOnly {
  const stored = localStorage.getItem(storageKey(categoryId))
  if (stored === 'on' || stored === 'off') return stored
  // No (valid) per-category value yet: fall back to the legacy global value
  // left behind by the removed global setting. Read-only; never written back.
  return readLegacy()
}

/**
 * Tracks the "show all" / "show unread only" display state for an individual
 * category (folder), persisted to localStorage under a per-categoryId key.
 *
 * This intentionally does NOT build on `createLocalStorageHook`, for the same
 * reason as `use-feed-unread-only.ts`: that factory fixes its storage key in
 * a closure and only reads it once via useState's lazy initializer, so it
 * would not re-derive when `categoryId` changes across re-renders of the same
 * hook instance (the consuming route does not remount on category
 * navigation). Instead, a `useEffect` keyed on `categoryId` re-derives the
 * state on every category change.
 *
 * When no value is stored under the per-category key, this falls back to the
 * legacy `localStorage` key (`'category-unread-only'`, with no suffix) that
 * the old global setting used to write. That fallback is read-only: this
 * hook never writes to the legacy key. Once a per-category value has been
 * stored, it always takes priority over the legacy value for that category.
 *
 * When `categoryId` is `undefined` (not on a category page), the state is
 * always `'off'` and the setter never writes to storage.
 */
export function useCategoryUnreadOnly(
  categoryId: number | undefined,
): [CategoryUnreadOnly, (next: CategoryUnreadOnly) => void] {
  const [state, setState] = useState<CategoryUnreadOnly>(() =>
    categoryId === undefined ? 'off' : readStored(categoryId),
  )

  // Re-derive the state whenever categoryId changes, so a value from the
  // previous categoryId is never carried over to the new one.
  useEffect(() => {
    setState(categoryId === undefined ? 'off' : readStored(categoryId))
  }, [categoryId])

  const setCategoryUnreadOnly = useCallback(
    (next: CategoryUnreadOnly) => {
      // When categoryId is undefined, the state must always stay 'off' and
      // nothing is persisted: ignore the call entirely.
      if (categoryId === undefined) return
      setState(next)
      localStorage.setItem(storageKey(categoryId), next)
    },
    [categoryId],
  )

  return [state, setCategoryUnreadOnly]
}

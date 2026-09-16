# Oksskolten Spec — Feed Unread-Only Toggle

> [Back to Overview](./01_overview.md)

## Overview

Each individual feed's article list can be switched between "Show all" and "Show unread only". The choice is remembered per feed in the browser's local storage and restored when the same feed is revisited on the same device.

## Motivation

When a feed mixes read and unread articles, scanning only unread titles is difficult — read articles sit between the ones you actually want to check. Oksskolten already has an unread-only filter for the Inbox (always on) and for category views (a global setting, `reading.category_unread_only`), but individual feed pages had no equivalent, forcing users to scan the full mixed list.

## Design

### Persistence

`useFeedUnreadOnly(feedId)` (`src/hooks/use-feed-unread-only.ts`) is a `localStorage`-backed hook keyed per feed id (`feed-unread-only:{feedId}`). It deliberately does not build on `createLocalStorageHook` (`src/hooks/create-local-storage-hook.ts`), which fixes its storage key in a closure and only reads it once via `useState`'s lazy initializer. Since `ArticleList` never remounts when navigating between `/feeds/:id` routes (no `key` prop on the route), a hook built that way would leak the previous feed's value into the next one. Instead, the hook re-derives its state from storage inside a `useEffect` keyed on `feedId` — the same pattern `ArticleList` already uses to reset other per-feed local state (`showReadArticles`, `noFloor`, `locallyReadIds`) on feed change. Passing `feedId=undefined` (any non-individual-feed view) always returns `'off'` and never touches storage. There is no cross-device sync.

### Where It Appears

The toggle only appears on an individual feed's article list (`/feeds/:feedId`, excluding the clip feed) — not on the Inbox, category views, Bookmarks, Likes, History, or Clips. `isPlainFeedView` in `article-list.tsx` is computed from the raw route param (`feedIdParam`), not the feed id used internally for the clip view, so it correctly excludes clips.

### Filtering & Empty State

When on, the toggle composes into the same `unreadOnly` flag the Inbox and category-unread-only settings already use, which is passed to `GET /api/articles` as `unread=1` — no server or API change was needed. If a feed has zero unread articles while the toggle is on, the article list reuses the existing "all caught up" empty state (`articles.allRead` / `articles.showReadArticles`) rather than introducing new copy for what is functionally the same situation as the category-level case.

### Pagination & Scroll Reset

Toggling calls `setSize(1)` on the list's `useSWRInfinite` state and scrolls to the top (`window.scrollTo(0, 0)`), mirroring the existing retry-button behavior and the scroll-restoration approach used elsewhere (`src/hooks/use-scroll-restoration.ts`). Without this, switching filters mid-scroll would refetch every previously-loaded page under the new filter instead of starting from the top.

### UI

`FeedUnreadOnlyToggle` (`src/components/article/feed-unread-only-toggle.tsx`) is presentation-only — it takes `{ unreadOnly, onToggle }` and renders a small text-link control (the same visual idiom as the existing "Show read articles" link), showing the label for the state you'd switch *to*. It renders independently of the `showFeedActivity` setting that gates `FeedMetricsBar`, so it stays visible even when that setting is off.

### Out of Scope

- Category views (the existing global `reading.category_unread_only` setting is unchanged)
- Cross-device or server-side sync of the toggle state
- Filtering by anything other than unread (favorites, likes, read)
- Any change to how articles are marked read/unread (see Bulk Mark-as-Read)

### Key Files

| File | Purpose |
|---|---|
| `src/hooks/use-feed-unread-only.ts` | Per-feed `'on'`/`'off'` state, `localStorage`-backed, re-derives on `feedId` change |
| `src/components/article/feed-unread-only-toggle.tsx` | Presentation-only toggle control |
| `src/components/article/article-list.tsx` | `isPlainFeedView` scoping, `unreadOnly` composition, pagination/scroll reset, empty-state reuse |
| `src/lib/i18n.ts` | Toggle labels (`feed.unreadOnlyToggle.showUnreadOnly`/`showAll`) |

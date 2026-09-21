# Oksskolten Spec — Category (Folder) Unread-Only Toggle

> [Back to Overview](./01_overview.md)

## Overview

Each category's ("folder's") article list can be switched between "Show all" and "Show unread only". The choice is remembered per category in the browser's local storage and restored when the same category is revisited on the same device — the same experience [Feed Unread-Only Toggle](./87_feature_feed_unread_only.md) already provides for individual feeds.

This feature replaces the previous global "Show only unread in categories" setting (a single on/off switch in Settings, synced across devices, applied to every category at once).

## Motivation

The global category setting had no per-category memory and no way to see the current state at a glance — it was one switch for every category, plus a one-shot "Show read articles" link (not persisted, reset on every navigation) to peek at read articles while the switch was on. Individual feeds already had a better pattern — a persistent, per-feed, visibly-stated toggle — so categories were given the same treatment, and the old global mechanism was retired rather than kept alongside it.

## Design

### Persistence

`useCategoryUnreadOnly(categoryId)` (`src/hooks/use-category-unread-only.ts`) is a `localStorage`-backed hook keyed per category id (`category-unread-only:{categoryId}`), structurally identical to `useFeedUnreadOnly` — it re-derives its state from storage inside a `useEffect` keyed on `categoryId` rather than building on `createLocalStorageHook`, for the same reason: `ArticleList` never remounts when navigating between `/categories/:id` routes.

**Migration fallback**: when no per-category value has been stored yet, the hook falls back to the last value left behind by the old global setting's `localStorage` mirror (the bare key `category-unread-only`, interpreted as on only if exactly `'on'`). This fallback is read-only — the hook never writes to that legacy key — so once a category's state has been explicitly set, it always wins over the legacy value, and an untouched category keeps reading whatever the legacy key held at the time this feature shipped (nothing writes to it anymore).

### Where It Appears

The toggle appears only on a category's article list (`/categories/:categoryId`) — not on the Inbox, individual feeds, Bookmarks, Likes, History, or Clips.

### Filtering & Empty State

When on, the toggle composes into the same `unreadOnly` flag the Inbox and individual-feed toggle already use, passed to `GET /api/articles` as `unread=1` — no server or API change was needed. If a category has zero unread articles while the toggle is on, the article list reuses the same "all caught up" empty state as the feed toggle (`articles.allRead` / `articles.showReadArticles`).

### Pagination & Scroll Reset

Toggling calls `setSize(1)` on the list's `useSWRInfinite` state and scrolls to the top (`window.scrollTo(0, 0)`), identical to the feed toggle's behavior.

### UI

`CategoryUnreadOnlyToggle` (`src/components/article/category-unread-only-toggle.tsx`) is presentation-only, mirroring `FeedUnreadOnlyToggle` — it takes `{ unreadOnly, onToggle }` and shows the label for the state you'd switch *to*.

### Removed: Global Setting

The Settings screen's "Show only unread in categories" control, its sync wiring (`use-settings.ts`), and the server preference key (`reading.category_unread_only`) have all been removed.

### Out of Scope

- Individual feeds (see [Feed Unread-Only Toggle](./87_feature_feed_unread_only.md)), Inbox, Bookmarks, Likes, History, Clips
- Cross-device or server-side sync of the per-category toggle state (the one-time legacy-value fallback is local only)
- Filtering by anything other than unread (favorites, likes, read)
- Category (folder) creation, editing, or deletion

### Key Files

| File | Purpose |
|---|---|
| `src/hooks/use-category-unread-only.ts` | Per-category `'on'`/`'off'` state, `localStorage`-backed, re-derives on `categoryId` change, falls back to the legacy global value |
| `src/components/article/category-unread-only-toggle.tsx` | Presentation-only toggle control |
| `src/components/article/article-list.tsx` | Category-page scoping, `unreadOnly` composition, pagination/scroll reset, empty-state reuse |
| `src/lib/i18n.ts` | Toggle labels (`category.unreadOnlyToggle.showUnreadOnly`/`showAll`) |

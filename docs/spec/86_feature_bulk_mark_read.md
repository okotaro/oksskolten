# Oksskolten Spec — Bulk Mark-as-Read

> [Back to Overview](./01_overview.md)

## Overview

Right-clicking an article card in the Inbox, a feed view (including clips), or a category view offers "Mark above (newer) as read" and "Mark below (older) as read". Either choice marks every unread article on that side of the clicked article — not just the ones currently rendered — as read in one request, with a 10-second undo.

## Motivation

Before this feature, a user who wanted to stop reading partway down a list had three options: open each article individually, rely on scroll-triggered auto-read (which only covers what has actually scrolled past), or mark an entire feed as read (which also marks unread articles the user never saw). None of these let the unread count track what the user actually decided to skip.

## Design

### Direction Resolution

The target set is resolved from the anchor article's `published_at` and the chosen direction, not from which rows happen to be mounted in the DOM. This lets the operation cover articles that have not been paginated in yet.

| Anchor `published_at` | Direction | Target predicate |
|---|---|---|
| present | `newer` | `published_at IS NOT NULL AND published_at >= anchor` |
| present | `older` | `published_at IS NULL OR published_at <= anchor` |
| absent | `newer` | no additional predicate (article list order places undated articles last, so "newer" covers everything) |
| absent | `older` | `published_at IS NULL` |

Articles sharing the anchor's exact `published_at` are included in both directions, since the article list has no secondary sort key to break the tie. The anchor article itself always matches its own predicate. The current list filter (feed, category, unread-only) is applied on top via the same `buildArticleConditions()` helper the article list's own fetch uses, and `published_at` is stored as an ISO-8601 UTC string, so a lexicographic comparison is a chronological comparison. Already-read articles are excluded from the target set, so their `seen_at` never changes.

### API

**POST /api/articles/range-seen** — Mark a range as read

```json
// Request
{ "anchor_id": 123, "direction": "newer", "scope": { "feed_id": 7 } }

// Response: 200
{ "updated": 42, "ids": [123, 124, ...] }
```

`scope` accepts `feed_id`, `category_id`, and `unread` (all optional; defaults to `{}`). `direction` is `"newer"` or `"older"`. Returns `404` and changes nothing if the anchor article does not exist or has been purged. `ids` lists every article newly marked read, so the response is a complete undo token — no separate lookup is needed. There is no item-count cap: the identifier-set and update statements are chunked internally (500 ids per batch) so the operation cannot exceed the libsql bind-parameter ceiling (empirically 32766) regardless of scale.

**POST /api/articles/batch-unseen** — Undo a bulk mark-as-read

```json
// Request
{ "ids": [123, 124, 125] }

// Response: 200
{ "updated": 3 }
```

Clears both `seen_at` and `read_at` for the given ids and recomputes their score (the score expression reads `read_at`). Maximum 50,000 ids per request — high enough to always cover a single `range-seen` response, since `range-seen` itself has no cap below that. Ids that do not resolve to an existing, non-purged article are silently ignored. Like `range-seen`, the identifier resolution and update are chunked internally.

### Client

`useBulkMarkRead` (`src/hooks/use-bulk-mark-read.ts`) owns the request, notification, undo, and revalidation side effects. The locally-read id set itself is owned by the caller and updated through `onMarkedLocally`/`onUnmarkedLocally` callbacks, so it can be the same state the article list already uses for scroll auto-read.

- **Optimistic locally-read state, not a list refetch.** On success the returned ids are added to the caller's locally-read state directly. Only the unread-count SWR keys (`/api/feeds*`) are revalidated — the article list's own key is deliberately left alone, since refetching it under an unread-only filter would make the just-marked rows disappear and the undo action meaningless.
- **Undo.** The toast carries the same ids back to `batch-unseen`; a successful undo removes them from the locally-read state, a failed one puts them back. No response with zero updated articles offers an undo, since there is nothing to undo.
- **Duplicate suppression.** A same anchor/direction pair already in flight is a no-op until the first call settles, so re-selecting the same menu item mid-request cannot fire twice.
- **No offline queueing.** An unreachable network is treated as a plain failure; the request is not retried or held for later delivery.

### UI

`ArticleContextMenu` (`src/components/article/article-context-menu.tsx`) is presentation-only — it renders the two menu items and calls back to whichever handlers it is given, resolving nothing itself. `article-list.tsx` wraps the card with it only when `!isTouchDevice && !isBookmarks && !isLikes && !isHistory` — an explicit enumeration of the three excluded collection views, deliberately not inferred from the presence of a feed id, since the clip list sets one internally and would otherwise look indistinguishable from a feed view. The `scope` passed to the hook is built from the same values the list already sends to its own `/api/articles` fetch: unread-only in the Inbox, the feed id in a feed or clip view, and the category id plus its unread-only setting in a category view. Whichever direction is in flight has its own menu item disabled.

### Demo Mode

`src/lib/demo/demo-store.ts` implements `markSeenByRange` and `batchUnseen` against the in-memory article array, following the same direction-resolution table as the server DB layer above (verified with the same four-combination cases on both sides, since the rule is otherwise duplicated). `src/lib/demo/mock-api.ts` intercepts both paths and returns the identical response shape and 404 behavior the production route does, so the client hook runs unmodified against either backend.

### Out of Scope

- Any invocation surface other than right-click (a menu icon, a swipe gesture, a keyboard shortcut)
- Touch devices
- The bookmarks, favorites (likes), and read-articles collection views
- Checkbox-based multi-select range operations
- Any bulk operation other than mark-as-read (unread, bookmark, like, delete)
- Holding a bulk request for later delivery while offline
- Batching the undo path's search-index sync (`server/search/sync.ts`) into fewer calls — each undone article currently syncs to the search index individually

### Key Files

| File | Purpose |
|---|---|
| `shared/types.ts` | `BulkReadDirection`, `BulkReadScope`, `RangeSeenRequest/Response`, `BatchUnseenRequest/Response` |
| `server/db/articles.ts` | `markArticlesSeenByRange`, `markArticlesUnseen`, and the shared `buildArticleConditions` filter builder |
| `server/routes/articles.ts` | `POST /api/articles/range-seen`, `POST /api/articles/batch-unseen` |
| `src/hooks/use-bulk-mark-read.ts` | Request, undo, notification, and revalidation logic |
| `src/components/article/article-context-menu.tsx` | Right-click menu presentation |
| `src/components/article/article-list.tsx` | View-based menu gating, per-screen scope, locally-read state |
| `src/lib/demo/demo-store.ts` | Demo-mode target resolution and undo |
| `src/lib/demo/mock-api.ts` | Demo-mode route interception |
| `src/lib/i18n.ts` | Menu and toast strings (`articles.markReadAbove`/`markReadBelow`, `toast.bulkMarkedRead`/`bulkMarkedNone`/`bulkMarkReadFailed`/`bulkUndo`/`bulkUndone`/`bulkUndoFailed`) |

# Oksskolten Spec — Mark-All-Read Button

> [Back to Overview](./01_overview.md)

## Overview

A one-click button in the header of an individual feed's or category's article list marks every unread article in that scope as read immediately, with a toast confirming the count and a 10-second undo.

## Motivation

Previously, the only way to mark an entire feed or folder as read was the sidebar's right-click context menu — even while already viewing that feed/folder's article list, the user had to locate the same item in the sidebar again. This button removes that detour by adding the same action directly to the screen already being viewed.

## Design

### Reused mark-all-seen endpoints

`POST /api/feeds/:id/mark-all-seen` and `POST /api/categories/:id/mark-all-seen` already existed to power the sidebar's context-menu action. This feature only extends their JSON response to include `ids: number[]` — the article IDs newly marked read — alongside the existing `updated` count, so the returned IDs can be fed straight into the existing `POST /api/articles/batch-unseen` endpoint for undo. No new endpoint was introduced. See [20_api.md](./20_api.md) for the updated response shape.

### Client hook: `useMarkAllRead`

`src/hooks/use-mark-all-read.ts` owns execution, notification, and undo for a single feed-or-category target (`MarkAllReadTarget`, `shared/types.ts`). It deliberately does not share code with `useBulkMarkRead` (`src/hooks/use-bulk-mark-read.ts`; see [86_feature_bulk_mark_read.md](./86_feature_bulk_mark_read.md)), even though both show a toast with a 10-second undo action against `POST /api/articles/batch-unseen`: the two hooks track fundamentally different pending-state shapes (a single boolean here vs. a keyed set of in-flight anchor/direction pairs there), so duplicating roughly ten lines of undo logic was judged simpler than building a shared abstraction with only one caller each.

Like `useBulkMarkRead`, the hook revalidates only SWR keys prefixed `/api/feeds` after a mark or an undo — never the article list itself (`/api/articles`) — so articles marked read while "unread only" is active stay visible with their read styling instead of disappearing from the list mid-undo-window.

### UI placement

`MarkAllReadButton` (`src/components/article/mark-all-read-button.tsx`) renders in the same header slot as the existing feed/category unread-only toggle (see [87_feature_feed_unread_only.md](./87_feature_feed_unread_only.md), [88_feature_category_unread_only.md](./88_feature_category_unread_only.md)), wired in `ArticleListPage` (`src/app.tsx`). It appears only on `/feeds/:feedId` and `/categories/:categoryId` — never on Inbox, Bookmarks, Likes, History, or Clips — and stays visible regardless of the unread-only toggle's state. It reuses the sidebar context menu's existing labels (`feeds.markAllRead` / `category.markAllRead`) and the bulk mark-as-read feature's existing toast strings (`toast.bulkMarkedRead`, `toast.bulkMarkedNone`, `toast.bulkMarkReadFailed`, `toast.bulkUndo`, `toast.bulkUndone`, `toast.bulkUndoFailed`) — no new i18n keys were needed.

### Local read-state reflection

`ArticleListHandle` (`src/components/article/article-list.tsx`) exposes `markLocallyRead`/`unmarkLocallyRead`, delegating to the same `locallyReadIds` overlay that scroll auto-read and bulk mark-as-read already share — so all three ways of marking articles read look identical without ever triggering a refetch.

### Out of Scope

- A button on the Inbox (all-feeds) view
- Any change to the sidebar's right-click "mark all read" menu items
- Article-range bulk mark-as-read (see [86_feature_bulk_mark_read.md](./86_feature_bulk_mark_read.md))
- A confirmation dialog before marking (matches the sidebar's existing no-confirmation behavior; the undo window covers accidental clicks instead)

### Key Files

| File | Purpose |
|---|---|
| `src/hooks/use-mark-all-read.ts` | Execution, toast notification, 10-second undo, duplicate-click guard |
| `src/components/article/mark-all-read-button.tsx` | Header button UI |
| `src/components/article/article-list.tsx` | `ArticleListHandle.markLocallyRead`/`unmarkLocallyRead` |
| `server/db/articles.ts`, `server/db/categories.ts` | `markAllSeenByFeed`/`markAllSeenByCategory` extended to return affected article IDs |
| `src/app.tsx` | Header wiring (`ArticleListPage`) |

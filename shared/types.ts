// Shared type definitions for Feed, Category, Article and related types.
// Canonical source of truth — server/db.ts re-exports these.

export interface Category {
  id: number
  name: string
  sort_order: number
  collapsed: number
  created_at: string
}

export interface Feed {
  id: number
  name: string
  url: string
  rss_url: string | null
  rss_bridge_url: string | null
  category_id: number | null
  last_error: string | null
  error_count: number
  disabled: number
  requires_js_challenge: number
  type: 'rss' | 'clip'
  etag: string | null
  last_modified: string | null
  last_content_hash: string | null
  next_check_at: string | null
  check_interval: number | null
  created_at: string
}

export interface FeedWithCounts extends Feed {
  category_name: string | null
  article_count: number
  unread_count: number
  articles_per_week: number
  latest_published_at: string | null
}

export interface Article {
  id: number
  feed_id: number
  title: string
  url: string
  published_at: string | null
  lang: string | null
  full_text: string | null
  full_text_translated: string | null
  translated_lang: string | null
  summary: string | null
  og_image: string | null
  last_error: string | null
  retry_count: number
  last_retry_at: string | null
  fetched_at: string
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  created_at: string
}

export interface ArticleListItem {
  id: number
  feed_id: number
  feed_name: string
  title: string
  url: string
  published_at: string | null
  lang: string | null
  summary: string | null
  excerpt: string | null
  og_image: string | null
  seen_at: string | null
  read_at: string | null
  bookmarked_at: string | null
  liked_at: string | null
  score?: number
  similar_count?: number
}

export interface ArticleDetail extends ArticleListItem {
  full_text: string | null
  full_text_translated: string | null
  translated_lang: string | null
  images_archived_at: string | null
  feed_type: 'rss' | 'clip'
  imageArchivingEnabled: boolean
}

// --- Bulk mark-as-read ---

/** Direction of a bulk mark-as-read. `newer` goes up the list, `older` goes down. */
export type BulkReadDirection = 'newer' | 'older'

/** Filters that narrow the bulk mark-as-read target set. Limited to the article
 *  list query conditions this feature handles. */
export interface BulkReadScope {
  feed_id?: number
  category_id?: number
  unread?: boolean
}

export interface RangeSeenRequest {
  anchor_id: number
  direction: BulkReadDirection
  scope: BulkReadScope
}

export interface RangeSeenResponse {
  /** Number of articles newly marked as read. Equal to ids.length. */
  updated: number
  /** IDs of the articles newly marked as read. Sent back as-is to undo. */
  ids: number[]
}

export interface BatchUnseenRequest {
  ids: number[]
}

export interface BatchUnseenResponse {
  updated: number
}

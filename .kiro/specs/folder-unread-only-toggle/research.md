# Research & Design Decisions

## Summary
- **Feature**: `folder-unread-only-toggle`
- **Discovery Scope**: Extension (light discovery) — mirrors the already-shipped `feed-unread-only-toggle` pattern, applied to the category ("folder") article list, and replaces an existing global category-unread-only setting.
- **Key Findings**:
  - "フォルダ" is a UI-only label used in the add-feed flow (`FolderStep`); the underlying data model, routes, and store are all `category`. There is no separate folder entity — this feature operates entirely on `categoryId` / `/categories/:categoryId`.
  - A global `reading.category_unread_only` setting already exists (`src/hooks/use-category-unread-only.ts`, Settings → Reading section), synced to the server via `use-settings.ts` / `server/routes/settings.ts`. It has no per-category memory, no in-list state indicator, and its "empty when unread-only" escape hatch (`showReadArticles`) is a one-shot, non-persisted local flag reset on every feed/category change.
  - `feed-unread-only-toggle` already established the exact UX and architecture pattern this feature needs (per-key `localStorage` hook re-derived via `useEffect` keyed on the route id, a presentation-only toggle component, `setSize(1)` + `window.scrollTo(0, 0)` on switch, reuse of the generic `articles.allRead` / `articles.showReadArticles` empty-state copy). This feature reuses that pattern rather than inventing a new one.
  - `ArticleList` does not remount across `/categories/:id` navigation (no route `key`), exactly as with `/feeds/:id` — the existing `useEffect` keyed on `[feedId, categoryId]` is the established mechanism for resetting per-view local state.

## Research Log

### Folder vs. category terminology
- **Context**: The originating feedback used "フォルダ" (folder); needed to confirm whether this names a distinct concept from "category".
- **Sources Consulted**: `src/components/feed/feed-modal.tsx`, `src/components/feed/folder-step.tsx`, `server/routes/categories.ts`, `src/lib/i18n.ts` (`modal.addFolder*` keys).
- **Findings**: "Folder" is purely a label in the add-feed UI; `FolderStep` posts to `/api/categories` and calls `onCategoryCreated`. No folder-specific route, store, or data model exists.
- **Implications**: This spec targets the existing category article list (`/categories/:categoryId`) and the existing `category_id` data path. No new data model is introduced.

### Existing category-unread-only setting
- **Context**: Needed to determine whether the feature request was already satisfied, and how the new per-folder mechanism should relate to the existing global one.
- **Sources Consulted**: `src/hooks/use-category-unread-only.ts`, `src/pages/settings/sections/reading-section.tsx:370-382`, `src/hooks/use-settings.ts`, `server/routes/settings.ts`, `src/components/article/article-list.tsx:74-76,124-128,503-519`.
- **Findings**: The existing setting is a single global on/off value synced across devices via `reading.category_unread_only`. It filters every category view the same way and offers no per-category indicator or persistent per-category choice; the only way to see read articles while it's on is a temporary, unpersisted "Show read articles" link that resets on every navigation.
- **Implications**: Per the product decision captured in `requirements.md` (Requirement 4), this feature replaces the global setting rather than layering a second control next to it. The Settings UI entry, the `use-settings.ts` wiring, and the `reading.category_unread_only` server preference key are all removed.

### Reusable pattern from feed-unread-only-toggle
- **Context**: `feed-unread-only-toggle` (already implemented) solves the identical problem for individual feeds.
- **Sources Consulted**: `.kiro/specs/feed-unread-only-toggle/design.md`, `src/hooks/use-feed-unread-only.ts`, `src/components/article/feed-unread-only-toggle.tsx`, `src/components/article/article-list.tsx`.
- **Findings**: The feed feature's hook intentionally avoids `createLocalStorageHook` because that factory closes over a fixed key and only reads it once via `useState`'s lazy initializer — unsuitable when the same hook instance must re-derive its value as a route param (`feedId`, here `categoryId`) changes without a remount. It instead uses `useState` + a `useEffect` keyed on the id.
- **Implications**: The new `useCategoryUnreadOnly(categoryId)` hook follows the exact same shape as `useFeedUnreadOnly(feedId)`, with one deviation: its fallback default for an unrecorded category is the last known value of the legacy global setting instead of a hardcoded `'off'` (see Decision: Migration Default below).

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Per-category `localStorage` hook (chosen) | Same shape as `useFeedUnreadOnly`, keyed by `categoryId` | Proven pattern already in production; no new abstraction; symmetric with feed feature | None material | Matches Requirement 3.3 (local-only, no cross-device sync) |
| Extend `createLocalStorageHook` to accept a dynamic key | Generalize the existing factory | Single shared factory | The factory's `useState` lazy-init only runs once per mount; making it dynamic requires the same `useEffect` re-derivation logic anyway, so the "shared factory" saves no code while adding an abstraction layer with only two call sites | Rejected — see Simplification below |
| Keep the global setting and add a per-category override on top | Additive rather than replacing | No migration needed | Two sources of truth for the same concept, precedence rules to design and explain in UI; explicitly rejected by the product decision in `requirements.md` Requirement 4 | Rejected per user decision |

## Design Decisions

### Decision: Replace the global setting instead of layering a per-category override
- **Context**: A global `reading.category_unread_only` setting already exists and does something adjacent but materially weaker than what was requested.
- **Alternatives Considered**:
  1. Keep both, with per-category state taking precedence when set — adds a "which one wins" rule the user has to learn and the code has to encode.
  2. Replace the global setting entirely with the per-category mechanism.
- **Selected Approach**: Replace. Remove the Settings UI control, the `use-settings.ts` sync wiring, and the `reading.category_unread_only` server preference key.
- **Rationale**: Confirmed directly with the user (see `requirements.md` Requirement 4). Avoids a confusing dual-control UI and matches the simpler, already-validated feed-level UX.
- **Trade-offs**: Existing users lose cross-device sync of this specific preference (accepted — the feed-level toggle already established that this class of preference is local-only). A one-time migration step (below) preserves their current filtering behavior at the point of upgrade.
- **Follow-up**: None; this is a one-way migration.

### Decision: Migration default reads the legacy `localStorage` value, not the server preference, and is not re-materialized
- **Context**: Existing users may have `reading.category_unread_only` set to `'on'`. Requirement 4.1 requires their folders to start in a state consistent with that prior choice; Requirement 4.3 requires that once a folder's state is explicitly remembered, the legacy setting is never consulted again for it.
- **Alternatives Considered**:
  1. Read the legacy value from the server preference at runtime — requires keeping a server round trip or the removed `use-settings.ts` wiring alive just for a fallback.
  2. Read the legacy value from its existing `localStorage` mirror (`category-unread-only`, written by the old `createLocalStorageHook`-based hook while it was in use) as a pure fallback, with no write-back.
- **Selected Approach**: Option 2. `useCategoryUnreadOnly(categoryId)` falls back to `localStorage.getItem('category-unread-only')` (interpreted the same way the old hook did: `'on'` if exactly `'on'`, else `'off'`) whenever no `category-unread-only:{categoryId}` key exists yet. The fallback value is read on demand and never written back to the legacy key.
- **Rationale**: Since the Settings UI and `use-settings.ts` wiring that used to write `category-unread-only` are removed by this same change, that key becomes frozen at whatever it last held — reading it on demand each time an unrecorded category is queried is equivalent in every observable way to writing it once at migration time, without needing an explicit one-time-migration flag or write path. This is the simplest implementation that satisfies both 4.1 (new folders start from the prior global choice) and 4.3 (a folder that has been explicitly toggled always uses its own stored value, never the legacy one, because `readStored` checks the per-category key first).
- **Trade-offs**: The legacy `category-unread-only` key remains in `localStorage` indefinitely as inert data. This is accepted as harmless; no cleanup step is required.
- **Follow-up**: None.

### Decision: Reuse the file path `src/hooks/use-category-unread-only.ts`, rewritten in place
- **Context**: The old global hook and the new per-category hook cannot coexist under the same export name with different signatures.
- **Alternatives Considered**:
  1. Add a new file (e.g. `use-folder-unread-only.ts`) alongside the old one, then delete the old one in the same change.
  2. Rewrite `use-category-unread-only.ts` in place with the new per-category signature.
- **Selected Approach**: Option 2.
- **Rationale**: The old hook is fully removed by this change (no remaining callers), so there is no transitional period where both must exist. Rewriting in place avoids an unnecessary rename and keeps the file's name aligned with the concept it now correctly represents (per-category state, matching `use-feed-unread-only.ts`'s naming).
- **Trade-offs**: None.
- **Follow-up**: None.

## Risks & Mitigations
- Risk: A reviewer or future change might reintroduce a global-setting-style control for categories, recreating the dual-source-of-truth problem this change removes — Mitigation: `Revalidation Triggers` below calls this out explicitly.
- Risk: `docs/spec/87_feature_feed_unread_only.md` currently documents the (now removed) global setting as a sibling concept ("category views ... a global setting") — Mitigation: File Structure Plan includes updating that doc alongside the new one.
- Risk: Forgetting to remove `reading.category_unread_only` from `server/routes/settings.ts` `PREF_KEYS`/`PREF_ALLOWED` while removing the frontend wiring would leave dead server-side code (harmless) or, if done the other way around, would cause 400s on the frontend's now-absent PATCH calls — Mitigation: File Structure Plan lists both files together per `.claude/rules/settings-sync.md`.

## References
- [feed-unread-only-toggle design](../feed-unread-only-toggle/design.md) — direct architectural precedent for this feature.
- [feed-unread-only-toggle requirements](../feed-unread-only-toggle/requirements.md) — Out-of-scope note that named the global category setting this feature now replaces.

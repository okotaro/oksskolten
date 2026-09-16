# Research & Design Decisions

## Summary
- **Feature**: `feed-unread-only-toggle`
- **Discovery Scope**: Extension(既存の記事一覧・絞り込み機構への拡張、軽量ディスカバリー)
- **Key Findings**:
  - `unread` フィルタは `getArticles` / `GET /api/articles` に既に実装済みで、個別フィードページだけがこれを使っていない。新規サーバー実装は不要。
  - 既存の `createLocalStorageHook` はキーをクロージャで固定する実装で、`feedId` ごとの動的キーには転用できない。`ArticleList` はルート遷移時に再マウントされないため、そのまま使うと直前のフィードの状態が残るバグになる。
  - `ArticleList` には既に「`feedId`/`categoryId` の変化を検知して関連ローカル状態をリセットする」`useEffect` パターン(`showReadArticles` 等、404-410行)が存在し、同じ手法で新フックの値を安全に再導出できる。
  - `FeedMetricsBar` は `settings.showFeedActivity === 'on'` のときしか描画されないため、新しいトグルをその内部に置くと設定次第でトグルごと消えてしまう。トグルは独立した要素として常時描画する必要がある。
  - `useSWRInfinite` の `size` はフェッチキー(絞り込み条件)が変わっても自動ではリセットされない。既存の再試行ボタンだけが `setSize(1)` を呼んでいる。表示状態の切り替え時も明示的に `setSize(1)` を呼ぶ必要がある。
  - UI文言辞書 (`src/lib/i18n.ts`) は `ja`/`en`/`zh` の3言語構成で、エントリごとに3言語すべてが揃っている。要件定義時点で「日本語と英語」としていたのは実態と合っていなかったため、要件を3言語に修正済み。
  - 既存の空状態文言 `articles.allRead`(「すべて読みました」)と `articles.showReadArticles`(「既読記事を表示する」)は、意味的に「未読のみ表示の対象が0件になった」状態全般に通用する汎用的な文言であり、フィード単位のトグルでも文言レベルではそのまま再利用できる。ただし常時表示するトグル本体の文言(「すべて表示」/「未読のみ表示」)は既存辞書に存在せず、新規追加が必要。
  - デモモードのAPIモック(`src/lib/demo/mock-api.ts:113`)は `unread` クエリパラメータをフィード/カテゴリの区別なく汎用的に処理しているため、デモモード側の追加実装は不要。

## Research Log

### 既存の未読フィルタの適用範囲
- **Context**: 個別フィードページに未読のみ表示が無いというギャップの実態を確認する必要があった。
- **Sources Consulted**: `server/db/articles.ts`(`getArticles` 143-217行)、`server/routes/articles.ts`(`ArticlesQuery` 62-73行、ハンドラ241-268行)、`src/components/article/article-list.tsx`(56-107行)
- **Findings**:
  - `getArticles` は `unread`/`bookmarked`/`liked`/`read` の4種のブールフィルタを既にサポートする。
  - クライアントの `unreadOnly` は `isInbox || (categoryUnreadOnly && !showReadArticles)` でのみ true になり、個別フィード(`feedId` のみが設定されている状態)では常に false。
- **Implications**: サーバー・APIの変更なしで、クライアント側の `unreadOnly` 算出にフィード単位の値を合成するだけで機能を実現できる。

### `createLocalStorageHook` のフィードID単位への転用可否
- **Context**: brief.md 作成時点で採用した「`use-category-unread-only.ts` を参考にフィードIDごとにキー化する」という案の実現性を検証した。
- **Sources Consulted**: `src/hooks/create-local-storage-hook.ts`、`src/hooks/use-category-unread-only.ts`、`src/app.tsx`(ルート定義 323行)、`src/components/article/article-list.tsx`(404-410行)
- **Findings**:
  - `createLocalStorageHook` はファクトリ呼び出し時にキーを固定するクロージャで、`useState` の遅延初期化はマウント時に1度しか走らない。
  - `/feeds/:feedId` ルートに `key` propが無く、`ArticleListPage`/`ArticleList`/`FeedMetricsBar` はフィード遷移時に再マウントされない。
  - `ArticleList` は既に `[feedId, categoryId]` の変化を検知して `showReadArticles`・`noFloor`・`locallyReadIds`・フォーカスをリセットする `useEffect` を持つ(404-410行)。
- **Implications**: `createLocalStorageHook` をそのまま使うと、フィード遷移時に直前のフィードの表示状態が残るバグになる。新フックは、この既存のリセット用 `useEffect` と同じ手法(`feedId` の変化を `useEffect` で検知して再読込)を独自に実装する必要がある。`createLocalStorageHook` は流用しない。

### トグルの描画位置
- **Context**: brief.md では「フィード情報バー(`FeedMetricsBar`)の小さいリンク/トグル」を想定していたが、実装可否を確認した。
- **Sources Consulted**: `src/components/article/article-list.tsx`(466-468行)、`src/components/feed/feed-metrics-bar.tsx`
- **Findings**: `FeedMetricsBar` は `currentFeed.type !== 'clip' && settings.showFeedActivity === 'on'` のときしか描画されない。設定でフィード情報バーを非表示にしている利用者は、トグルも失うことになってしまう。
- **Implications**: トグルは `FeedMetricsBar` に内包せず、`ArticleList` 内で独立した要素として、`settings.showFeedActivity` の設定に関わらず個別フィードページで常時描画する。視覚的には `FeedMetricsBar` と同様の控えめなリンクスタイルを踏襲する。

### ページング状態のリセット
- **Context**: フィード内で数ページ読み込んだ後にトグルを切り替えた場合の挙動を確認した。
- **Sources Consulted**: `src/components/article/article-list.tsx`(86-107行、475行の再試行ボタン)
- **Findings**: `useSWRInfinite` の `size` はフェッチキーの変更だけでは減らない。既存の「再試行」ボタンだけが明示的に `setSize(1)` を呼んでいる。
- **Implications**: トグルの切り替えハンドラ内で `setSize(1)` を明示的に呼び、あわせて `window.scrollTo(0, 0)`(`use-scroll-restoration.ts` と同じ手段)で一覧の先頭にスクロールする。

### 文言辞書の言語構成と再利用可否
- **Context**: 要件定義時に「日本語と英語」とした前提が、実際のi18n辞書構成と一致しているか確認した。
- **Sources Consulted**: `src/lib/i18n.ts`(`Locale` 型定義3行目、辞書全体)
- **Findings**: `Locale = 'ja' | 'en' | 'zh'` で、既存エントリは例外なく3言語揃っている。また `articles.allRead` / `articles.showReadArticles` の文言は「未読のみ表示で対象が0件になった」状態全般に汎用的に使える内容だった。
- **Implications**: 要件定義書を3言語対応に修正済み(design着手前に反映)。空状態の文言は新規キーを追加せず既存キーを再利用する。常時表示するトグル本体の文言(「すべて表示」/「未読のみ表示」に相当するラベル)は既存辞書に該当エントリが無いため新規に2キー追加する。

### デモモードへの影響
- **Context**: `docs/spec/86_feature_bulk_mark_read.md` にある通り、デモモードはAPIをモックで横取りする構成のため、新機能が黙って壊れないか確認した。
- **Sources Consulted**: `src/lib/demo/mock-api.ts`(113行)
- **Findings**: モックは `params.get('unread')` を汎用的に読み取っており、フィード/カテゴリ/受信箱を区別しない。
- **Implications**: デモモード側の追加実装は不要。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| `createLocalStorageHook` をそのまま転用 | ファクトリにフィードIDを渡して都度フックを生成 | 実装が最小 | フィード遷移時に再マウントされず状態が残留するバグになる(要検証で確認済み) | 不採用 |
| 専用フック(`useEffect` 再導出) | `feedId` の変化を `useEffect` で検知し、都度 `localStorage` を読み直す | 既存の404-410行のリセットパターンと一貫; バグを回避 | フックの実装がわずかに増える | 採用 |
| フィードごとに別コンポーネントとして `key={feedId}` で強制再マウント | ルートまたは一覧コンポーネントに `key` を付与 | シンプルに見える | `ArticleList` 全体の再マウントは他の状態(スクロール位置、読み込み済みページ等)にも影響し、影響範囲が本機能のスコープを超える | 不採用 |

## Design Decisions

### Decision: フィード単位の表示状態を保持する新規フック
- **Context**: フィードごとに「すべて表示/未読のみ表示」を記憶し、フィード遷移時に正しく切り替わる必要がある。
- **Alternatives Considered**:
  1. `createLocalStorageHook` をフィードIDごとに生成して使う
  2. `ArticleList` に `key={feedId}` を付与して強制再マウントする
  3. `feedId` の変化を `useEffect` で検知して再読込する専用フック
- **Selected Approach**: 3を採用。`src/hooks/use-feed-unread-only.ts` に新規フックを実装する。
- **Rationale**: 既存の404-410行のリセットパターンと同じ考え方で、影響範囲をこのフック単体に閉じ込められる。
- **Trade-offs**: `createLocalStorageHook` の再利用による実装量の節約は諦めるが、正しさを優先する。
- **Follow-up**: なし

### Decision: トグルの描画位置を `FeedMetricsBar` から独立させる
- **Context**: `FeedMetricsBar` は設定でON/OFFできるため、その内部にトグルを置くと設定次第でトグルが消える。
- **Alternatives Considered**:
  1. `FeedMetricsBar` 内に組み込む(brief.md時点の想定)
  2. `ArticleList` 内で独立した要素として常時描画する
- **Selected Approach**: 2を採用。新規コンポーネント `FeedUnreadOnlyToggle` を `ArticleList` から直接描画する。
- **Rationale**: 表示切り替え機能はフィード活動情報の表示設定とは独立した関心事であり、常に利用可能であるべき。
- **Trade-offs**: 独立した小コンポーネントが1つ増えるが、責務が明確になりテストしやすい。

### Decision: 空状態の文言は既存キーを再利用し、トグル本体の文言のみ新規追加
- **Context**: brief.md時点では「既存の文言を流用せず新規キーを追加する」としていたが、実際の文言内容を確認した結果を反映する。
- **Alternatives Considered**:
  1. 空状態・トグルとも全て新規キーを追加する
  2. 空状態は既存キー(`articles.allRead`, `articles.showReadArticles`)を再利用し、トグル本体のみ新規キーを追加する
- **Selected Approach**: 2を採用。
- **Rationale**: 既存の2キーの文言内容は、フィード単位の未読のみ表示が0件になった状態にもそのまま意味が通る。重複した文言を辞書に増やさない。
- **Trade-offs**: 将来どちらかの文言だけを変更したくなった場合は、2つの呼び出し元に影響する。現時点では意味が完全に一致しているためリスクは小さい。

## Risks & Mitigations
- フィード遷移時の状態残留バグ(`createLocalStorageHook` 転用時に発生) — 専用フックで `feedId` の変化ごとに再導出することで回避
- `useSWRInfinite` のページング状態が切り替え時に残る — トグルのハンドラで明示的に `setSize(1)` を呼ぶ
- `FeedMetricsBar` 非表示設定でトグルごと消える — トグルを独立した常時描画要素にする
- 将来 `articles.allRead` / `articles.showReadArticles` の文言をカテゴリ向け専用に変更したくなった場合、フィード単位の空状態表示にも影響する — 変更時は両方の利用箇所を確認する運用でカバー(現時点では additional な仕組みは導入しない)

## References
- [Issue #12](https://github.com/okotaro/oksskolten/issues/12) — 未読記事だけ表示
- [brief.md](./brief.md) — Discovery段階での方針と代替案検討
- [.kiro/specs/bulk-mark-read/design.md](../bulk-mark-read/design.md) — 記事一覧の絞り込み・アーキテクチャの既存パターン参照
- [docs/spec/86_feature_bulk_mark_read.md](../../../docs/spec/86_feature_bulk_mark_read.md) — デモモード構成の既存ドキュメント

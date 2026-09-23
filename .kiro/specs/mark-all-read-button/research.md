# Research & Design Decisions

## Summary
- **Feature**: `mark-all-read-button`
- **Discovery Scope**: Extension (existing system) — light discovery
- **Key Findings**:
  - `markAllSeenByFeed`(`server/db/articles.ts:319`)と`markAllSeenByCategory`(`server/db/categories.ts:53`)はすでに対象記事IDを`affectedIds`として収集しているが、レスポンスに含めていない(`{ updated }`のみ)。IDを返すだけで取り消し機能と組み合わせられる。
  - `POST /api/articles/batch-unseen`(汎用の未読化エンドポイント)と`use-bulk-mark-read.ts`のトースト+10秒取り消しパターンがすでに実装済みで、そのまま流用できる。
  - `ArticleList`(`src/components/article/article-list.tsx`)は`locallyReadIds`という「再取得せずに既読の見た目を反映する」ローカルオーバーレイをすでに持ち、`ArticleListHandle`という ref 経由でページ側(`app.tsx`の`ArticleListPage`)と通信するパターンが確立している。新機能はこのパターンを拡張するだけで済み、新しい状態管理層は不要。
  - カテゴリ(フォルダ)の未読件数はサイドバーで`/api/categories`ではなく`/api/feeds`のfeedごとの`unread_count`から算出されている。したがって未読件数の再検証は既存の`use-bulk-mark-read.ts`と同じ`/api/feeds`プレフィックスの再検証で、フィード・フォルダ両方をカバーできる。
  - デモモード(`src/lib/demo/demo-store.ts` / `mock-api.ts`)の`markAllSeenByFeed` / `markAllSeenByCategory`は`{ success: true }`のみを返しており、IDを含んでいない。本番と同じ体験(取り消し可能なトースト)をデモでも提供するには、デモ側の戻り値も合わせる必要がある。

## Research Log

### 画面内ボタンの配置点
- **Context**: フィードページ・フォルダページの画面内にボタンを追加する具体的な挿入点を特定する必要があった。
- **Sources Consulted**: `src/app.tsx`(`ArticleListPage`)、`src/components/layout/page-layout.tsx`、`src/components/article/article-list.tsx`
- **Findings**:
  - `ArticleListPage`はすでに`headerRight`という`ReactNode`スロットに、フィードページなら`FeedUnreadOnlyToggle`、フォルダページなら`CategoryUnreadOnlyToggle`を条件分岐で渡している。
  - 同じ関数内で`articleListRef`(`ArticleListHandle`型)と`revalidateArticles`をすでに保持しており、`FeedList`(サイドバー)の`onMarkAllRead`にも同じrefコールバックを渡している。
  - `isPlainFeedView`と`categoryIdNum !== undefined`は排他的で、Inbox・ブックマーク・お気に入り・履歴・クリップの各ビューではどちらも成立しない(`feedId`/`categoryId`のルートパラメータが存在しないため)。
- **Implications**: 新しいボタンは`headerRight`の同じ条件分岐に追加すれば、Inboxなど対象外のビューを別途除外するロジックを書かずに要件(Requirement 1.1, 1.2, 1.4)を自然に満たせる。

### 既読の見た目を即時反映する仕組み
- **Context**: 「まだ読み込まれていない記事も対象に含む」全件既読と、「今表示されている記事の見た目をすぐ更新する」要件(Requirement 2.3, 3.1, 3.3)を両立する方法を確認する必要があった。
- **Sources Consulted**: `src/components/article/article-list.tsx`(`locallyReadIds`, `addLocallyReadIds`, `removeLocallyReadIds`, `useBulkMarkRead`呼び出し, `ArticleListHandle`)、`src/hooks/use-bulk-mark-read.ts`
- **Findings**:
  - `article-list.tsx`は`locallyReadIds`という`Set<number>`をローカル状態として持ち、スクロール自動既読と記事単位の一括既読(`bulk-mark-read`)の両方がこれに書き込むことで、記事一覧を再取得せずに既読の見た目を即座に反映している。
  - `useBulkMarkRead`は未読件数の再検証を`/api/feeds`プレフィックスのSWRキーに限定し、`/api/articles`(記事一覧そのもの)は意図的に再検証しない。理由はコメントに明記されており、未読のみ表示中に対象記事が一覧から消えると取り消しが機能しなくなるため。
  - `ArticleListHandle`はすでに`revalidate`と`resetPagingAndScroll`という2つのメソッドを公開しており、ページ側(`ArticleListPage`)がrefを通じて呼び出している。
- **Implications**: `ArticleListHandle`に`markLocallyRead(ids)` / `unmarkLocallyRead(ids)`を追加し、内部で既存の`addLocallyReadIds` / `removeLocallyReadIds`に委譲すれば、新しい状態層を作らずに画面内ボタンからローカル既読反映ができる。未読件数の再検証も同じ`/api/feeds`プレフィックス方式を踏襲する。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| ArticleListHandle拡張(採用) | 既存のref経由の呼び出し方式を2メソッド追加して拡張 | 新規の状態層・APIが不要。既存の`resetPagingAndScroll`と同じパターン | ArticleListの内部実装(オーバーレイ方式)に依存し続ける | `feed-unread-only-toggle`スペックが既に確立した境界 |
| Contextベースの共有状態 | React ContextでlocallyReadIdsをページ全体に昇格 | ref経由の間接呼び出しを回避できる | 既存の`ArticleList`の内部状態を外部に晒す設計変更になり、影響範囲が本specの境界を超える | 不採用: 過剰な変更 |
| ボタンをArticleList内部に描画 | ヘッダーではなく記事一覧の内部(FeedMetricsBarの隣など)にボタンを置く | ref経由の連携が不要になる | 既存の`FeedUnreadOnlyToggle`/`CategoryUnreadOnlyToggle`と視覚的な配置が分かれ、一貫性が下がる。ヘッダー領域は常時表示だが一覧内部はスクロールで隠れる | 不採用: Boundary Candidatesで挙げた「ヘッダー領域との視覚的一貫性」に反する |

## Design Decisions

### Decision: レスポンス拡張は`markAllSeenByFeed`/`markAllSeenByCategory`のみに限定する
- **Context**: 取り消し機能には既読にした記事IDが必要だが、現在のレスポンスは件数のみ。
- **Alternatives Considered**:
  1. 新しい専用エンドポイントを作る
  2. 既存の`mark-all-seen`エンドポイントのレスポンスにIDを追加する(選択)
- **Selected Approach**: `markAllSeenByFeed` / `markAllSeenByCategory`が内部で収集済みの`affectedIds`を、戻り値に`ids: number[]`として追加するだけに留める。ルート層(`server/routes/feeds.ts` / `categories.ts`)は結果をそのまま返しているため変更不要。
- **Rationale**: 挙動(全件既読化)自体は変更せず、既に計算済みの値を露出するだけなので、リスクとコストが最小。
- **Trade-offs**: 大量記事を一度に既読にした場合、レスポンスに全IDが含まれ得る。既存の`bulk-mark-read`(range-seen)も同じ設計を採用しており、SQLiteのパラメータ数上限を超えないよう`batch-unseen`側でチャンク分割されていることを確認済み(`server/db/articles.ts`付近の`RangeSeenResult`コメント)。
- **Follow-up**: 極端に記事数が多いフィード/フォルダでのレスポンスサイズを実装時に確認する。

### Decision: フィード用・フォルダ用のボタン/フックを分けず、target判別の共通実装にする
- **Context**: `feed-unread-only-toggle` / `folder-unread-only-toggle`は別スペック・別コンポーネントとして実装されたが、それぞれ永続化キー(フィードID/カテゴリID)を持つローカルストレージフックという固有の複雑さがあった。
- **Alternatives Considered**:
  1. `FeedMarkAllReadButton` / `CategoryMarkAllReadButton`を別々に実装(toggle系スペックに倣う)
  2. `target: { type: 'feed' | 'category'; id: number }`を受け取る単一の`MarkAllReadButton` / `useMarkAllRead`(選択)
- **Selected Approach**: 単一のボタンコンポーネントとフックを、呼び出すエンドポイントだけがtargetによって変わる形で実装する。
- **Rationale**: 本機能には永続化状態や表示条件の分岐が(トグル系と違って)存在せず、「どのエンドポイントを叩くか」という1点の違いしかない。単一実装のほうが重複を避けられる。
- **Trade-offs**: 将来フィード側とフォルダ側で挙動を分岐させたくなった場合、target判定の分岐が増える可能性があるが、現時点の要件では発生しない。

### Decision: 取り消しロジックは`use-bulk-mark-read.ts`の`undoRange`と重複実装する(共通化しない)
- **Context**: 取り消し処理(`batch-unseen`呼び出し、ローカル状態のロールバック、トースト表示)は`use-bulk-mark-read.ts`の`undoRange`とほぼ同じ形になる。
- **Alternatives Considered**:
  1. 共通の`useUndoableMarkRead`のようなコアフックを抽出し、`use-bulk-mark-read.ts`と`use-mark-all-read.ts`の両方から使う
  2. それぞれのフックに同等のロジックを個別実装する(選択)
- **Selected Approach**: `use-mark-all-read.ts`に独立した取り消しロジックを実装する。
- **Rationale**: 共通化すると、`use-bulk-mark-read.ts`側の「基準記事+方向」に紐づくキー管理(`pendingKey`によるSet管理)と、本機能の「1操作のみ」という単純な保留状態管理という異なる形状を1つの抽象に押し込むことになり、抽象化のための抽象化になる。重複するのは10行程度の直線的なロジックのみ。
- **Trade-offs**: 将来3つ目の同種フックが必要になった場合は、その時点で共通化を再検討する。

## Risks & Mitigations
- 大量記事(数千件超)を一度に既読化した際のAPIレスポンスサイズ増加 — 既存の`range-seen`と同水準のデータ量であり、DBの`SELECT id`のみを返す設計のため許容範囲内と判断。実装時にレスポンスサイズを軽く確認する。
- デモモードの`demo-store.ts`が`ids`を返さないままだと、デモ環境でのみ取り消しボタンが機能しない/エラーになる — `markAllSeenByFeed` / `markAllSeenByCategory`(デモ側)の戻り値に`ids`を追加して整合させる。

## References
- [Issue #16](https://github.com/okotaro/oksskolten/issues/16) — 本機能の原典
- `.kiro/specs/bulk-mark-read/` — 取り消し基盤(`batch-unseen`)とトーストパターンの提供元
- `.kiro/specs/feed-unread-only-toggle/`, `.kiro/specs/folder-unread-only-toggle/` — ヘッダー領域(`headerRight`)の確立元

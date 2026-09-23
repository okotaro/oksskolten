# Brief: mark-all-read-button

出典: [Issue #16 すべてを既読にするボタンを追加する](https://github.com/okotaro/oksskolten/issues/16)

## Problem

利用者がフィードまたはフォルダの記事をすべて既読にしたいとき、現状は左のサイドバーで対象のフィードまたはフォルダを右クリックし、「既読にする」を選ぶしかない。すでにそのフィードまたはフォルダの記事一覧画面を開いている場合でも、いったんサイドバーから対象を探して右クリックするという一手間が必要で、画面を見ながら操作を完結できない。

## Current State

既読状態を一括で変更する仕組みはすでに存在する。

- `POST /api/feeds/:id/mark-all-seen`(`markAllSeenByFeed`, `server/db/articles.ts:319`)— フィード内の未読をすべて既読にする
- `POST /api/categories/:id/mark-all-seen`(`markAllSeenByCategory`, `server/db/categories.ts:53`)— カテゴリ(フォルダ)内の未読をすべて既読にする

どちらも呼び出しの起点はサイドバーの右クリックメニュー(`FeedContextMenu` / `CategoryContextMenu`、`src/components/feed/feed-context-menu.tsx`)に限られ、`src/hooks/use-feed-actions.ts` の `handleMarkAllReadFeed` / `handleMarkAllReadCategory` から呼ばれている。現状は実行後にトーストや取り消しは提供されず、確認ダイアログもない(即時実行)。

一方、`bulk-mark-read` spec(Issue #5)の実装により、記事単位の一括既読には「実行後トースト + 取り消し」の基盤がすでにある。

- `POST /api/articles/batch-unseen` — 指定したID配列を未読に戻す汎用エンドポイント
- `src/hooks/use-bulk-mark-read.ts` — トースト表示、10秒間の取り消しアクション、失敗時のロールバックを実装した既存フック(`range-seen` 専用だが、取り消し部分は ID 配列を受け取る `batch-unseen` に依存しており流用可能)

ただし `markAllSeenByFeed` / `markAllSeenByCategory` は内部で対象IDを収集している(`affectedIds`)にもかかわらず、レスポンスでは `{ updated: number }` のみを返しており、既読にした記事のIDをクライアントに渡していない。このため取り消し機能をそのまま組み合わせることができない。

個別フィードページ(`/feeds/:feedId`)およびフォルダ(カテゴリ)ページのヘッダー領域には、直近の `feed-unread-only-toggle` / `folder-unread-only-toggle` spec で「すべて表示 / 未読のみ表示」の切り替えスイッチがすでに追加されている(`src/components/article/feed-unread-only-toggle.tsx`, `src/components/article/category-unread-only-toggle.tsx`)。この領域が、画面内操作ボタンを追加する際の視覚的に一貫した配置候補になる。

## Desired Outcome

フィードページまたはフォルダ(カテゴリ)ページを表示している利用者が、その画面内のボタンをクリックするだけで、そのフィードまたはフォルダの未読記事をすべて既読にできる。サイドバーで対象を探して右クリックする手間をなくす。実行は即座に行われ、結果はトーストで通知され、一定時間内であれば取り消せる。

## Approach

**既存の mark-all-seen API を拡張してID配列を返し、既存の取り消し基盤(`batch-unseen` + トースト)と組み合わせる。**

- `markAllSeenByFeed` / `markAllSeenByCategory` のレスポンスに、既存で収集済みの `affectedIds` を `ids: number[]` として含める(サーバー・DB層の小さな拡張)。
- `POST /api/feeds/:id/mark-all-seen` / `POST /api/categories/:id/mark-all-seen` のレスポンス型に `ids` を追加する。
- フィードページ・フォルダページのヘッダー(未読のみ表示トグルと同じ領域)に「すべて既読にする」ボタンを追加する。
- クリック時は即座にAPIを呼び出し、`use-bulk-mark-read.ts` と同じパターン(sonner トースト、10秒間の取り消しアクション、失敗時ロールバック)で結果を通知する。取り消しは既存の `POST /api/articles/batch-unseen` をそのまま呼び出す。
- 対象記事が0件(すでにすべて既読)の場合は、取り消し手段なしの通知のみを表示する(`bulk-mark-read` の既存方針を踏襲)。

検討した代替案:

- **確認ダイアログを表示してから実行する案** — 誤操作防止にはなるが、既存のサイドバー版mark-all-readが確認なしの即時実行であり、同じ操作に対して画面によって挙動が変わるのは利用者を混乱させるため不採用。取り消し機能で誤操作リスクをカバーする。
- **新規の一括既読エンドポイントを作る案** — 既存の `mark-all-seen` エンドポイントがすでに要件を満たしており、IDを返すよう拡張するだけで済むため、新規エンドポイント追加は過剰。不採用。

新規の依存ライブラリは不要(sonner・既存APIをそのまま利用)。

## Scope

- **In**:
  - フィードページ(`/feeds/:feedId`)向けの「すべて既読にする」ボタンUI
  - フォルダ(カテゴリ)ページ向けの「すべて既読にする」ボタンUI
  - `markAllSeenByFeed` / `markAllSeenByCategory` のレスポンスにID配列を追加するサーバー拡張
  - 実行結果のトースト通知(件数表示)と、既存の `batch-unseen` を用いた取り消し
  - 対象が0件だった場合の通知(取り消し手段なし)
  - i18n文言(日本語/英語)
  - サーバー・クライアント双方のテスト

- **Out**:
  - Inbox(全フィード横断)ビューへのボタン追加(Issueの文言が「表示中のフィードまたはフォルダ」に限定しているため対象外)
  - サイドバーの右クリックメニュー(`FeedContextMenu` / `CategoryContextMenu`)自体の変更
  - 記事単位・範囲指定の一括既読(`bulk-mark-read` の責務、変更しない)
  - 未読のみ表示トグル(`feed-unread-only-toggle` / `folder-unread-only-toggle`)の挙動変更
  - 実行前の確認ダイアログ
  - 複数フィード・複数フォルダを横断した一括操作

## Boundary Candidates

- **mark-all-seen APIのレスポンス拡張** — 既存のフィード/カテゴリ一括既読APIにID配列を追加する責務。サーバーDB層・ルート層。
- **画面内ボタンUI** — フィードページ・フォルダページのヘッダーにボタンを表示し、クリックを実行に繋げる責務。UI層。
- **実行結果の通知と取り消し** — トースト表示、取り消し呼び出し(既存 `batch-unseen` 経由)、未読件数の再検証の責務。`use-bulk-mark-read.ts` と同等のロジックをフィード/カテゴリ向けに適用する。

## Out of Boundary

- 既読状態そのもののデータモデル変更(`seen_at` の意味は既存のまま)
- サイドバーの右クリックメニューの表示・削除・改名などの他の項目
- `getArticles` のフィルタ条件生成ロジック
- 既読/未読の判定基準や並び順

## Upstream / Downstream

- **Upstream**: `markAllSeenByFeed` / `markAllSeenByCategory`(`server/db/`)、`POST /api/feeds/:id/mark-all-seen` / `POST /api/categories/:id/mark-all-seen`(`server/routes/`)、`POST /api/articles/batch-unseen` の取り消し基盤、`use-bulk-mark-read.ts` のトースト+取り消しパターン、`feed-unread-only-toggle` / `folder-unread-only-toggle` が追加したヘッダー領域
- **Downstream**: なし(想定される後続作業は特になし)

## Existing Spec Touchpoints

- **Extends**: なし(既存specの範囲外の新規境界)
- **Adjacent**:
  - `.kiro/specs/bulk-mark-read` — 取り消し用の `batch-unseen` エンドポイントとトーストパターンを再利用するが、責務は別(bulk-mark-readは記事単位の範囲指定、本specはフィード/フォルダ単位の全件既読)
  - `.kiro/specs/feed-unread-only-toggle` / `.kiro/specs/folder-unread-only-toggle` — ボタンの配置領域(ヘッダー)を共有する可能性があるが、表示フィルタの切り替えとは責務が異なる

## Constraints

- 既存の `POST /api/feeds/:id/mark-all-seen` / `POST /api/categories/:id/mark-all-seen` の挙動(全件既読化)を変えないこと。拡張はレスポンスへのID追加に限る。
- 取り消しは既存の `POST /api/articles/batch-unseen` をそのまま利用し、新規の取り消しエンドポイントを作らないこと。
- トースト・取り消し手段は操作完了から少なくとも10秒間利用可能にすること(`bulk-mark-read` の既存方針に合わせる)。
- 文言はi18nを経由し、日本語・英語の両方を用意すること。
- サーバーは Fastify + zod、クライアントは React 19 + SWR + sonner という既存構成に従う。

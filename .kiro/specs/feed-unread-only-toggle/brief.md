# Brief: feed-unread-only-toggle

出典: [Issue #12 未読記事だけ表示](https://github.com/okotaro/oksskolten/issues/12)

## Problem

ひとつのフィードの中に既読記事と未読記事が入り乱れている時、未読記事のタイトルだけをチェックするのが難しい。フィード一覧は既読・未読を問わず時系列で並ぶため、既読記事が未読記事の間に挟まると見落としや重複確認が発生する。

## Current State

記事一覧の絞り込みは `getArticles`(`server/db/articles.ts`)がすでに `unread` / `bookmarked` / `liked` / `read` のブール値フィルタをサポートしており、`GET /api/articles`(`server/routes/articles.ts`)経由でクライアントから指定できる。ただし現状この `unread` フィルタが使われるのは次の場合に限られる。

- 受信箱(inbox)ビュー — 常に `unread=1`
- カテゴリビュー — 設定ページの `reading.category_unread_only`(`src/hooks/use-category-unread-only.ts`、サーバー同期設定)がONの場合のみ、カテゴリ単位で `unread=1`

個別フィードページ(`/feeds/:feedId`)には未読のみ表示の仕組みが一切なく、常に全記事(既読+未読)が表示される。これが本Issueが指摘するギャップ。

なお、カテゴリ向け設定がフル既読時に表示する「既読記事を表示」というインライン切り替えリンク(`src/components/article/article-list.tsx` 481-491行)が、見た目・挙動として最も近い既存パターン。

## Desired Outcome

個別フィードページに「すべて表示 / 未読のみ表示」を切り替えるトグルを追加する。切り替え状態はフィードごとにブラウザのlocalStorageへ記憶し、同じフィードを再訪した際に復元される。サーバー・DBの変更は行わない。

## Approach

**既存の `unread` フィルタとローカル永続化を組み合わせる。**

`getArticles` / `GET /api/articles` の `unread` フィルタはすでに存在するため、新規のサーバー実装は不要。クライアント側で「フィードIDごとに未読のみ表示フラグを保持する」新しいフックを追加し、`article-list.tsx` の既存の `unreadOnly` 判定(56-72行付近)にフィード単位の値を合成する。UIは `feed-metrics-bar.tsx` に小さいリンク/トグルとして追加し、既存の「既読記事を表示」テキストリンクと視覚的に一貫させる。

検討した代替案:

- **サーバー同期設定(feedsテーブル拡張 or 専用テーブル)案** — クロスデバイス同期ができる利点はあるが、DBマイグレーションとAPI拡張が必要で本Issueの要求規模に対して過大。今回は不採用。
- **セッションのみ保持(永続化なし)案** — 実装は最小だが、フィードを再訪するたびにリセットされ「フィードごとに記憶してほしい」というユーザーの意図に反するため不採用。

### 実装上の注意(feasibility検証で判明)

- 既存の `use-category-unread-only.ts` が使う `createLocalStorageHook`(`src/hooks/create-local-storage-hook.ts`)は、キーをフック生成時に固定するクロージャ実装であり、`useState` の遅延初期化はマウント時に一度しか走らない。これをそのまま `feedId` ごとの動的キーに転用すると、フィード遷移時にコンポーネントが再マウントされない限り(`/feeds/:feedId` ルートに `key` propが無く、`ArticleListPage`/`FeedMetricsBar` は現状再マウントしない)、直前に開いたフィードの状態が残り続ける不具合になる。新フックは `feedId` の変化を検知して再読込するか、あるいは一覧側に `key={feedId}` を付与して意図的に再マウントさせる設計のどちらかを design フェーズで明示すること。
- トグル切り替え時にSWRのページング(`size`)をリセットする挙動を設計に含める。既存のカテゴリ向け設定でも未対応だが、設定ページから離れた場所での切り替えなので影響が薄かった。フィードページ内蔵のトグルではスクロール済み状態での切り替えが日常的に起きるため対応が必要。
- 表示文言は「既読記事を表示」(`articles.showReadArticles`、全既読時のみ出る別フローの文言)を流用せず、新規のi18nキーを日本語/英語(該当すれば中国語)で追加する。

新規の依存ライブラリは不要。

## Scope

- **In**:
  - 個別フィードページ(`/feeds/:feedId`)向けの「すべて表示 / 未読のみ表示」トグルUI
  - フィードIDをキーとしたlocalStorage永続化(クライアントのみ、サーバー同期なし)
  - 既存の `unreadOnly` 判定・SWRフェッチキーへの統合
  - トグル切り替え時のページング(スクロール位置/読み込み件数)リセット
  - i18n文言(日本語/英語)
  - クライアント側のテスト

- **Out**:
  - カテゴリビューへの適用・既存の `reading.category_unread_only` 設定の置き換え(将来検討)
  - サーバー・DBでの永続化やクロスデバイス同期
  - 未読以外のフィルタ(お気に入り・いいね・既読)の切り替えUI
  - bulk-mark-read(一括既読)機能そのものの変更

## Boundary Candidates

- フィードページ限定のUIコンポーネント(トグル本体)
- フィードIDキー化されたローカル永続化フック
- `article-list.tsx` の `unreadOnly` 判定ロジックへの合成ポイント

## Out of Boundary

- カテゴリビューの表示切り替え(既存のグローバル設定のまま)
- 記事の既読状態そのものを変更する操作(bulk-mark-readの責務)
- サーバー側のフィルタAPI自体の変更(既存の `unread` パラメータをそのまま利用)

## Upstream / Downstream

- **Upstream**: 既存の `getArticles` / `GET /api/articles` の `unread` フィルタ、`use-category-unread-only.ts` の実装パターン、`feed-metrics-bar.tsx` の表示領域
- **Downstream**: 将来的にカテゴリビューへの適用や、フィルタ状態のサーバー同期が必要になった場合は別途検討

## Existing Spec Touchpoints

- **Extends**: なし(既存specの範囲外の新規境界)
- **Adjacent**: `.kiro/specs/bulk-mark-read`(記事一覧の絞り込み条件生成ロジックを共有する可能性はあるが、責務は別。bulk-mark-readは既読状態の一括変更、本specは表示フィルタの切り替え)

## Constraints

- 新規の依存ライブラリ追加は不要(既存のUIコンポーネント・パターンを流用)
- サーバー・DBスキーマの変更を行わない
- 既存の `createLocalStorageHook` をそのまま転用せず、フィードID切り替えに追従する実装にすること(design フェーズで詳細化)

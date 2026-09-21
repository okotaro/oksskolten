# Implementation Plan

- [ ] 1. 基盤: 永続化フックと文言、既存グローバル設定の撤去
- [x] 1.1 (P) useCategoryUnreadOnly フックを書き換える
  - カテゴリIDごとに保存された表示状態を返し、未保存時は旧グローバル設定が残したレガシーの`localStorage`値(`'on'`ならオン、それ以外はオフ)へフォールバックする
  - categoryIdが変化したとき、直前のcategoryIdの値を引き継がず、新しいcategoryIdに対応する値(無ければレガシー値、それも無ければ'off')へ再導出する。`createLocalStorageHook`は転用しない(カテゴリ遷移時に再マウントされないため状態が残留するバグになる)
  - categoryIdがundefinedのときは常に'off'を返し、保存も行わない
  - セッターの呼び出しでcategoryId対応のキーへ値を保存し、以後はその保存値がレガシー値より常に優先される
  - レガシーの`localStorage`キーへは一切書き戻さない(読み取り専用のフォールバック)
  - 単体テストがすべて通り、categoryIdの変化ごとに直前のcategoryIdの値を引き継がず正しく再導出され、レガシー値への優先順位が保存済みの値によって上書きされる状態になる
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.3, 5.1, 5.2_
  - _Boundary: useCategoryUnreadOnly_

- [x] 1.2 (P) トグル用の新規文言を追加し、旧グローバル設定の文言を撤去する
  - 「未読のみ表示」と「すべて表示」に相当する2つの新規文言キーを追加する
  - 既存の辞書が要求する3ロケール(日本語、英語、中国語)すべてに新規キーの値を用意する
  - 旧グローバル設定(「カテゴリで未読のみ表示」)に紐づく4つの文言キーを削除する
  - 型検査が通り、追加したキーが翻訳関数のキー型として解決され、削除したキーへの参照が残っていない状態になる
  - _Requirements: 1.5, 4.2, 7.1_
  - _Boundary: i18n dict_

- [x] 1.3 (P) 既存グローバル設定のUIと同期配線を撤去する
  - Settings画面の「カテゴリの未読のみ表示」切り替えコントロールを削除する
  - フロントエンドの設定同期フック(サーバーとのハイドレーション・PATCH配線)から該当のプリファレンスキーの取り扱いを削除する
  - サーバー側のプリファレンス許可リストから該当のキーを削除する(フロントエンドとサーバーの変更を同一作業内で行い、片方だけの変更による同期エラーを避ける)
  - 型検査とビルドが通り、Settings画面に該当コントロールが表示されず、該当プリファレンスキーへのPATCHが送信されない状態になる
  - _Requirements: 4.2_
  - _Boundary: Settings UI, Settings sync, Server preferences_

- [x] 2. CategoryUnreadOnlyToggle コンポーネントを実装する
  - 現在の表示状態(すべて表示/未読のみ表示)に応じて、追加した文言キーでラベルを切り替えて表示する
  - クリック時にonToggleコールバックを呼ぶ
  - 状態の保持や永続化ロジックを持たない表示専用コンポーネントとして実装する
  - コンポーネントテストが通り、状態に応じたラベル表示とクリック時のコールバック発火が確認できる状態になる
  - _Requirements: 1.1, 1.5, 7.1_
  - _Depends: 1.2_
  - _Boundary: CategoryUnreadOnlyToggle_

- [ ] 3. 統合: ArticleList への組み込み
- [x] 3.1 フォルダ判定とunreadOnlyへの合成、トグルの描画を組み込む
  - categoryIdの有無からフォルダページかどうかを判定し、useCategoryUnreadOnlyへ実際のcategoryIdまたはundefinedを渡す
  - unreadOnlyの算出を、既存のグローバル設定由来の項(`categoryUnreadOnly && !showReadArticles`)から、新しいフォルダ単位の値に置き換える
  - フォルダページでのみCategoryUnreadOnlyToggleを描画し、受信箱・個別フィード・ブックマーク・お気に入り・既読済み・クリップの各ビューでは描画しない
  - `showReadArticles`のstateと、それを参照していた既存の空状態判定(旧`allReadEmpty`)を削除する
  - 既存の統合テスト(グローバル設定を直接セットしていたモック)を、フォルダ単位のローカルストレージベースのセットアップに置き換える
  - トグルをONにすると一覧の取得リクエストにunread=1が含まれ、既読記事が一覧から除外される状態になる
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Depends: 1.1, 1.3, 2_
  - _Boundary: ArticleList_

- [x] 3.2 切り替え時のページング・スクロールリセットと未読0件時の空状態表示を組み込む
  - トグルの切り替え操作でページング(useSWRInfiniteのsize)を1にリセットする
  - トグルの切り替え操作で一覧の先頭へスクロールする
  - 未読のみ表示で対象フォルダの未読が0件のとき、既存の空状態文言(既読記事を表示する等)を再利用した案内を表示する新しい空状態判定を追加する
  - 案内からの操作で表示状態を'off'に戻し、ページングもリセットする
  - 新しい空状態判定と、個別フィード向けの既存の空状態判定(feedAllReadEmpty)が同時にtrueにならないことを確認する(現在のルーティング上、フォルダページと個別フィードページは排他のため成立する想定)
  - トグル操作後に一覧が先頭から再読み込みされ、未読0件時の案内とそこからの復帰が確認できる状態になる
  - _Requirements: 2.1, 2.2, 6.1, 6.2_
  - _Depends: 3.1_
  - _Boundary: ArticleList_

- [ ] 4. フォルダ間の切り替えでの表示状態の復元と移行フォールバックを検証する
  - 表示状態を記憶しているフォルダへ再訪したとき、記憶した状態が復元されることを確認する
  - 表示状態を記憶していないフォルダでは、旧グローバル設定のレガシー値(存在すればその値、無ければ'off')が初期状態になることを確認する
  - 直前に開いていたフォルダの表示状態を、移動先のフォルダに引き継がないことを確認する
  - あるフォルダで表示状態を明示的に切り替えた後は、レガシー値が変化してもそのフォルダの表示状態が影響を受けないことを確認する
  - 結合テストがすべて通り、フォルダを連続して切り替えても各フォルダ固有の表示状態が保たれ、移行フォールバックが一度だけ適用される状態になる
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.3, 5.1, 5.2_
  - _Depends: 3.1, 3.2_

## Implementation Notes
- Task 3.1 removed the old `allReadEmpty` (it depended on the deleted `showReadArticles`) and left the empty-state gate as `feedAllReadEmpty` alone. This is an intentional transitional state: a category unread-only view with 0 unread articles currently falls through to the generic `articles.empty` message instead of the "all caught up" guidance. Task 3.2 must add `categoryAllReadEmpty` back into that gate (`categoryAllReadEmpty || feedAllReadEmpty`) at all three usage sites (the guidance block itself, the `FeedErrorBanner` guard, and the generic-empty guard).
- `mise` is not available in this sandbox, so `npm run test` (which wraps `mise exec node@22 -- vitest run`) fails at the wrapper level. Use `npx vitest run [path]` directly instead — same vitest config, already-active Node 22 (carried over from feed-unread-only-toggle's implementation notes).
- ドキュメント更新(`docs/spec/`の新規ページ、`01_overview.md`、`87_feature_feed_unread_only.md`の記述修正、`README.md`)はタスク生成の対象外(Code-Only Focus)。design.mdのFile Structure Planに従い、実装完了後に`.claude/rules/docs.md`のルールに沿って別途反映すること(feed-unread-only-toggleの実装時と同じ運用)。

# Implementation Plan

- [ ] 1. 基盤: 永続化フックと文言
- [x] 1.1 (P) useFeedUnreadOnly フックを実装する
  - フィードIDごとに保存された表示状態を返し、未保存時は初期値'off'を返す
  - feedIdが変化したとき、直前のfeedIdの値を引き継がず、新しいfeedIdに対応する値(無ければ'off')へ再導出する。`createLocalStorageHook`は転用しない(フィード遷移時に再マウントされないため状態が残留するバグになる)
  - feedIdがundefinedのときは常に'off'を返し、保存も行わない
  - セッターの呼び出しでfeedId対応のキーへ値を保存する
  - 不正な保存値は初期値'off'として扱う
  - 単体テストがすべて通り、feedIdの変化ごとに直前のfeedIdの値を引き継がず正しく再導出される状態になる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_
  - _Boundary: useFeedUnreadOnly_

- [x] 1.2 (P) トグル用の新規文言を追加する
  - 「未読のみ表示」と「すべて表示」に相当する2つの文言キーを追加する
  - 既存の辞書が要求する3ロケール(日本語、英語、中国語)すべてに値を用意する
  - 型検査が通り、追加したキーが翻訳関数のキー型として解決される状態になる
  - _Requirements: 1.5, 6.1_
  - _Boundary: i18n dict_

- [x] 2. FeedUnreadOnlyToggle コンポーネントを実装する
  - 現在の表示状態(すべて表示/未読のみ表示)に応じて、追加した文言キーでラベルを切り替えて表示する
  - クリック時にonToggleコールバックを呼ぶ
  - 状態の保持や永続化ロジックを持たない表示専用コンポーネントとして実装する
  - コンポーネントテストが通り、状態に応じたラベル表示とクリック時のコールバック発火が確認できる状態になる
  - _Requirements: 1.1, 1.5, 6.1_
  - _Depends: 1.2_
  - _Boundary: FeedUnreadOnlyToggle_

- [ ] 3. 統合: ArticleList への組み込み
- [x] 3.1 個別フィード判定とunreadOnlyへの合成、トグルの描画を組み込む
  - feedIdParamとisCollectionView(受信箱・カテゴリ・ブックマーク・お気に入り・既読済み・クリップの各ビューを除外する判定)から個別フィードページかどうかを判定する
  - 判定結果に応じてuseFeedUnreadOnlyへ実際のfeedIdまたはundefinedを渡す
  - unreadOnlyの算出に個別フィードの表示状態を合成する
  - FeedMetricsBarの表示設定(showFeedActivity)に関わらず、トグルを個別フィードページで常時描画する
  - 受信箱・カテゴリ別・ブックマーク・お気に入り・既読済み・クリップの各ビューではトグルを描画しない
  - トグルをONにすると一覧の取得リクエストにunread=1が含まれ、既読記事が一覧から除外される状態になる
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Depends: 1.1, 2_
  - _Boundary: ArticleList_

- [x] 3.2 切り替え時のページング・スクロールリセットと未読0件時の空状態表示を組み込む
  - トグルの切り替え操作でページング(useSWRInfiniteのsize)を1にリセットする
  - トグルの切り替え操作で一覧の先頭へスクロールする
  - 未読のみ表示で対象フィードの未読が0件のとき、既存の空状態文言(既読記事を表示する等)を再利用した案内を表示する
  - 案内からの操作で表示状態を'off'に戻し、ページングもリセットする
  - 既存のカテゴリ向け空状態(allReadEmpty)と本機能の空状態(feedAllReadEmpty)が同時にtrueにならないことを確認する(現在のルーティング上、個別フィードページとカテゴリ向け未読設定は排他のため成立する想定)
  - トグル操作後に一覧が先頭から再読み込みされ、未読0件時の案内とそこからの復帰が確認できる状態になる
  - _Requirements: 2.1, 2.2, 5.1, 5.2_
  - _Boundary: ArticleList_

- [ ] 4. フィード間の切り替えで表示状態が正しく復元されることを検証する
  - 表示状態を記憶しているフィードへ再訪したとき、記憶した状態が復元されることを確認する
  - 表示状態を記憶していないフィードでは初期状態(すべて表示)になることを確認する
  - 直前に開いていたフィードの表示状態を、移動先のフィードに引き継がないことを確認する(feasibility検証で判明したフィード遷移時の状態残留バグの再発防止テスト)
  - 結合テストがすべて通り、フィードを連続して切り替えても各フィード固有の表示状態が保たれる状態になる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_
  - _Depends: 3.1, 3.2_

## Implementation Notes
- `mise` is not available in this sandbox, so `npm run test` (which wraps `mise exec node@22 -- vitest run`) fails at the wrapper level. Use `npx vitest run [path]` directly instead — same vitest config, already-active Node 22.
- `feedAllReadEmpty`を追加した際、既存の`isEmpty && !allReadEmpty && !isLoading`ゲート(FeedErrorBanner/汎用の空メッセージ)も`!feedAllReadEmpty`を除外条件に加える必要があった。`allReadEmpty`同様、他の空状態フォールバックと二重表示しないよう、新しい空状態フラグを追加する際は既存の`isEmpty`系フォールバック条件も併せて見直すこと。

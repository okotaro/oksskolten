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

- [x] 4. フィード間の切り替えで表示状態が正しく復元されることを検証する
  - 表示状態を記憶しているフィードへ再訪したとき、記憶した状態が復元されることを確認する
  - 表示状態を記憶していないフィードでは初期状態(すべて表示)になることを確認する
  - 直前に開いていたフィードの表示状態を、移動先のフィードに引き継がないことを確認する(feasibility検証で判明したフィード遷移時の状態残留バグの再発防止テスト)
  - 結合テストがすべて通り、フィードを連続して切り替えても各フィード固有の表示状態が保たれる状態になる
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_
  - _Depends: 3.1, 3.2_

- [x] 5. ヘッダーへの表示位置移動(要件7、Issue #14)
- [x] 5.1 (P) Header/PageLayout にヘッダー右側の汎用アクションスロットを追加する
  - `HeaderProps`/`PageLayoutProps` に `headerRight` を追加し、list モードのヘッダー右側の既存スペーサーをこのスロットを描画する要素に置き換える
  - `headerRight` が指定されないときは既存と同じ見た目(空のスペーサー)を保つ(他ビューでの回帰防止)
  - スロットの描画位置がタイトル文字列の長さに依存しないことを確認する
  - コンポーネントテストが通り、`headerRight` の内容の有無・タイトルの長さによらずスロット自体の描画位置が変わらないことが確認できる状態になる
  - _Requirements: 7.1, 7.2, 7.3_
  - _Boundary: Header, PageLayout_

- [x] 5.2 (P) ArticleList: ページング・スクロールリセットの命令的公開とprops経由のfeedUnreadOnlyへの移行
  - 既存の `revalidate` と同じ仕組みで、`setSize(1)` と一覧先頭へのスクロールを実行する命令的メソッドを `ArticleListHandle` に追加する
  - `ArticleList` が `useFeedUnreadOnly` を直接呼び出すのをやめ、フィード単位の表示状態と変更コールバックを props として受け取るように変更する
  - トグル自体の描画(JSX)を `ArticleList` から削除する(ヘッダー側で描画されるため)
  - 空状態案内のボタンは、渡された変更コールバックで状態を戻したのち引き続き `setSize(1)` する
  - 既存の受信箱・カテゴリ・ブックマーク等のビューでの `unreadOnly` 算出・トグル非表示の挙動に回帰が無いことを確認する
  - 単体テストが通り、命令的メソッドの呼び出しで `setSize(1)` とスクロールが実行され、`ArticleList` 自身はトグルを描画しないことが確認できる状態になる
  - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 5.1, 5.2_
  - _Boundary: ArticleList_

- [x] 5.3 ArticleListPage の配線: フィード用トグルをヘッダーへ統合する
  - ページコンポーネントでフィードIDから個別フィードページかどうかを判定し、`useFeedUnreadOnly` を呼び出す
  - 個別フィードページのときトグル要素を生成し、ヘッダーの新しいアクションスロットへ渡す
  - トグルのクリックハンドラで状態を反転させたのち、`ArticleList` の命令的メソッド経由でページング・スクロールをリセットする
  - `ArticleList` へは表示状態の値と変更コールバックを props として渡す
  - 個別フィードページでのみトグルがヘッダーに描画され、受信箱・カテゴリ・ブックマーク等の他ビューでは描画されないことを確認する
  - 結合テストが通り、トグルをクリックすると一覧が未読のみ表示に切り替わり、先頭から再読み込みされることが確認できる状態になる
  - _Requirements: 1.1, 1.2, 1.5, 5.1, 5.2, 7.1, 7.2_
  - _Depends: 5.1, 5.2_
  - _Boundary: ArticleListPage_

- [x] 5.4 スクロール中も表示位置が変わらないことを検証する
  - 個別フィードページで記事一覧をスクロールしても、トグルがヘッダー内(常時表示領域)に表示され続けることを確認する
  - フィード名の文字数が異なる複数のケースで、トグルの画面上の位置(ヘッダー右側の領域)が変わらないことを確認する
  - フィードページとフォルダページを行き来しても、ヘッダーの内容が正しく切り替わることを確認する
  - 結合テストがすべて通り、要件7のすべての受け入れ基準が満たされる状態になる
  - _Requirements: 7.1, 7.2, 7.3_
  - _Depends: 5.3_

- [x] 6. 表示状態のひと目での判別(要件8): 共有トグルスイッチの新設とFeedUnreadOnlyToggleへの統合
- [x] 6.1 UnreadOnlyToggleSwitch を実装する
  - 「すべて表示」「未読のみ表示」の2セグメントを常に両方描画する
  - 現在選択されている側のセグメントを、既存Buttonのdefaultバリアントと同じテーマトークンで強調表示する
  - 現在選択されていない側のセグメントがクリックされたときのみonChangeを呼ぶ(選択中のセグメントのクリックでは呼ばない)
  - 各セグメントのaria-labelを呼び出し元から渡された文字列で設定する(このコンポーネント自身は文言を持たない)
  - 新しい配色トークンを追加せず、既存のButtonと同じテーマトークンのみを使う
  - コンポーネントテストが通り、unreadOnlyの値に関わらず両セグメントが常に描画され、アクティブ側の強調表示と、選択が変わるクリックでのみonChangeが呼ばれることが確認できる状態になる
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - _Boundary: UnreadOnlyToggleSwitch_

- [x] 6.2 FeedUnreadOnlyToggle を UnreadOnlyToggleSwitch を使う実装に置き換える
  - 内部の描画をテキストリンクからUnreadOnlyToggleSwitchの利用に置き換える
  - 外部向けprops({unreadOnly, onToggle})は変更しない
  - 既存のfeed.unreadOnlyToggle.showAll/showUnreadOnlyの文言を各セグメントのaria-labelとして渡す
  - 現在の状態と異なるセグメントがクリックされたときのみonToggleを呼ぶ(旧テキストリンク実装の「常にonToggleが呼ばれる」前提を置き換える)
  - コンポーネントテストが通り、両セグメントのaria-labelが既存文言で描画され、状態と異なるセグメントのクリックでのみonToggleが呼ばれることが確認できる状態になる
  - _Requirements: 1.1, 1.5, 6.1, 8.1, 8.2, 8.3, 8.4_
  - _Depends: 6.1_
  - _Boundary: FeedUnreadOnlyToggle_

## Implementation Notes
- `mise` is not available in this sandbox, so `npm run test` (which wraps `mise exec node@22 -- vitest run`) fails at the wrapper level. Use `npx vitest run [path]` directly instead — same vitest config, already-active Node 22.
- `feedAllReadEmpty`を追加した際、既存の`isEmpty && !allReadEmpty && !isLoading`ゲート(FeedErrorBanner/汎用の空メッセージ)も`!feedAllReadEmpty`を除外条件に加える必要があった。`allReadEmpty`同様、他の空状態フォールバックと二重表示しないよう、新しい空状態フラグを追加する際は既存の`isEmpty`系フォールバック条件も併せて見直すこと。
- Task 5(要件7)は `folder-unread-only-toggle` の対応するヘッダー統合タスクの前提になる。`headerRight`(Task 5.1)と `ArticleListHandle` の命令的メソッド(Task 5.2)は、このスペックが新設・所有する共有の仕組みであり、`folder-unread-only-toggle` 側はこれらを複製せずそのまま再利用する設計になっている(design.md の Allowed Dependencies / Revalidation Triggers 参照)。
- Task 5 実装時の学び:
  - `ArticleListPage`(`src/app.tsx`)はこれまでファイル内非公開の関数だったが、ページレベルの結合テスト(`src/app.test.tsx`)から直接マウントできるよう `export` を追加した。動作は変更していない。
  - design.md の File Structure Plan は `page-layout.test.tsx` の新設を挙げていたが、`PageLayout` は `useAppLayout()`(ルーターの outlet context)と `FeedList` に依存しており、単体でのモック構築コストの割に得られる検証が薄いと判断し、代わりに `src/app.test.tsx` で `ArticleListPage → PageLayout → Header` を実際にマウントする結合テストで `headerRight` の配線を検証した。`page-layout.test.tsx` は意図的に作成していない。
  - `useFeedUnreadOnly` の呼び出し元が `ArticleList` から `ArticleListPage` に移ったため、フィード切り替え時の状態復元を検証していた `article-list.test.tsx` 内の記事一覧テストは、同等のシナリオを `app.test.tsx` 側の結合テストへ移設した(カバレッジの欠落なし)。
  - `CategoryUnreadOnlyToggle`(フォルダ用トグル)は本タスクでは意図的に未変更のまま `article-list.tsx` に残置した。これを移動するのは `folder-unread-only-toggle` の対応タスクの責務。
- Task 6(要件8)は `folder-unread-only-toggle` の対応タスクの前提になる。Task 6.1 が新設する `UnreadOnlyToggleSwitch`(`src/components/ui/`)は、`headerRight`(Task 5.1)と同様にこのスペックが新設・所有する共有UIプリミティブであり、`folder-unread-only-toggle` 側はこれを複製せずそのまま再利用する設計になっている(design.md の Allowed Dependencies / Revalidation Triggers 参照)。`/kiro-impl folder-unread-only-toggle` の対応タスクを実行する前に、本スペックの Task 6.1 が完了していることを確認すること。
- Task 6.2 実装時の学び: `FeedUnreadOnlyToggle` が文言を可視テキストではなく各セグメントの `aria-label` として持つようになったため、`src/app.test.tsx` の既存のページレベルテストのうち `getByText('Unread only'|'Show all')` でフィード用トグルを検出していたものが軒並み壊れた(可視テキストが無くなったため)。`getByRole('button', { name: ... })` と `.getAttribute('aria-pressed')` に置き換えて修正した。`CategoryUnreadOnlyToggle`(フォルダ用、本タスクでは未変更)は引き続きテキストリンクのままなので、そちらのアサーションは意図的に変更していない。フィード・フォルダ両トグルが同時に描画されないことを検証するテスト(`shows only one toggle at a time...`)は、`UnreadOnlyToggleSwitch` だけが持つ `role="group"` の有無をフィード/フォルダの判別シグナルとして使うよう書き換えた。`folder-unread-only-toggle` の対応タスク(Task 6)で `CategoryUnreadOnlyToggle` も `UnreadOnlyToggleSwitch` に置き換わると、この `role="group"` ベースの判別は両ページで真になり意味を失うため、その時点で該当テストの見直しが必要になる。

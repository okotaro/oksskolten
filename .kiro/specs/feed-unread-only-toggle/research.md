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
  - [Issue #15](https://github.com/okotaro/oksskolten/issues/15) で「現在のテキストリンク実装では今どちらのモードか、切り替えたら何のモードになるか判別しづらい」という指摘を受けた。`src/components/ui/` には既存の2択トグル/セグメントコントロールが無く、新規に汎用UIプリミティブを起こす必要がある。

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

### トグルがスクロールで隠れる問題(Issue #14)への対応

- **Context**: 実装後、[Issue #14](https://github.com/okotaro/oksskolten/issues/14) で「記事一覧をスクロールすると未読/既読の表示切り替えが画面外に消える」という指摘を受けた。ユーザーは「フォルダ/フィードのタイトル行と同じ常時表示領域に移動してほしい。タイトル行のすぐ横だとタイトルの長さで位置がずれるので避けたい」と提案(コメントのスクリーンショットはヘッダー右上への配置を示す)。
- **Sources Consulted**: `src/components/layout/header.tsx`(list モードの `sticky top-0 z-30` ヘッダーと右側の `w-8` スペーサー)、`src/components/layout/page-layout.tsx`、`src/app.tsx`(`ArticleListPage`)、`.claude/rules/frontend.md`(z-indexスケール)。
- **Findings**:
  - ヘッダーは `sticky top-0 z-30` で常時画面上部に固定されており、右側に幅合わせ用の空スペーサー(`<span className="w-8" />`)がある。ここがユーザーの提案する「常時表示領域」に一致する。
  - `Header`/`PageLayout` と `ArticleList` は兄弟関係にあり、共通の親は `ArticleListPage`(`src/app.tsx`)である。トグルをヘッダー側で描画するには、状態管理とクリックハンドラを `ArticleList` から `ArticleListPage` へ引き上げる必要がある。
  - `.claude/rules/frontend.md` は「フローティングUIのポータルは常に `<body>` を対象にする」と定めており、`Header` 内のDOM要素への直接ポータル(`createPortal`)はこの規約と整合しない。
  - CSS `position: fixed` でヘッダー右上に重ねる案は、`.claude/rules/frontend.md` のz-indexスケール(`z-30 header`、`z-40` 以降はフローティングUI)に無い独自の中間値が必要になり、規約と整合しない。
  - `ArticleList` は既に `ArticleListHandle`(`revalidate`)という命令的ハンドルの仕組みを持っており、親コンポーネントから子の内部処理を呼び出す前例が既にある。
- **Implications**: 状態(`useFeedUnreadOnly`)とトグルのクリックハンドラを `ArticleListPage` に引き上げ、`PageLayout`/`Header` に新設する汎用スロット `headerRight` へ通常のReact子要素として渡す。ページング・スクロールのリセット(`setSize(1)` + `window.scrollTo(0, 0)`)は `ArticleList` 側に残し、新しい命令的メソッド `resetPagingAndScroll`(`ArticleListHandle` に追加)として公開する。この仕組みは `folder-unread-only-toggle` にも共通で使われるため、`feed-unread-only-toggle` が最初の導入者としてこれを所有する。

### デモモードへの影響
- **Context**: `docs/spec/86_feature_bulk_mark_read.md` にある通り、デモモードはAPIをモックで横取りする構成のため、新機能が黙って壊れないか確認した。
- **Sources Consulted**: `src/lib/demo/mock-api.ts`(113行)
- **Findings**: モックは `params.get('unread')` を汎用的に読み取っており、フィード/カテゴリ/受信箱を区別しない。
- **Implications**: デモモード側の追加実装は不要。

### 表示状態の見た目による判別性(Issue #15)への対応

- **Context**: [Issue #15](https://github.com/okotaro/oksskolten/issues/15) で「今どちらの表示モードか、切り替えたら何のモードになるかが一目でわからない」という指摘を受けた。添付のイメージ画像は「未読のみ表示」モード時の見た目を示すが、コメントで「色・形・フォント・サイズ等のデザイン面はイメージに従わず、既存のoksskoltenに合わせる」と明記されている。
- **Sources Consulted**: `src/components/article/feed-unread-only-toggle.tsx`、`src/components/article/category-unread-only-toggle.tsx`(いずれも現行実装、`text-accent text-sm hover:underline` のテキストリンク)、`src/components/ui/`(`button.tsx`、`radio-group.tsx`、`icon-button.tsx` ほか既存UIプリミティブ一覧)、`src/components/layout/header.tsx`(list モードの `headerRight` スロット、`min-w-8 shrink-0`)、`.claude/rules/frontend.md`(テーマトークン規約)
- **Findings**:
  - 現行実装は、クリック後に遷移する「先の状態」を表す文言をラベルとして表示する(例: `unreadOnly=true` のとき「すべて表示」)。今の状態そのものを表す表示ではないため、ラベルの意味を読み解かないと現在のモードが判別できない。
  - `src/components/ui/` には2択セグメント/トグルスイッチに相当する既存コンポーネントが無い。もっとも近いのは `RadioGroup` だが、縦積みリスト用のレイアウトでヘッダーの横並びスロットには使えない。
  - `Button`(`cva` ベースのバリアント定義)は `bg-accent`/`text-accent-text`(選択・強調)と `text-muted`/`hover:bg-hover`(非選択)のテーマトークンの組み合わせを既に持っており、新しい配色を追加せずに「選択中/非選択」の2状態を表現できる。
  - ヘッダーの `headerRight` スロットは `min-w-8 shrink-0` で、フィード用・フォルダ用のトグルはこのスロットの右寄せ領域に収まる必要がある(要件7/8で確立済みの制約)。両方の選択肢を常時表示する2択スイッチでも、アイコンベースの短いセグメントであれば収まる幅で構成できる。
- **Implications**: 新しい汎用UIプリミティブ `UnreadOnlyToggleSwitch` を `src/components/ui/` に新設し、既存の `Button` と同じテーマトークンのみで「常に両方の選択肢を表示し、現在選択されている側を強調する」2択スイッチを実装する。フィード用・フォルダ用の各トグルコンポーネントは、外部向けprops(`{ unreadOnly, onToggle }`)を変えずに内部実装だけをこのプリミティブに差し替える。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| `createLocalStorageHook` をそのまま転用 | ファクトリにフィードIDを渡して都度フックを生成 | 実装が最小 | フィード遷移時に再マウントされず状態が残留するバグになる(要検証で確認済み) | 不採用 |
| 専用フック(`useEffect` 再導出) | `feedId` の変化を `useEffect` で検知し、都度 `localStorage` を読み直す | 既存の404-410行のリセットパターンと一貫; バグを回避 | フックの実装がわずかに増える | 採用 |
| フィードごとに別コンポーネントとして `key={feedId}` で強制再マウント | ルートまたは一覧コンポーネントに `key` を付与 | シンプルに見える | `ArticleList` 全体の再マウントは他の状態(スクロール位置、読み込み済みページ等)にも影響し、影響範囲が本機能のスコープを超える | 不採用 |
| 単一ボタンのままアイコン・太字化で現在状態を示す | `FeedUnreadOnlyToggle` 自体は変えず、見た目の装飾のみ強化 | 変更範囲が最小 | クリック前後で「次にどちらになるか」を読み取る必要が残り、要件8.1(両方の選択肢を常時視認)を満たさない | 不採用 |
| フィード用・フォルダ用に個別のスイッチ実装を持つ | それぞれのコンポーネント内で独自にスイッチUIを実装 | 仕様間の依存が生まれない | 見た目・挙動が完全に同一であり、実装の重複と将来の見た目の乖離リスクがある | 不採用 |
| 汎用の2択スイッチ `UnreadOnlyToggleSwitch` を新設し両仕様で共有 | `src/components/ui/` に新規追加し、フィード用・フォルダ用トグルの双方から利用 | 見た目・挙動の一貫性を保証、実装の重複を避ける | 新しい共有UIプリミティブの責務(どちらの仕様が所有するか)を明確にする必要がある | 採用 |

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

### Decision: トグルの状態・クリックハンドラを `ArticleListPage` に引き上げ、ヘッダーの汎用スロットへ描画する

- **Context**: Issue #14。スクロールしても隠れない、かつタイトル文字数に位置が依存しない領域にトグルを表示する必要がある。ヘッダーはすでにその条件を満たす常時表示要素だが、`ArticleList` とは別コンポーネントである。
- **Alternatives Considered**:
  1. CSS `position: fixed` でヘッダー右上に重ねる — `.claude/rules/frontend.md` のz-indexスケールに合う値が無く却下
  2. `document.body` 以外(`Header` 内のDOM要素)への `createPortal` — `.claude/rules/frontend.md` の「ポータルは常に `<body>` を対象にする」規約に反するため却下
  3. トグルの状態・クリックハンドラを共通の親 `ArticleListPage` に引き上げ、`PageLayout`/`Header` に新設する `headerRight` prop へ通常の子要素として渡す
- **Selected Approach**: 3を採用。`ArticleList` 側のページング・スクロールリセットは `resetPagingAndScroll` として `ArticleListHandle` 経由で公開し、`ArticleListPage` のクリックハンドラから呼び出す。
- **Rationale**: 既存の規約(ポータルは `<body>` のみ、z-indexは定義済みスケールのみ)に違反せず、既存の `ArticleListHandle` パターンを拡張するだけで実現できる。フィード用・フォルダ用の両トグルが同じ仕組みを共有できる(`folder-unread-only-toggle` はこの仕組みを再利用する)。
- **Trade-offs**: `ArticleList` の `unreadOnly` に関する一部の状態(`feedUnreadOnly`)の所有元が `ArticleList` から `ArticleListPage` に移る。`isPlainFeedView` 相当の判定を両コンポーネントで独立して行うことになる(既に `isInbox` 等の類似判定が両コンポーネントに重複している既存の前例に倣う)。
- **Follow-up**: ルーティング構造が変わり `feedId` を持つルートが増えた場合、両コンポーネントの判定を同時に見直す必要がある(design.md の Revalidation Triggers 参照)。

### Decision: 空状態の文言は既存キーを再利用し、トグル本体の文言のみ新規追加
- **Context**: brief.md時点では「既存の文言を流用せず新規キーを追加する」としていたが、実際の文言内容を確認した結果を反映する。
- **Alternatives Considered**:
  1. 空状態・トグルとも全て新規キーを追加する
  2. 空状態は既存キー(`articles.allRead`, `articles.showReadArticles`)を再利用し、トグル本体のみ新規キーを追加する
- **Selected Approach**: 2を採用。
- **Rationale**: 既存の2キーの文言内容は、フィード単位の未読のみ表示が0件になった状態にもそのまま意味が通る。重複した文言を辞書に増やさない。
- **Trade-offs**: 将来どちらかの文言だけを変更したくなった場合は、2つの呼び出し元に影響する。現時点では意味が完全に一致しているためリスクは小さい。

### Decision: 汎用の2択スイッチ `UnreadOnlyToggleSwitch` を新設し、`feed-unread-only-toggle` が所有する
- **Context**: Issue #15。テキストリンク実装では現在のモードと切り替え後のモードをひと目で判別できない。フィード用・フォルダ用の両トグルが同じ見た目・挙動を必要とする。
- **Alternatives Considered**:
  1. 単一ボタンのままアイコン・太字化のみで現在状態を示す
  2. フィード用・フォルダ用にそれぞれ個別のスイッチ実装を持つ
  3. 汎用の2択スイッチを `src/components/ui/` に新設し、両仕様で共有する
- **Selected Approach**: 3を採用。`src/components/ui/unread-only-toggle-switch.tsx` に `UnreadOnlyToggleSwitch` を新設する。`headerRight` スロット(要件7)と同様に、本機能(`feed-unread-only-toggle`)が最初の導入者としてこれを所有し、`folder-unread-only-toggle` はそのまま再利用する。
- **Rationale**: `src/components/ui/` は `Button`/`IconButton`/`RadioGroup` など、特定の機能に属さない共有UIレイヤーとして既に運用されている。新規プリミティブをここに置くことで、`feed-unread-only-toggle`/`folder-unread-only-toggle` のどちらか一方が他方を所有するという不自然な依存を避けられる。`FeedUnreadOnlyToggle`/`CategoryUnreadOnlyToggle` の外部向けprops(`{ unreadOnly, onToggle }`)は変えないため、`ArticleListPage` 側の既存配線(要件7/8で確立済み)への影響もない。
- **Trade-offs**: `folder-unread-only-toggle` の実装が本機能(要件8)の完了に依存するようになる(タスク順序の制約)。ただし両仕様は元々 `headerRight`/`resetPagingAndScroll` で同様の依存関係を持っており、新しいパターンではない。
- **Follow-up**: `UnreadOnlyToggleSwitch` の props 契約や見た目を変更する際は `folder-unread-only-toggle` 側の影響を確認する(design.md の Revalidation Triggers 参照)。

## Risks & Mitigations
- フィード遷移時の状態残留バグ(`createLocalStorageHook` 転用時に発生) — 専用フックで `feedId` の変化ごとに再導出することで回避
- `useSWRInfinite` のページング状態が切り替え時に残る — トグルのハンドラで明示的に `setSize(1)` を呼ぶ
- `FeedMetricsBar` 非表示設定でトグルごと消える — トグルを独立した常時描画要素にする
- 将来 `articles.allRead` / `articles.showReadArticles` の文言をカテゴリ向け専用に変更したくなった場合、フィード単位の空状態表示にも影響する — 変更時は両方の利用箇所を確認する運用でカバー(現時点では additional な仕組みは導入しない)
- `folder-unread-only-toggle` の実装が `UnreadOnlyToggleSwitch`(本機能)の完了に依存する — `headerRight`/`resetPagingAndScroll` と同様のタスク順序制約として両仕様のタスク一覧に明記する

## References
- [Issue #12](https://github.com/okotaro/oksskolten/issues/12) — 未読記事だけ表示
- [Issue #14](https://github.com/okotaro/oksskolten/issues/14) — スクロールで隠れるトグルの表示位置修正
- [Issue #15](https://github.com/okotaro/oksskolten/issues/15) — 未読表示/既読表示のテキストリンクをトグルボタンにする
- [brief.md](./brief.md) — Discovery段階での方針と代替案検討
- [.kiro/specs/bulk-mark-read/design.md](../bulk-mark-read/design.md) — 記事一覧の絞り込み・アーキテクチャの既存パターン参照
- [docs/spec/86_feature_bulk_mark_read.md](../../../docs/spec/86_feature_bulk_mark_read.md) — デモモード構成の既存ドキュメント

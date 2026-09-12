# Research & Design Decisions: bulk-mark-read

## Summary

- **Feature**: `bulk-mark-read`
- **Discovery Scope**: Extension(既存システムへの機能追加。Light Discovery を適用)
- **Key Findings**:
  - 既読状態の更新と検索インデックス同期のパターンは `markAllSeenByFeed` に確立されている。更新前に対象IDを収集し、更新後に `syncArticleFiltersToSearch` を呼ぶ。新機能はこのパターンをそのまま踏襲できる。
  - 記事一覧の `autoReadIds` は「既読にしたが一覧からは消さない」という Requirement 3.2 の振る舞いを既に実装している。新たな状態を増やさず、この仕組みを一括既読にも共用する。
  - 記事一覧のフィルタ条件生成は `getArticles` の内部に閉じている。一括既読が同じ絞り込みを再現するには、この条件生成を切り出して共有する必要がある。
  - デモモードは `src/lib/demo/mock-api.ts` が API パスを横取りする構成のため、新しいエンドポイントを追加するとデモ側にも対応が必要になる。未対応のまま公開するとデモサイトで機能が黙って失敗する。
  - i18n の辞書は `ja` / `en` / `zh` の3ロケールを型として要求する。Requirement で求められているのは日本語と英語だが、既存構造に合わせて中国語も同時に追加する。

## Research Log

### 既読状態の更新パターン

- **Context**: 一括既読と取り消しを、既存の既読操作と矛盾しない形で実装する必要がある。
- **Sources Consulted**: `server/db/articles.ts` の `markArticleSeen` / `markArticlesSeen` / `markAllSeenByFeed`、`server/search/sync.ts`
- **Findings**:
  - 既読化は `UPDATE articles SET seen_at = datetime('now') WHERE ... AND seen_at IS NULL`。既に既読の記事は条件で除外される。
  - `markAllSeenByFeed` は更新前に対象IDを `SELECT` し、更新後に `syncArticleFiltersToSearch(ids.map(id => ({ id, is_unread: false })))` を呼ぶ。
  - 未読化 (`markArticleSeen(id, false)`) は `seen_at` と `read_at` の両方を `NULL` にし、`updateScoreDb` でスコアを再計算したうえで `syncScoreToSearch` と `syncArticleFiltersToSearch` を呼ぶ。スコア式は `read_at` を参照するため、未読化ではスコア再計算が必須。
  - 削除済み記事の除外は、読み取りでは `active_articles` ビュー、更新では `purged_at IS NULL` 条件で行う。
- **Implications**: 一括既読は `markAllSeenByFeed` と同じ3手順(対象ID収集 → 更新 → 検索同期)で実装できる。取り消しは `markArticleSeen` の未読化パスを複数件に拡張した形になり、スコア再計算を省略できない。

### 記事一覧の並び順と表示範囲

- **Context**: 「基準記事より上/下」をサーバー側で再現するには、一覧の並び順を正確に把握する必要がある。
- **Sources Consulted**: `server/db/articles.ts` の `getArticles`、`src/components/article/article-list.tsx` の `getKey`
- **Findings**:
  - 記事一覧はクエリに `sort` を送っていない。並び順は `opts.liked ? 'a.liked_at DESC' : opts.read ? 'a.read_at DESC' : 'a.published_at DESC'` で決まる。
  - 本機能の対象はフィード別・カテゴリ別の一覧に限定されたため、並び順は常に `published_at DESC` になる。
  - SQLite では `NULL` は最小値として扱われ、`DESC` では末尾に並ぶ。公開日時を持たない記事は一覧の最下部に位置する。
  - `ORDER BY published_at DESC` には第2ソートキーがない。公開日時が同一の記事同士の順序は不定。
  - smart floor は `smartFloor = !noFloor && !isClipFeed && !unread && !bookmarked && !liked && !read` の条件下でのみ適用され、`published_at` の下限として `conditions` に追加される。
- **Implications**: 方向判定は `published_at` のみで足りる。ただし同値の扱いと `NULL` の扱いを明示的に決める必要がある。smart floor は一括既読の対象判定から除外する(Requirement 2.6)ため、条件生成では floor を含まない基底条件だけを使う。

### デモモードの構成

- **Context**: 新しいエンドポイントを追加した場合のデモサイトへの影響を確認する。
- **Sources Consulted**: `vite.config.ts` の `demoAlias`、`src/lib/fetcher.demo.ts`、`src/lib/demo/mock-api.ts`、`src/lib/demo/demo-store.ts`
- **Findings**:
  - デモビルドでは `src/lib/fetcher.ts` が `fetcher.demo.ts` に差し替えられ、`apiPost` が `demoApiPost` になる。
  - `demoApiPost` は既知のパスを順に照合し、どれにも一致しない場合は末尾のフォールバックに落ちる。
  - `demo-store.ts` は既に `markAllSeenByFeed` / `markAllSeenByCategory` / `batchSeen` をインメモリで実装している。
- **Implications**: 新しい2つのエンドポイントは `mock-api.ts` に分岐を追加し、`demo-store.ts` に対応する操作を実装する必要がある。デモ実装は本番と同じ並び順・同じ絞り込みで対象を決めなければ、デモで見える挙動が本番と食い違う。

### 取り消しの実現方式

- **Context**: 取り消しでは「その操作で新たに既読にした記事だけ」を未読に戻す必要がある(Requirement 4.4, 4.5)。
- **Sources Consulted**: `server/db/articles.ts`、`server/routes/articles.ts` の `MAX_BATCH_SEEN`
- **Findings**:
  - 既存の `batch-seen` は上限100件。一括既読の対象は数百から数千件になりうるため、既存エンドポイントは流用できない。
  - `seen_at` は `datetime('now')` による秒精度。一括既読の1文で更新した行は全て同一の値を持つ。
  - スクロール自動既読は約1.5秒間隔でバッチ送信しており、同じ秒に別経路の既読化が発生しうる。
- **Implications**: 「タイムスタンプ一致で戻す」方式は自動既読との競合で誤って戻す可能性がある。対象IDを応答で返し、取り消しではそのIDを送り返す方式を採る。

### トーストの取り消しUI

- **Context**: Requirement 4.2 と 4.3 を満たす通知の実現方法を確認する。
- **Sources Consulted**: `package.json` (`sonner` ^2.0.7)、`src/components/article/article-list.tsx` のトースト利用箇所
- **Findings**:
  - 既存コードは `toast.success` / `toast.error` / `toast` を文言のみで呼んでおり、`action` オプションの利用例はない。
  - sonner はトーストの第2引数で `action: { label, onClick }` と `duration` を受け付ける。
- **Implications**: 取り消しボタンは sonner の `action` で実現でき、独自の通知UIを作る必要はない。`duration: 10000` で Requirement 4.3 を満たす。

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| サーバー側で基準記事＋方向から解決 | 基準記事ID・方向・絞り込み条件を受け取り、サーバーが対象を決定して更新する | 未読込みの記事も対象にできる。画面の並びと結果が一致する | 一覧のフィルタ条件生成を共有するリファクタリングが必要 | **採用**。Requirement 2.4-2.6 を満たす唯一の方式 |
| クライアントが対象IDを列挙 | 読み込み済みの記事IDを既存の `batch-seen` に渡す | 実装が最小。サーバー変更なし | 読み込み済みの記事しか対象にできない。上限100件 | 却下。Requirement 2.5 を満たせない |
| 公開日時のみで比較しフィルタを無視 | 絞り込み条件を考慮せず日時だけで範囲更新 | SQL が最も単純 | 表示中のフィード外の記事まで既読になる | 却下。Requirement 2.4 に違反 |

## Design Decisions

### Decision: 取り消しは対象IDの往復で行う

- **Context**: 取り消しは、その操作で新たに既読になった記事だけを対象にしなければならない。
- **Alternatives Considered**:
  1. 一括既読の応答に `seen_at` の値を含め、取り消しでは同じ範囲かつ同じ `seen_at` の行を戻す
  2. 操作IDを記録する列またはテーブルを追加し、操作単位で戻す
  3. 一括既読の応答に対象IDの配列を含め、取り消しではそのIDを送り返す
- **Selected Approach**: 3。`POST /api/articles/range-seen` が `{ updated, ids }` を返し、`POST /api/articles/batch-unseen` が `{ ids }` を受け取る。
- **Rationale**: 1 はスクロール自動既読と同じ秒に処理が重なった場合、自分が既読にしていない記事まで戻してしまう。`seen_at` は秒精度であり、自動既読は約1.5秒間隔で動くため、この競合は現実に起こりうる。2 はスキーマ変更とマイグレーションが必要で、一時的な取り消しのためには重すぎる。3 は正確で、スキーマ変更が不要。
- **Trade-offs**: 対象件数が多い場合に応答と要求のペイロードが大きくなる。1万件でおよそ70KB。自己ホスト型の個人向けリーダーという性質上、許容範囲と判断する。
- **Follow-up**: 実装時に上限 50,000 件を超える要求を 400 で拒否する。現実的な未読件数を大きく上回る値であることをテストで確認する。

### Decision: 公開日時が同値の記事は両方向で対象に含める

- **Context**: 一覧の `ORDER BY published_at DESC` には第2ソートキーがなく、同値の記事の前後関係は不定。Requirement 2.7 は「一覧に表示されている順序と同じ基準で前後を判定する」と定めている。
- **Alternatives Considered**:
  1. `id` を第2ソートキーとして一覧と一括既読の両方に導入する
  2. 同値の記事は方向によらず対象に含める(基準記事と同じ位置とみなす)
- **Selected Approach**: 2。上方向は `published_at >= 基準日時`、下方向は `published_at <= 基準日時` とする。
- **Rationale**: 1 は `getArticles` の並び順を変更することになり、「既存の挙動を変えない」という制約に反する。2 は同値の記事を「同じ位置」として扱うもので、Requirement 2.2 と 2.3 の「同じ位置またはそれより前/後」に整合する。画面上「上」に見える記事が未読のまま残る取りこぼしも起きない。
- **Trade-offs**: 上方向の操作で、画面上は基準記事のすぐ下に表示されていた同時刻の記事も既読になる場合がある。取り消しが提供されるため影響は限定的。
- **Follow-up**: 同一 `published_at` の記事を含むケースをDBテストで固定する。

### Decision: 公開日時を持たない記事は最も古い記事として扱う

- **Context**: `published_at` が `NULL` の記事が存在しうる。
- **Alternatives Considered**:
  1. `NULL` の記事を対象から常に除外する
  2. 一覧での表示位置(最下部)に合わせ、最も古い記事として扱う
- **Selected Approach**: 2。基準記事が日時を持つ場合、下方向は `published_at IS NULL` の記事を含み、上方向は含まない。基準記事自身が日時を持たない場合、上方向は絞り込み内の全記事、下方向は `published_at IS NULL` の記事のみを対象とする。
- **Rationale**: SQLite の `DESC` では `NULL` が末尾に並ぶため、2 が画面の見た目と一致する。1 は下方向の操作で最下部の記事が未読のまま残り、利用者の意図に反する。
- **Trade-offs**: 基準記事が日時を持たない場合の上方向は絞り込み内のほぼ全件になる。これは一覧最下部の記事を基準にした場合の正しい挙動。
- **Follow-up**: `NULL` を含むケースをDBテストで両方向とも固定する。

### Decision: `getArticles` から条件生成を切り出して共有する

- **Context**: 一括既読は一覧と同じ絞り込みを再現しなければならない(Requirement 2.4)。
- **Alternatives Considered**:
  1. 一括既読側で条件式を書き下ろす
  2. `getArticles` から条件生成部分を関数として切り出し、両者で共有する
- **Selected Approach**: 2。`buildArticleConditions` を `server/db/articles.ts` 内に切り出す。smart floor はこの関数の外側に残し、`getArticles` だけが適用する。
- **Rationale**: 1 は条件が二重管理になり、将来フィルタが追加されたときに一覧と一括既読の対象がずれる。2 は単一の定義を共有するため、ずれが構造的に起きない。smart floor を外側に残すのは、一括既読が floor を無視する(Requirement 2.6)ため。
- **Trade-offs**: `getArticles` に手を入れるため、記事一覧全体に影響する。振る舞いを変えない純粋な切り出しに限定し、既存のテストで担保する。
- **Follow-up**: 切り出し前後で `server/db/articles.test.ts` が全て通ることを確認する。

### Decision: 一括既読の表示反映は既存の `autoReadIds` に相乗りする

- **Context**: Requirement 3.2 は、未読のみの絞り込み中でも対象記事を一覧から消さず既読の見た目で残すことを求めている。
- **Alternatives Considered**:
  1. 一括既読専用のローカル状態を追加する
  2. スクロール自動既読が使っている `autoReadIds` を一括既読からも更新する
- **Selected Approach**: 2。状態名を役割に合わせて `locallyReadIds` に改め、自動既読と一括既読の両方が書き込む。
- **Rationale**: `autoReadIds` は既に「既読にしたが一覧からは消さない」という振る舞いを実現している。同じ目的の状態を2つ持つと、表示判定が二重化して不整合を生む。
- **Trade-offs**: 既存コードの名称変更をともなう。変更範囲は `article-list.tsx` 内に閉じる。
- **Follow-up**: 取り消し時にIDを取り除く経路を追加する。

## Risks & Mitigations

- 取り消しのペイロードが対象件数に比例して大きくなる — 上限を 50,000 件とし、超過時は 400 を返す。現実的な未読件数を大きく上回る値であることを設計に明記する。
- `getArticles` の切り出しが記事一覧の挙動を変える — 振る舞いを変えない切り出しに限定し、既存の `getArticles` テストを変更せずに通す。
- デモモードへの追従漏れでデモサイトの一括既読が黙って失敗する — デモ実装を同じタスクに含め、デモ側でも対象決定ロジックが本番と同じ規則に従うことをテストで確認する。
- 大量件数の更新が単一トランザクション内で長時間ロックを取る — 対象IDの収集と更新を1つのトランザクションにまとめつつ、`IN` 句は内部で分割して SQLite のパラメータ数上限に依存しないようにする。
- 一括既読の直後に一覧が再検証され、未読のみの絞り込みで対象記事が消えて取り消しの確認ができなくなる — 一括既読の完了時は未読件数の再検証に留め、記事一覧自体の再取得は行わない。

## References

- [Issue #5 複数記事を一括で既読にする機能を追加する](https://github.com/okotaro/oksskolten/issues/5) — 本機能の原典
- `server/db/articles.ts` — 既読更新と検索同期の既存パターン
- `src/components/feed/feed-context-menu.tsx` — 右クリックメニューの既存実装パターン
- `src/lib/demo/mock-api.ts` — デモモードの API 横取り構成

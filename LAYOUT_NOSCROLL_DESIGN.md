# 全画面ノースクロール化 設計書（タブレット優先）

目的: どのゲームも**縦スクロールなしで1画面に収まる**こと。第一目標はタブレット（横 1024×768 / 縦 768×1024）。スマホは第2フェーズ（今回は「壊さない」ことのみ要求）。

## 0) 実測結果（2026-08-19・修正前）

| 画面 | 横置き768h あふれ | 縦置き1024h あふれ | 主因（実測px） |
|---|---|---|---|
| lobby_host | **1113** | **342〜818** | QRカード350 / ゲームグリッド325 / コードネーム割当UI427 / 参加者リスト |
| bohnanza_player | **634** | **356** | bz-act 190 / bz-mine 206-229 / bz-handbox 221 / bz-others 257 / ログcard 147 |
| bohnanza_table | **285** | **51** | ヘッダcard 151 / bz-seats 373-395 / ログcard 179 |
| home | **201** | 0 | menu stack 651 + hero 182 |
| loveletter_table | **40** | 0 | ll-table 520 |
| ll_player / hannin_* / codenames_* / ww_* / oekaki_player / lobby_player | 0 | 0 | —（**現状維持が必須**） |

計測方法: `document.documentElement.scrollHeight - window.innerHeight`（0以下が合格）。

## 1) 方針

- **全面app-shell化はしない**。あふれている画面だけを、既存の文書フローのまま「収まる」構造に直す。
- 高さが動的なもの（ログ・参加者一覧）は **上限付き内部スクロール**（`max-height` + `overflow-y:auto`）にして、将来の状態変化でも画面全体があふれない構造にする。
- 横2カラム化は `@media (min-width: 900px)` で適用（横置きタブレット）。縦置き（幅768）は1カラムのまま各部を圧縮。
- `@media (max-height: 820px)` で全体の余白・フォントを一段圧縮する共通「コンパクトモード」を bbg.css に導入（.card padding、gap、見出しサイズ等）。
- スマホ（幅≤430）は既存の見た目を維持（新media queryは 768/900 以上と max-height 条件のみに限定し、狭幅への影響を出さない）。

## 2) 画面別設計

### 2.1 lobby_host（最優先）
- **幅900以上**: 2カラムグリッド（左=QR+参加URL+参加者、右=ゲーム選択+ゲーム別設定+開始ボタン）。左右とも `max-height: calc(100dvh - ヘッダ)` 内で内部スクロール可。
- **QRカード圧縮**: QR canvas 200→140px（幅768未満では120）。参加URLは1行省略表示（コピーボタンは維持）。
- **ゲームグリッド**: 2列→3列（幅768以上）。カードの縦paddingを圧縮（325→~200目標）。
- **参加者リスト**: 行リスト→チップ列（flex-wrap）。多人数でも `max-height:180px` + 内部スクロール。
- **コードネーム割当UI**: 1人1行の select 2個を1行にまとめ、行高を圧縮。全体を `max-height:260px` + 内部スクロール。
- 合格条件: 4人参加+コードネーム選択状態で横置き・縦置きとも あふれ0。

### 2.2 bohnanza_player
- **幅900以上**: 2カラム（左=状況ヘッダ+アクション(bz-act)+自分の畑(bz-mine)、右=手札(bz-handbox)+ほかの人(bz-others)+ログ）。
- **カードサイズを高さ連動に**: 手札/めくれ札カードの高さを `clamp(88px, 16dvh, 150px)` 系に（豆メーター表は現行の2列グリッドを維持しつつ縮小時は文字を落とす）。
- **bz-others**: プレイヤーごとの畑タイル表示→1行チップ（名前・🪙・畑2〜3個をミニ表記「🔵×3」）。257→~90目標。
- **ログ**: `max-height: 96px` + 内部スクロール（最新が見える向き）。
- **bz-act（アクション領域）**: 見出し文とボタンの余白圧縮。フェーズで内容が変わるため `min-height` は設けない。
- 合格条件: デモ(4人・手札7枚・pending あり)で横置き・縦置きとも あふれ0。手札7枚は横スクロール（既存仕様）でよいが、**ページの横スクロールは不可**。

### 2.3 bohnanza_table
- **bz-seats**: 縦積み→`grid-template-columns: repeat(2, 1fr)`（幅900以上は4人時 repeat(4,1fr) でもよい）。各席タイルの畑表示をミニ化（player画面の bz-others と同型）。
- ヘッダ情報（やまふだ/すてふだ/まぜた/手番）を1行バーに。ログは `max-height:120px` 内部スクロール。
- 合格条件: 4人で横置き・縦置きとも あふれ0。

### 2.4 home
- **幅900以上**: メニュー（ロビーを作る/テーブル端末/おえかきリレー）を2カラム化、hero を圧縮（182→~110）。デモボタン行は横並び維持。
- 「いま ひらいているロビー」一覧は `max-height:200px` + 内部スクロール（ロビーが多い時にあふれる既存リスク対策）。
- 合格条件: ロビー2件表示+デモボタン3個で横置き あふれ0。

### 2.5 loveletter_table（微調整）
- `.ll-table` のカード列サイズを `min(◯px, ◯dvh)` 化して40px分吸収（余白調整でも可）。**ll_player には触らない**。

## 3) 実装規約・制約

- 既存で「あふれ0」の画面（ll_player / hannin_* / codenames_* / ww / oekaki / lobby_player）の DOM 構造・クラスは変更しない（共通コンパクトモードのCSSが当たるのは可。ただし当該画面で新たなあふれ・横あふれ・操作不能を出さない）。
- bbg.js の render 関数の変更は**マークアップの構造とクラス付与のみ**（ゲームロジック・購読・トランザクションに触らない）。
- CSS は bbg.css に追記/修正。既存トークン（--card, --line, --radius 等）を使用。`dvh` は `vh` フォールバックを併記（`height: 100vh; height: 100dvh;` の順）。
- ダークテーマ前提（既存どおり）。CRLF維持。`node --check` 必須。
- デモバー（#bbgDemoBar, position:fixed）がデモ時に下部を覆う分は考慮不要（デモ専用UI）。

## 4) 検証手順（実装者が実行）

ローカルサーバー（`.claude/launch.json` の bbg-verify, port 8137）+ Browserペイン。**screenshotは使わない**（壊れているため read_page / javascript_tool で確認）。

1. 計測スニペット: `document.documentElement.scrollHeight - window.innerHeight` を各画面で実行（≤0 で合格）。横 1024×768 と縦 768×1024 の両方。
2. 状態の作り方:
   - bohnanza/loveletter/hannin: `?screen=demo_bohnanza` 等のデモを開き ⏸ で一時停止 → 視点セレクトで bot 画面/テーブルを測る。
   - lobby_host 4人状態: ロビー作成後、`firebase.database().ref('lobbies/<id>').update({...})` で members/testbob 等3人と order を直接追加（本セッションで実績あり。ロビー5955が残っていれば再利用可、currentGame は remove してから）。
   - codenames 回帰: lobby から開始（room 91nmnxyw が残っていれば直接開いてもよい）。
3. 回帰: 現状あふれ0の全画面が引き続き 0 であること・全画面で横方向あふれ0であること。
4. 後片付け: テストで作った lobbies/bohnanzaRooms 等を remove。

## 5) 第2フェーズ（今回はやらない）

スマホ（375×667〜430×932）で同等のノースクロール化。今回の実装は 768 未満の幅に新たな崩れを持ち込まないこと。

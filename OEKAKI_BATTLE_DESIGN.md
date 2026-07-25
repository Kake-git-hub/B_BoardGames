# おえかきバトル 設計書（実装引き継ぎ用）

作成日: 2026-07-19 / 対象: bbg.js への新ゲーム追加（実装は次セッションで行う）

> **注意**: 本書の bbg.js 行番号は 2026-07-19 時点（commit b920a16）のもの。編集で行番号はずれるため、関数名・文字列で検索して特定すること。

---

## 1. ゲーム概要（確定仕様）

- **判定方式**: 採点ランキング型。全員が**同じお題**を制限時間内に描き、AI（Gemini）が各絵を100点満点で採点＋一言コメント。点数順にランキング発表。
- **ラウンド構成**: 1ラウンド完結。結果画面の「もういっかい」ボタン（ホストのみ）で**同一メンバー・同一ルームのまま**新しいお題で次ラウンドへ（累積ポイントなし）。
- **テーブル端末（gmdev）画面**: 専用のドーン表示は**作らない**。gmdev 端末は描画UIなしの進行ステータス＋結果一覧表示（後述 §5.3）。
- **最小人数**: 2人。

### ゲームフロー

```
ロビー（ホストが設定＋開始）
  → phase:'drawing'   全員が同じお題を描く（残り時間表示、完成ボタン or 時間切れで自動提出）
  → phase:'judging'   ホスト端末が Gemini API を1回呼んで全員分を採点
  → phase:'result'    ランキング＋各絵＋点数＋AIコメント表示
      → 「もういっかい」（ホスト）→ 同室リセットで phase:'drawing' に戻る
      → ヘッダータイトルクリック（既存共通動線）→ currentGame=null で全員ロビー復帰
```

---

## 2. 設定項目（ロビーのホスト画面）

`lobbies/<id>/oekakiSettings` に保存（既存の `wordwolfSettings` 等と同パターン）。

| 項目 | UI | 値 |
|---|---|---|
| 制限時間 | `<input type="range" min="30" max="180" step="30">` ＋現在値表示（例「1分30秒」） | 30/60/90/120/150/180 秒 |
| お題モード | ラジオ or select | `random` / `custom` |
| 適正年齢（randomのみ表示） | 3択 | `kids`（〜6歳: りんご・ねこ 等）/ `school`（小学生: 消防車・カブトムシ 等）/ `adult`（一般: 自由の女神・二日酔い 等） |
| 自由記入お題（customのみ表示） | `<input type="text">` | ホストが入力。**採点型なので全員がお題を知ってよい**（秘匿不要） |

- 保存ヘルパー `setLobbyOekakiSettings(lobbyId, settings)` を `setLobbyWordwolfSettings`（bbg.js:1123-1132）に倣って追加。
- `lobbyRenderKey()`（bbg.js:12331-12356）の監視フィールドに `oekakiSettings` を追加（無駄再描画防止）。

### お題リスト

コード内蔵の配列を3年齢帯で用意する（現在: ようじ135 / しょうがくせい143 / おとな125 ＝ 計403個）。
同じお題ばかり出ないよう数を多めに持ち、プール内・プール間とも重複なしで管理する。

```js
var OEKAKI_TOPICS = {
  kids:   ['りんご','ねこ','たいよう', ...],
  school: ['消防車','カブトムシ','ラーメン', ...],
  adult:  ['自由の女神','二日酔い','満員電車', ...]
};
```

選定基準: 「絵で描けて、AIが画像から識別しうる具体物・情景」。抽象語（愛・平和など）は避ける。同ルーム内で直前のお題と同じものは再抽選。

---

## 3. AI判定（Gemini API）

### 3.1 採用API: Google Gemini API（無料枠）— 推奨

- 画像入力（vision）対応、**ブラウザから直接 fetch 可能（CORS対応）**、クレカ登録不要の無料枠あり。
- キー取得: [Google AI Studio](https://aistudio.google.com/app/apikey)（Googleアカウントのみで即発行）。
- 無料枠はモデル・時期により変動する（Flash系で目安 10 RPM / 日あたり数百リクエスト程度。正確な現在値は [AI Studio のレート制限画面](https://aistudio.google.com/rate-limit) で確認。公式ドキュメント: [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)、[Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)）。
- **本ゲームは1ラウンド＝API 1リクエスト**（全員の絵を1回のリクエストにまとめて送る）ため、無料枠で十分足りる。

代替（Geminiが使えない場合の選択肢。実装は不要、参考情報）:

- [OpenRouter の :free モデル](https://openrouter.ai/openrouter/free) — 1キーで複数モデル、CORS可。無料枠は日次制限が小さめ。
- Groq 無料枠（Llama系 vision）— 高速だがブラウザ直呼びは非推奨構成。
- TensorFlow.js 等のローカル分類 — 完全無料だが「お題との一致度採点」は精度不足。

### 3.2 キーの管理

- Firebase設定と同じ2系統: `?screen=setup` 画面に「Gemini APIキー」欄を追加して localStorage 保存（bbg.js:589-594 のパターン）＋ `bbg-config.js` 埋め込みオプション。
- **判定を実行するのはホスト端末のみ**なので、キー設定はホスト端末だけでよい。参加者には不要。
- GitHub Pages 公開でキーが露出するリスクへの対処: Google Cloud Console でキーに **HTTPリファラー制限**（公開URLのみ許可）＋ **Generative Language API のみに制限** をかけることを README に明記。

### 3.3 API呼び出し仕様

エンドポイント（compat SDK 不要、素の fetch でよい）:

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=<API_KEY>
Content-Type: application/json
```

ボディ（概形）: 1リクエストに「プロンプト＋全員分の画像（inline_data, base64）」を順番に並べる。

```js
{
  contents: [{ parts: [
    { text: judgePrompt },                       // §3.4
    { text: '絵1（プレイヤー: たろう）' },
    { inline_data: { mime_type: 'image/jpeg', data: b64_1 } },
    { text: '絵2（プレイヤー: はなこ）' },
    { inline_data: { mime_type: 'image/jpeg', data: b64_2 } },
    // ...
  ]}],
  generationConfig: {
    response_mime_type: 'application/json',
    response_schema: {                            // 構造化出力でパース事故を防ぐ
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: {
        index:   { type: 'INTEGER' },
        score:   { type: 'INTEGER' },
        comment: { type: 'STRING' }
      }, required: ['index','score','comment'] }
    }
  }
}
```

- モデル名は `gemini-flash-latest` のようなエイリアスか、実装時点の最新 Flash 系を1つ定数化（`OEKAKI_MODEL`）。404時に備えフォールバック候補をもう1つ持つとよい。
- base64 は dataURL から `data:image/jpeg;base64,` プレフィックスを剥がして渡すこと。

### 3.4 判定プロンプト（日本語）

```
あなたはお絵かきゲームの審査員です。お題は「<topic>」です。
以下にプレイヤーの絵を順番に示します。それぞれについて、
お題らしさ・伝わりやすさ・工夫を基準に0〜100点で採点し、
日本語20文字以内のポジティブな一言コメントを付けてください。
点数は差がつくようにし、同点は避けてください。
絵の番号(index)は提示順の1始まりです。JSON配列のみを返してください。
```

### 3.5 実行タイミングと多重実行ガード

- ホスト端末の room 購読コールバックで「`phase==='drawing'` かつ（全員提出済み or `endsAt` 超過）」を検知したら、`runTxn` で `phase:'drawing'→'judging'` を CAS 的に奪ってから API を呼ぶ（トランザクションで phase を確認・更新することで二重判定を防止）。
- 成功: `result` を書き込み `phase:'result'`。
- 失敗（ネットワーク/quota/パース失敗）: `result.error` にメッセージを書き `phase:'result'`。結果画面に「再判定」ボタン（ホストのみ、phase を 'judging' に戻して再実行）と「AIなしで発表」（点数なしで絵だけ並べる）を出す。
- 未提出プレイヤー（時間内に image が無い）は判定対象から除外し、結果では「未提出」表示。提出者が0人なら判定せず「絵がありませんでした」表示。

---

## 4. データモデル

### 4.1 ルーム: `oekakiRooms/<roomId>`

```js
{
  createdAt: <serverNowMs>,
  phase: 'drawing' | 'judging' | 'result',
  settings: { drawSeconds: 90, topicMode: 'random', topicAge: 'school' },
  round: {
    index: 1,                    // もういっかいで+1
    topic: '消防車',
    endsAt: <epoch ms>           // serverNowMs() + drawSeconds*1000（既存タイマー方式踏襲）
  },
  players: {
    <memberId>: {
      name: 'たろう',
      joinedAt: <ms>,
      image: 'data:image/jpeg;base64,...',   // 提出時のみ。JPEG q=0.7 / 480×480 目安
      submittedAt: <ms>
    }
  },
  result: {
    judgedAt: <ms>,
    entries: [ { pid, name, score, comment, rank } ],   // score降順
    error: null | '<message>'
  }
}
```

- 画像は **RTDB に base64 dataURL で保存**（本アプリは Storage 未使用・認証なしのため新規導入しない）。480×480 JPEG q0.7 で1枚 20〜80KB、8人でも1MB未満で問題なし。
- ルート名 `oekakiRooms` を `cleanupOldRooms()` の paths 配列（bbg.js:718）と、README §7.3 の DBルール例に追加。

### 4.2 ロビー: `lobbies/<id>/oekakiSettings`

```js
{ drawSeconds: 90, topicMode: 'random'|'custom', topicAge: 'kids'|'school'|'adult', customTopic: '' }
```

---

## 5. 画面仕様

### 5.1 screen 一覧

| screen | 役割 |
|---|---|
| `oekaki_player` | 全員共通のメイン画面。phase で描画/待機/結果を切替。ホストには判定・もういっかい等の操作ボタンを追加表示。gmdev 端末はキャンバスなしの進行表示（§5.3） |

新規 screen はこの1つのみ（join/rejoin はロビー経由の自動遷移で不要。hannin と同様に `goToCurrentGame` から直接 `oekaki_player` へ飛ばす）。

### 5.2 描画画面（phase:'drawing'）— キャンバス最大化

縦画面レイアウト（上から）:

1. 共通ヘッダー（既存。タイトルクリック=ロビー復帰）
2. 1行バー: お題「**消防車**」＋残り時間 `MM:SS`（`formatMMSS`＋250ms interval、既存方式）
3. **キャンバス**: 幅100%の正方形（`min(画面幅, 残り縦領域)`）。白背景
4. ツールバー（コンパクト、2段まで）:
   - **13色パレット**: 黒・灰・茶・赤・オレンジ・**うすだいだい**・黄・黄緑・緑・水色・青・紫・ピンク（タップで選択、選択中は枠強調）。白は消しゴムで代用できるので入れない
   - **太さスライダー**: `<input type="range" min="2" max="24" step="2">`。ラベル横に**実寸プレビュー**（いまの色・太さの丸）を表示
   - **ペンサイズ枠**: 描画中はポインタ位置に線と同じ直径のリング（`#okPenCursor`）を重ねて表示（うすだいだい等の薄い色でも太さが分かる）
   - **もどす／やりなおす**: お題の帯の中央、パレットの右に `↩︎` `↪︎`（`#okUndo` / `#okRedo`）。1操作（ひとふで・スタンプ1個・ぜんぶけす）ごとにキャンバスを丸ごと控える方式で、最大 `OK_UNDO_MAX`(=10) 手。新規操作で redo は破棄、回転で内部解像度が変わったときは控えを破棄（大きさ違いは適用しない）
   - **スタンプ**: 絵文字プール（48種）から**ラウンドごとに8個ランダム**で出す（同一ラウンド内は固定）
   - **消しゴム**: トグルボタン（実装は白色ペン。選択中は枠強調）
   - **完成ボタン**: `button.primary`。押すと提出→待機表示へ

道具の置き場所（フルスクリーン描画時）:

- キャンバスの上にはボタンを重ねない（描ける面積を最大化）。お題と同じ帯を `grid-template-columns: 1fr auto 1fr` で3分割し、
  **左=お題 / 中央=🎨＋もどす＋やりなおす / 右=かんせい！＋タイマーリング** の順に置く（中央列は左右が等幅なのでちょうど画面中央にそろう）
- 幅560px以下（スマホ縦）は道具だけ2段目に送り、お題がつぶれないようにする。お題は2行まで折り返して省略しない

キャンバス実装要点:

- 内部解像度は **長辺640**（表示領域の縦横比に合わせる）、表示は CSS でスケール。座標は `getBoundingClientRect()` で変換（devicePixelRatio 非依存で公平・軽量）。
- **回転（orientationchange）対応**: 表示領域の縦横比と内部解像度がズレると、CSSで引き伸ばされて「フィットせず拡大されすぎ」た表示になる。iOSは回転直後の `clientWidth/Height` が回転前・途中の値を返すことがあるため、
  - `ResizeObserver`（＋`resize`/`orientationchange`/`visualViewport.resize`）で変化を検知し、`OK_REFIT_DELAYS` の各タイミングで測り直す
  - **同じ値が2回続けて取れたときだけ反映**（`okRefitTick`）。途中の中途半端なサイズで作り直さない
  - 作り直す際は `okContentRect()` で**描かれている範囲だけ**を取り出して置き直す。余白ごと contain すると回転のたびに絵が縮むため。縮小は入り切らない分だけ、逆に回して戻したときは元の大きさまで戻す（`ui.artScale` で管理。描いたときより大きくはしない）
- Pointer Events（pointerdown/move/up + setPointerCapture）でマウス/タッチ両対応。`touch-action: none` を canvas に指定（既存の `manipulation` では描画中にスクロールが発生する）。
- 線は `lineCap/lineJoin: 'round'`。undo・全消しは付けない（シンプル方針、消しゴムで代用）。
- 提出処理: 640→480 に縮小コピー→ `toDataURL('image/jpeg', 0.7)` → `players/<pid>/image` へ `setValue`。**時間切れ時は各端末が自動提出**（interval で `endsAt` 超過検知。二重提出は submittedAt 既存チェックで抑止）。
- 提出後〜judging 中: 「判定中…」表示（自分の絵のサムネイル＋提出済み人数 n/N）。

### 5.3 結果画面（phase:'result'）

- ランキング順（score降順、rank付け）に「順位・名前・絵・点数・AIコメント」をカード表示。1位は大きめ＋👑。
- `result.error` があればエラー文言＋（ホストのみ）「再判定」「AIなしで発表」ボタン。
- ホストのみ: **「もういっかい」ボタン**（`button.primary`）
  - random モード: 即座に同室リセット（§6）
  - custom モード: お題入力欄を出して入力後にリセット実行
- gmdev 端末（テーブル専用端末）: 全 phase を通してキャンバスなし。drawing 中は「お題＋残り時間＋提出状況 n/N」、result では結果一覧（player と同じカード）を表示。ホスト権限があれば判定・もういっかい操作もここから可能。

### 5.4 CSS

`bbg.css` 末尾に `.ok-*` プレフィックスで追加（例: `.ok-canvas-wrap`, `.ok-palette`, `.ok-color`, `.ok-color.sel`, `.ok-toolbar`, `.ok-result-card`）。既存 CSS 変数（`--card`, `--line`, `--accent` 等）を使用。

---

## 6. もういっかい（同室リセット）

loveletter の `llReplay`（bbg.js:15600-15616、同室再利用型）に倣う。ホストが `runTxn` で:

```
phase → 'drawing'
round: { index: +1, topic: <新お題>, endsAt: serverNowMs()+drawSeconds*1000 }
players/*/image, submittedAt → 削除（name/joinedAt は残す）
result → null
```

全端末は room 購読で phase 変化を検知し自動で描画画面に戻る。メンバーは room の players をそのまま使うので同一メンバー再戦になる。

---

## 7. 実装チェックリスト（bbg.js への追加箇所）

hannin（犯人は踊る）が最も新しくシンプルな雛形。番号順に実装すること。

| # | 作業 | 参照箇所（現行行番号） |
|---|---|---|
| 1 | `oekakiRoomPath(roomId)` + `subscribeOekakiRoom(roomId, cb)` | bbg.js:875-893（hanninの2点セットに倣う） |
| 2 | `cleanupOldRooms()` の paths に `'oekakiRooms'` 追加 | bbg.js:718 |
| 3 | `createOekakiRoom(settings, topic)` / `joinPlayerInOekakiRoom(roomId, mid, name)` | bbg.js:4068-4117 を雛形に |
| 4 | お題リスト `OEKAKI_TOPICS`（3年齢帯×30以上）＋抽選関数 | 新規（§2） |
| 5 | ロビー select に `<option value="oekaki">おえかきバトル</option>` | bbg.js:8452 付近 |
| 6 | `oekakiSetupHtml`（制限時間スライダー/お題モード/年齢/自由記入）＋連結 | bbg.js:8314-8355（hanninSetupHtml）、連結 8457-8459 |
| 7 | `setLobbyOekakiSettings` ＋ `lobbyRenderKey` に `oekakiSettings` 追加 | bbg.js:1123-1132 / 12331-12356 |
| 8 | 最小人数ゲート（oekaki=2）＋ゲーム名ラベル分岐 | bbg.js:12086-12100 |
| 9 | 開始ハンドラ `lobbyStartGame` に oekaki 分岐（createOekakiRoom＋join×人数→setLobbyCurrentGame） | bbg.js:12233-12260（hanninブロック）を複製 |
| 10 | 開始後の自端末リダイレクト分岐（→ `oekaki_player`） | bbg.js:12262-12290 |
| 11 | 参加者側 `goToCurrentGame` に oekaki 分岐（→ `oekaki_player`） | bbg.js:12403-12463 |
| 12 | `renderOekakiPlayer`（phase別: 描画/待機/結果、gmdev分岐） | bbg.js:4320（renderHanninPlayer）を雛形に |
| 13 | `routeOekakiPlayer`（subscribe＋lobby return watcher＋popstateでunsub＋タイマーinterval＋自動提出＋ホストの判定トリガー） | bbg.js:5039（routeHanninPlayer）を雛形に |
| 14 | Gemini 判定関数 `oekakiJudge(room)`（fetch、構造化出力、§3） | 新規 |
| 15 | APIキー設定: `?screen=setup` に Gemini キー欄追加（localStorage）＋ bbg-config.js オプション | bbg.js:589-594 のパターン |
| 16 | もういっかい `oekakiReplay(roomId)`（同室リセット、§6） | bbg.js:15600-15616（llReplay）参照 |
| 17 | マスタールーター `route()` に `oekaki_player` 追加 | bbg.js:18131-18165 の並び |
| 18 | 制限端末 `allowed` リストに `oekaki_player` 追加 | bbg.js:18041-18054 |
| 19 | CSS `.ok-*` 追加（canvas は `touch-action:none`） | bbg.css 末尾 |
| 20 | README 更新: 対応ゲーム一覧・DBルール例に `oekakiRooms`・Geminiキー取得/リファラー制限手順 | README.md |

### 実装上の注意（コードベース固有）

- **src/ ディレクトリは未使用の旧試作。触らない。** 実体は bbg.js のみ（index.html:49）。
- UIはフレームワークなしの **HTML文字列連結＋`render(viewEl, html)`**（bbg.js:8066）。ユーザー入力（名前・自由お題・AIコメント）は必ず `escapeHtml`（bbg.js:39）を通す。
- 時刻は必ず `serverNowMs()`（bbg.js:143）。端末時計を直接使わない。
- Firebase は compat SDK / 認証なし / RTDB のみ。プレイヤー識別は localStorage の memberId。
- 終了・中断は既存共通動線（ヘッダークリック→`setLobbyCurrentGame(lobbyId, null)`→各端末の return watcher がロビーへ）。個別「ロビーへ」ボタンは作らない。

---

## 8. エッジケース

| ケース | 挙動 |
|---|---|
| 時間切れ時に未提出 | 各端末が自動提出。端末が閉じられていた等で image が無い場合は「未提出」として判定から除外 |
| 全員未提出 | 判定スキップ、「絵がありませんでした」＋もういっかい |
| API失敗（quota/ネットワーク/パース） | `result.error` → 再判定 or AIなし発表（§3.5） |
| APIキー未設定でゲーム開始 | ロビーの開始時にホスト端末でチェックし、警告表示（開始自体は可、判定時に「AIなし発表」へフォールバック） |
| ホスト端末離脱中に描画終了 | 判定が走らない。ホスト復帰時に購読コールバックで条件検知→判定実行（判定トリガーは「状態を見て未判定なら実行」の冪等設計にする） |
| 判定の二重実行 | `runTxn` による phase CAS で防止（§3.5） |
| custom お題が空のまま開始 | 開始ボタンでバリデーション（空なら開始不可） |

# B_BoardGames

対面で集まって遊ぶボードゲームを、各自スマホのブラウザで補助するためのシンプルなSPAです。

対応ゲーム（2026-01時点）

- ワードウルフ（Wordwolf）
- コードネーム（Codenames）
- ラブレター（LoveLetter）
- 犯人は踊る（Hannin）

このアプリは「静的ファイル + Firebase Realtime Database」で動きます。

---

## 1) 全体像（引継ぎ用まとめ）

### 目的

- 全員が同じURL（GitHub Pages等）にアクセス
- GMが「ロビーを作成」し、参加者はQRから参加
- ロビーでゲーム種別を選び、各ゲーム画面へ遷移
- 進行中に“全員をロビーへ戻す”導線を提供

### 重要な設計方針

- 1ファイルSPA（主に `bbg.js`）で画面ルーティング/描画/DB購読を完結
- Firebase Realtime Database を“状態の唯一の正”として扱う
- 画面は URL クエリで切り替える（`?screen=...&lobby=...&room=...`）
- 個別の「ロビーへ」ボタンは原則廃止し、ヘッダータイトルをクリックしてロビー復帰（= 全員強制復帰）

---

## 2) 画面/URL仕様（ルーティング）

基本：`index.html` を開き、クエリで画面を決めます。

よく使うパラメータ

- `screen`: 画面ID（例: `lobby_host`, `lobby_player`, `codenames_host`, `codenames_table` など）
- `lobby`: ロビーID（4桁）
- `room`: ゲームルームID（ランダム）
- `host=1`: ホスト/GM系画面
- `player=1` または `player=<memberId>`: プレイヤー画面
- `gmdev=1`: 「テーブル表示専用端末」（参加者としては参加しない端末）
- `v`: キャッシュバスター（`release.ps1` が `index.html` に付与）

ホーム画面の2ボタン

- 「ロビー作成（この端末もゲームに参加）」: 作成者が参加者としても参加する
- 「ロビー作成（この端末をゲームマスターデバイス）」: 作成者は“テーブル端末”扱い（参加者としては入らない）

---

## 3) 役割（端末の種類）

端末は大きく3種類の振る舞いをします。

1. 参加者端末
   - QR参加
   - 進行に応じて各ゲームの“参加者画面”へ
2. GM参加者端末
   - 参加者として入るが、GM操作（開始/設定など）も持つ
   - コードネームのタイマー設定画面などに入る
3. テーブル端末（`gmdev=1`）
   - テーブル表示（盤面/全体情報）を主用途
   - “参加者として入らない”ことが重要（参加者と同じ扱いにするとUI/遷移が崩れるため）

---

## 4) Firebase（保存場所/データモデルの考え方）

Realtime Database を使い、複数端末で同じ状態を共有します。

### 4.1 ロビー

パス：`lobbies/<lobbyId>`

概念

- 参加者一覧（`members`）と表示順（`order`）を保持
- 現在プレイ中のゲーム（`currentGame`）を保持
  - ここが「全員強制的にロビーへ戻す」スイッチ

代表的なフィールド（概念）

- `hostMid`: ロビー作成者（memberId）
- `members/<memberId>`: `{ name, joinedAt, lastSeenAt, isGmDevice? }`
- `order`: memberId配列（表示順/ゲームの席順の基礎）
- `currentGame`: `null` or `{ kind, roomId, startedAt }`
- `lastKind`: 直前に遊んだゲーム種別
- `loveletterExtraCards`: ラブレター追加カード
- `codenamesAssign`: コードネームのチーム/役職割当

### 4.2 ゲームルーム

ゲームごとに別のパスを使います（同一構造ではありません）。

- ワードウルフ: `rooms/<roomId>`
- コードネーム: `codenamesRooms/<roomId>`
- ラブレター: `loveletterRooms/<roomId>`
- 犯人は踊る: `hanninRooms/<roomId>`

いずれも「ホストが作成 → 参加者がjoin → 以降はroomの状態遷移で全画面が追従」という流れです。

---

## 5) “ロビーへ戻す”仕様（最重要・横断仕様）

基本方針

- 進行中ゲームを終了/中断して全員をロビーへ戻す操作は、ロビーの `currentGame` を `null` にすることで実現します。
- これにより、参加者端末がロビー監視で「ゲームが無い」ことを検知し、ロビー画面へ戻れます。

UI

- 各ゲーム画面の個別「ロビーへ」ボタンは削除し、ヘッダーのタイトルクリックで統一（実装上は上記の `currentGame=null` をトリガー）

---

## 6) ゲーム別仕様メモ（保守/AI引継ぎ用）

### 6.1 ワードウルフ

- 参加者は個別にワード/役職を見て進行
- タイマー表示あり
- 多数派側の参加者画面では“残り 00:59”の常時表示を抑制（UI簡素化）

### 6.2 コードネーム

- ロビーでチーム（赤/青）と役職（スパイマスター/工作員）を決定
- `lobbies/<id>/codenamesAssign` に割当が保持される
- タイマー設定画面（GM参加者端末）で「スタート」を押すとゲーム開始

重要: 役職保持の実装ポイント

- ルーム開始時に、ロビーで決めた役職がルーム側に反映されていないと開始条件チェックに失敗します。
- そのため開始時に「ロビーの割当をルームの players に適用」する処理が入っています。
- 正規化ルールとして「各チームの spymaster は必ず1人」に揃えます。

### 6.3 ラブレター

- テーブル画面から個別「ロビーへ」ボタンは削除（ヘッダークリックに統一）

### 6.4 犯人は踊る

- テーブル表示とプレイヤー表示があり、テーブル端末（`gmdev=1`）の扱いに注意

---

## 7) Firebase セットアップ

### 7.1 推奨: ブラウザで設定（配布が簡単）

1. Firebase Console でプロジェクト作成
2. Realtime Database を作成（開発中はテストモードでも可）
3. Web アプリを追加して「Firebase SDK の設定（構成）」をコピー
4. アプリの `?screen=setup` 画面に JSON を貼り付けて保存

### 7.2 設定をコードに埋め込む（配布先URLに固定したい場合）

- `bbg-config.js` の `ENABLE_EMBEDDED_FIREBASE_CONFIG = true` にする
- Firebase Console の `firebaseConfig` を貼り付け

### 7.3 Realtime Database ルール（開発用の最低限）

用途に合わせて必ず強化してください。

```json
{
  "rules": {
    "lobbies": { ".read": true, ".write": true },
    "rooms": { ".read": true, ".write": true },
    "codenamesRooms": { ".read": true, ".write": true },
    "loveletterRooms": { ".read": true, ".write": true },
    "hanninRooms": { ".read": true, ".write": true }
  }
}
```

---

## 8) 開発/公開

### 8.1 ローカル起動

`file://` 直開きは Firebase 読み込みが失敗することがあるため、ローカルサーバーで開いてください。

PowerShell例（Pythonがある場合）

```powershell
cd "c:\Users\B\Desktop\自作ソフト\B_BoardGames"
python -m http.server 8000
```

### 8.2 GitHub Pages 公開

1. GitHub に push
2. Settings → Pages → Branch を設定
3. 公開URL（例: `https://<user>.github.io/<repo>/`）で利用

### 8.3 `release.ps1`（stable/devの分離）

`index.html` の `?v=`（キャッシュバスター）更新→commit→push を自動化します。

- stable（通常の公開URL / origin）
  - `./release.ps1 -Channel stable -Message "release"`
- dev（開発用の別URL / dev）
  - `./release.ps1 -Channel dev -Message "dev"`
- 両方
  - `./release.ps1 -Channel both -Message "release"`

---

## 9) 保守メモ（AIに渡す時に伝えること）

- まず `lobbies/<id>/currentGame` が“全体の遷移スイッチ”であることを理解する
- URLクエリの `gmdev=1` はテーブル端末を意味し、参加者として join しない前提のUI/遷移がある
- コードネームは「ロビー割当 → ルーム反映」が開始条件に直結する
- 端末制限（参加者端末がホームに戻れない等）は、誤操作防止のための仕様


# ドデリド カード画像

ここにスキャンしたカード画像（PNG）を置くと、アプリが**自動でプレースホルダー表示から画像表示に切り替わります**。特別な登録作業は不要です。ファイルを置いて、ブラウザをリロードするだけです。

## 置くファイル名

ファイル名は `<いろ>_<どうぶつ>.png` です（ワニだけ `croc.png`）。

| | flamingo（フラミンゴ） | penguin（ペンギン） | turtle（カメ） | camel（ラクダ） | zebra（シマウマ） |
|---|---|---|---|---|---|
| **white（しろ）** | `white_flamingo.png` | `white_penguin.png` | `white_turtle.png` | `white_camel.png` | `white_zebra.png` |
| **pink（ピンク）** | `pink_flamingo.png` | `pink_penguin.png` | `pink_turtle.png` | `pink_camel.png` | `pink_zebra.png` |
| **yellow（きいろ）** | `yellow_flamingo.png` | `yellow_penguin.png` | `yellow_turtle.png` | `yellow_camel.png` | `yellow_zebra.png` |
| **blue（あお）** | `blue_flamingo.png` | `blue_penguin.png` | `blue_turtle.png` | `blue_camel.png` | `blue_zebra.png` |
| **green（みどり）** | `green_flamingo.png` | `green_penguin.png` | `green_turtle.png` | `green_camel.png` | `green_zebra.png` |

- `croc.png` … ワニ
- `back.png`（任意） … カード裏面

## 注意点

- 形式は **PNG**、**縦長のカード画像**を想定しています。
- 上記の名前でファイルを置いてリロードするだけで、そのカードから自動的に画像表示へ切り替わります（一部のカードだけ画像を用意する、という置き方も可能です）。
- 画像が無いカードは、色わく＋動物絵文字＋名前＋色名のプレースホルダーで代わりに表示されるので、画像が揃うまでの間もゲームは問題なく遊べます。
- **ファイル名を変更する場合は `bbg.js` 側の `DD_ANIMAL_DEFS` / `DD_COLOR_DEFS` / `ddCardImgSrc` の修正が必要です**。ファイル名は上記の一覧のとおりにしてください。

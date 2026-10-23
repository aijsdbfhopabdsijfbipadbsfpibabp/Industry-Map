# 業界地図（Industry-Map）

自分用の業界地図です。業界ごとに、企業の規模（タイルの大きさ）と資本関係（線）を図でざっくり見られます。

- スマホ優先のデザイン（PCでも見られます）
- 上のタブで業界を切り替え、「＋ すべて・検索」から業界・企業・ブランドを横断検索
- 右上の「日本 / 世界」で、海外企業の表示を切り替え（ふだんは日本だけ）
- 各業界は「マップ」「ランキング」「概要」の3つの見方
- 収録：化粧品・牛丼・おもちゃ・半導体・紙・パルプ（和紙）・自動車
- データベースは使わず、`data/` の JSON ファイルを足していくだけで業界を増やせます

## 見かた

GitHub Pages で公開すると、スマホのブラウザからそのまま見られます。
（リポジトリの Settings → Pages → Branch を `main` / `/(root)` にして Save）

ホーム画面に追加すると、アプリのように全画面で開けます。

### 手元のPCで見る場合

`index.html` をダブルクリックで開くと、ブラウザの制限で JSON が読み込めません。フォルダでサーバーを起動してください。

```sh
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

## 業界を追加する

1. `data/_template.json` をコピーして `data/sectors/<業界id>.json` を作る（例：`data/sectors/convenience.json`）
2. 中身を書き換える
3. `data/index.json` の `sectors` に1行足す

```json
{ "id": "convenience", "name": "コンビニ", "icon": "🏪", "category": "小売", "description": "一覧に出る短い説明" }
```

`id` とファイル名をそろえるのがポイントです。並び順は `index.json` の順番どおりにタブに出ます。

JSON の書き間違いがあると画面にエラーが出ます。企業のグループ名の打ち間違いなど、細かい不整合は「概要」タブの一番下に「データのチェック」として表示されます。

## JSON の書き方

ひな形：[`data/_template.json`](data/_template.json)。実例：[`data/sectors/cosmetics.json`](data/sectors/cosmetics.json)、[`data/sectors/gyudon.json`](data/sectors/gyudon.json)

### 業界（ファイル全体）

| 項目 | 内容 |
| --- | --- |
| `name` / `icon` / `category` | 業界名・絵文字・大分類（`index.json` と同じでOK） |
| `updated` | データを更新した日 |
| `summary` | 業界の説明。1段落目がヘッダーに出る。`\n` で段落分け |
| `market.jp` / `market.global` | 市場規模。`value` は表示する文字そのまま（例 `"2兆6,430億円"`）。`global` は「世界」表示のときだけ出る |
| `breakdowns` | 概要タブに出る内訳の棒グラフ（例：カテゴリー別の市場規模）。`title`・`unit`・`items: [{ "label", "value", "share", "note" }]` |
| `metrics` | 比べる指標の一覧。`key`・`label`・`unit`。`unit` が `"億円"` なら1兆以上は「1兆2,345億円」と表示。`"order": "asc"` で小さい順（価格など） |
| `sizeBy` | タイルの大きさに使う指標の `key`（グループごとに変えることもできる） |
| `rankBy` | ランキングで最初に選ばれる指標 |
| `groups` | マップのグループ（カード）。上から順に並ぶ |
| `companies` | 企業 |
| `relations` | 企業どうしの線 |
| `trends` / `timeline` / `notes` / `sources` | 概要タブに出る、トレンド・年表・メモ・出典 |
| `tagGroups` | タグの見出しと並び順（例：`[{ "label": "主力カテゴリー", "tags": ["スキンケア", "メイク"] }]`） |
| `insights` | 議論した仮説の「考察メモ」。`hypothesis`（仮説）・`verdict`（`yes` / `partly` / `no` / `open`）・`sections`（`label` と `items`）・`conclusion`・`tag`（マップで光らせるタグ） |

### グループ（`groups`）

| 項目 | 内容 |
| --- | --- |
| `id` | 企業の `group` から参照する名前（英数字） |
| `name` / `description` | 表示名と説明 |
| `short` | 上の「グループへ移動」ボタンに出る短い名前 |
| `section` | 見出し（例：`"国内メーカー"`・`"製造装置"`）。同じ見出しのグループがまとめて並ぶ |
| `color` | `pink` `navy` `lavender` `sky` `peach` `sage` `rose` `lemon` `gray`、または `#RRGGBB`。省略すると自動 |
| `sizeBy` | このグループだけ大きさの基準を変える（例：チェーンは店舗数、親会社は売上高） |
| `scale` | タイルを小さめに表示する倍率（0〜1）。小売のように桁違いに大きい会社が並ぶグループ向け |
| `countLabel` | 件数の単位（省略時は「社」）。産地や原料など会社以外を並べるグループ向け（例：`"産地"`） |

### 企業（`companies`）

| 項目 | 内容 |
| --- | --- |
| `id` | 英数字の一意な名前（線やURLで使う） |
| `name` / `short` | 正式名と、小さいタイル用の短い名前 |
| `kana` | 読みがな（任意）。漢字の名前をひらがなで検索できるようにする（例：`"えちぜんわし"`） |
| `group` | 所属グループの `id` |
| `region` | `"jp"`（日本）または `"overseas"`（海外）。海外は「世界」表示のときだけ出る |
| `country` | 国名（海外企業はタイルに表示） |
| `code` / `fy` | 証券コード・ティッカー、決算期 |
| `tagline` / `description` | タイルに出る一言、詳細の説明 |
| `metrics` | 指標の値。数値か、`{ "value": 1000, "approx": true, "period": "2026年3月末", "note": "補足" }`（`approx` で「約」がつく） |
| `brands` | 主なブランド・業態 |
| `points` | 詳細に出る箇条書き |
| `facts` | `{ "label": "項目", "value": "内容" }` の表 |
| `url` | 公式サイト |
| `tags` | 絞り込み用のタグ（例：`["スキンケア", "ドラッグストア", "異業種出身"]`）。マップ・ランキングの「注目」で光らせられる |

値がない企業は小さな点線のタイルになります（親会社や販売チャネルなど、規模を比べない会社向け）。

### 関係（`relations`）

```json
{ "from": "親会社のid", "to": "子会社のid", "type": "subsidiary", "label": "2024年買収" }
```

| `type` | 線 | 意味 |
| --- | --- | --- |
| `subsidiary` | 実線＋矢印 | 子会社・傘下（from が親） |
| `equity` | 破線 | 出資（from が出資元） |
| `alliance` | ピンクの点線 | 提携・フランチャイズ・合弁 |
| `other` | 灰色の点線 | その他 |

ふだんは見やすさのため、ほかのグループのカードをまたぐ長い線は省略しています。企業をタップするとその会社の線がすべて出ます（「線をすべて表示」で常に全部出すこともできます）。

## ファイル構成

```
index.html               画面の骨組み
assets/css/style.css     デザイン（淡いピンク・薄い紺・白・薄い灰色）
assets/js/               画面の動き（ビルド不要の素の JavaScript）
data/index.json          業界の一覧
data/sectors/*.json      業界ごとのデータ
data/_template.json      新しい業界のひな形
```

## 注意

数値は各社の決算資料や報道をもとにした概算です（海外企業は円換算）。決算期は会社ごとに異なります。

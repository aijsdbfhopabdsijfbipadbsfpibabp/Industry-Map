# AGENTS.md

作業を始める前に、必ず [`HANDOFF.md`](HANDOFF.md)（これまでの経緯と約束ごと）と [`README.md`](README.md)（データの書き方）を読んでください。

特に守ること：

- 作業が終わったら `main` にコミットして `git push origin main`（オーナーがすぐ見られるようにする）。
- 画面の言葉はやさしい日本語。スマホ優先（390px 前後で横にはみ出さない）。
- デザインは淡いピンク＋淡い紺・白・薄い灰色（`assets/css/style.css` の `:root` の変数を使う）。
- 数字は一次情報で確かめて出典を残す。確認できないものは空欄にして `notes` に書き、推測で埋めない。
- ビルドなしの素の HTML / CSS / JavaScript と JSON。ライブラリやデータベースを足さない。
- 確認は `python3 -m http.server 8765` と `node tools/smoke-test.mjs`。

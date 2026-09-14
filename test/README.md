# 理解テスト（社内用）

`index.html`（固定の入口）が `page.html` / `questions.js` / `furigana.js` / `app.js` を毎回サーバーから読み込んで動く静的ページ。

- 問題の追加・修正は `questions.js`。出題数・週の起点も同ファイル冒頭。
- ふりがなは `furigana.js` の辞書（漢字語 → 読み）。問題を追加したら管理モード（admin）→「ふりがな未登録の漢字を確認」で不足を確認して辞書に足す。
- 画面の文言・見た目は `page.html`、動作は `app.js`。

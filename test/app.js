/* 山王苑 理解テスト 画面ロジック
 * - 問題・正解・採点はサーバー（Google Apps Script のウェブアプリ）側にあり、このページには置かない
 * - 受験者は ID と PIN で入る。受験日時（受験枠）の外ではサーバーが問題を返さない
 * - 受験中に正解は表示しない。提出するとサーバーで採点し、得点・合否・間違えた問題（正解と解説）を表示する
 * - ID「admin」＋管理パスワードで管理モード（受験者の受験日時の設定・結果の確認／設問の確認と修正点の記入）
 */
(function () {
  "use strict";
  /* 古い入口ページ（キャッシュ）から読み込まれた場合は、別URLで新しい入口を取り直す */
  if (!document.getElementById("app") || !document.getElementById("画面_ログイン")) {
    const q = location.search.replace(/^\?/, "").split("&").filter((p) => p && !/^r=/.test(p));
    q.push("r=" + Date.now());
    location.replace(location.pathname + "?" + q.join("&"));
    return;
  }
  const API_URL = "https://script.google.com/macros/s/AKfycbwoKRJlYkuQRZOE91w0Jg17DLolkAuqBrOugfEWu64aY-zVu14HoyyYJoK2JMw4yChQ/exec";
  const 保存キー_ログイン = "sannoen_test_login";   // sessionStorage（タブを閉じると消える）
  const 保存キー_回答 = "sannoen_test_answers";    // sessionStorage（受験中の回答。再読込しても続きから）
  const 保存キー_修正点 = "sannoen_test_admin_notes";
  const 保存キー_ふりがな = "sannoen_test_ruby";
  /* 旧方式（共通パスコード）の記憶は使わないので消しておく */
  try { ["sannoen_test_auth", "sannoen_test_name", "sannoen_test_history"].forEach((k) => localStorage.removeItem(k)); } catch (e) {}

  const $ = (id) => document.getElementById(id);

  // ---------- ふりがな（辞書は furigana.js） ----------
  /* 漢字で始まる語を辞書から最長一致で探し、漢字部分だけに <ruby> を振る。
   * 辞書に無い漢字はそのまま表示し、「未登録」に記録する（管理メニューで一覧できる）。
   * 表示のON/OFFは body.ruby-off（CSSで rt を隠す）で切り替えるので再描画は要らない */
  const 辞書 = window.ふりがな辞書 || {};
  const 辞書最長 = Object.keys(辞書).reduce((m, k) => Math.max(m, k.length), 1);
  const 漢字か = (ch) => /[一-鿿々〆]/.test(ch);
  const 未登録 = new Set();
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function ルビ片(key, yomi) {
    const runs = key.match(/[一-鿿々〆]+|[^一-鿿々〆]+/g) || [key];
    const 全体 = () => `<ruby>${esc(key)}<rt>${esc(yomi)}</rt></ruby>`;
    let pos = 0, out = "", pending = null;
    for (const r of runs) {
      if (漢字か(r[0])) { pending = r; continue; }
      const idx = yomi.indexOf(r, pos);
      if (idx < 0 || (pending && idx === pos)) return 全体();
      if (pending) { out += `<ruby>${esc(pending)}<rt>${esc(yomi.slice(pos, idx))}</rt></ruby>`; pending = null; }
      out += esc(r); pos = idx + r.length;
    }
    if (pending) { const rest = yomi.slice(pos); if (!rest) return 全体(); out += `<ruby>${esc(pending)}<rt>${esc(rest)}</rt></ruby>`; }
    return out;
  }
  function ふりがな(text) {
    text = String(text == null ? "" : text); let out = "", i = 0;
    while (i < text.length) {
      const ch = text[i];
      /* かな始まりのキー（例「た後」「の方」）も使えるように、どの位置でも最長一致を試す */
      let hit = null;
      for (let len = Math.min(辞書最長, text.length - i); len >= 1; len--) { const k = text.substr(i, len); if (Object.prototype.hasOwnProperty.call(辞書, k)) { hit = k; break; } }
      if (hit && /[一-鿿々〆]/.test(hit)) { out += ルビ片(hit, 辞書[hit]); i += hit.length; continue; }
      if (!漢字か(ch)) { out += esc(ch); i++; continue; }
      let j = i; while (j < text.length && 漢字か(text[j])) j++;
      未登録.add(text.slice(i, j)); out += esc(ch); i++;
    }
    return out;
  }
  function ルビ設定(el, text) { el.innerHTML = ふりがな(text); }
  window.ふりがな = ふりがな; // 確認用（ブラウザのコンソールから読みを検証できる）
  /* page.html に書かれた固定の文言（見出し・説明）にもルビを振る。select/option/textarea/input/button は対象外 */
  function 静的ふりがな(root) {
    /* ボタンは対象外: rt の高さ分で文字が下にずれて見えるため（ボタンの文言は短い定型文なので読みは付けない） */
    const skip = ["SCRIPT", "STYLE", "TEXTAREA", "OPTION", "SELECT", "INPUT", "RUBY", "RT", "BUTTON"];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; let n;
    while ((n = walker.nextNode())) { if (!skip.includes(n.parentNode.tagName) && /[一-鿿々〆]/.test(n.nodeValue)) nodes.push(n); }
    nodes.forEach((t) => { const tpl = document.createElement("template"); tpl.innerHTML = ふりがな(t.nodeValue); t.parentNode.replaceChild(tpl.content, t); });
  }
  function ふりがな未登録一覧() {
    未登録.clear();
    if (管理_バンク) 管理_バンク.セット一覧.forEach((s) => { ふりがな(s.名称); ふりがな(s.範囲); s.問題.forEach((q) => { ふりがな(q.q); q.c.forEach((c) => ふりがな(c)); ふりがな(q.e); }); });
    const skip = ["SCRIPT", "STYLE", "TEXTAREA", "OPTION", "SELECT", "INPUT", "RT"];
    const walker = document.createTreeWalker($("app"), NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) { if (!skip.includes(n.parentNode.tagName)) ふりがな(n.nodeValue); }
    return Array.from(未登録).sort();
  }
  function ふりがな表示(on) {
    document.body.classList.toggle("ruby-off", !on);
    $("btn_ふりがな").textContent = on ? "ふりがな：あり" : "ふりがな：なし";
    try { localStorage.setItem(保存キー_ふりがな, on ? "1" : "0"); } catch (e) {}
  }
  static_init: {
    静的ふりがな($("app"));
    let on = true; try { on = localStorage.getItem(保存キー_ふりがな) !== "0"; } catch (e) {}
    ふりがな表示(on);
    $("btn_ふりがな").addEventListener("click", () => ふりがな表示(document.body.classList.contains("ruby-off")));
  }
  const 画面 = ["画面_ログイン", "画面_開始", "画面_出題", "画面_結果", "画面_管理メニュー", "画面_管理_受験者", "画面_管理", "画面_管理_出力"];
  function 画面切替(id) { const ids = Array.isArray(id) ? id : [id]; 画面.forEach((p) => $(p).classList.toggle("hidden", !ids.includes(p))); window.scrollTo(0, 0); }
  function トースト(msg) { const t = $("トースト"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); }
  async function コピー(ta) {
    try { await navigator.clipboard.writeText(ta.value); トースト("コピーしました"); }
    catch (e) { ta.focus(); ta.select(); try { document.execCommand("copy"); トースト("コピーしました"); } catch (e2) { トースト("長押しでコピーしてください"); } }
  }
  async function 共有(text) {
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else { トースト("この端末は共有に対応していません。コピーを使ってください"); }
  }
  function 出典名(s) { return { 盛付: "盛り付け・調理マニュアル", 弁当: "ランチ・弁当シート", 体制: "仕込み体制・スキルシート", 調理: "調理マニュアル（たれ・仕込み・提供）" }[s] || s; }
  function 日時文字列() { const d = new Date(); const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  // ---------- サーバーとの通信 ----------
  /* Content-Type を text/plain にして送る（Apps Script はプリフライトに応えないため） */
  async function API(action, data) {
    const body = Object.assign({ action }, data || {});
    let j;
    if (window.理解テストAPI_モック) j = await window.理解テストAPI_モック(body); // ローカル確認用
    else {
      let res;
      try { res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) }); }
      catch (e) { throw new Error("通信できませんでした。電波の良い所でもう一度試してください"); }
      try { j = await res.json(); } catch (e) { throw new Error("サーバーの応答を読めませんでした。少し待ってからもう一度試してください"); }
    }
    if (!j.ok) throw new Error(j.エラー || "エラーが発生しました");
    return j;
  }
  let 通信中 = false;
  async function 実行(btn, fn) {
    if (通信中) return; 通信中 = true;
    const 元 = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "通信中…"; }
    try { return await fn(); }
    catch (e) { トースト(e.message); throw e; }
    finally { 通信中 = false; if (btn) { btn.disabled = false; btn.textContent = 元; } }
  }

  // ---------- ログイン ----------
  let ログイン = null; // { id, pin }
  function ログイン保存(v) { ログイン = v; try { if (v) sessionStorage.setItem(保存キー_ログイン, JSON.stringify(v)); else sessionStorage.removeItem(保存キー_ログイン); } catch (e) {} }
  async function ログイン実行() {
    const id = $("ログイン_ID").value.trim(), pin = $("ログイン_PIN").value.trim();
    $("ログインエラー").textContent = "";
    if (!id || !pin) { $("ログインエラー").textContent = "IDとPINを入力してください。"; return; }
    try {
      await 実行($("btn_ログイン"), async () => {
        if (id.toLowerCase() === "admin") { const r = await API("admin_list", { pin }); ログイン保存({ id: "admin", pin }); 管理モード開始(r); }
        else { const r = await API("login", { id, pin }); ログイン保存({ id, pin }); 開始画面表示(r); }
        $("ログイン_PIN").value = "";
      });
    } catch (e) { $("ログインエラー").textContent = e.message; }
  }
  $("btn_ログイン").addEventListener("click", ログイン実行);
  $("ログイン_PIN").addEventListener("keydown", (e) => { if (e.key === "Enter") ログイン実行(); });
  $("ログイン_ID").addEventListener("keydown", (e) => { if (e.key === "Enter") $("ログイン_PIN").focus(); });
  function ログアウト() {
    ログイン保存(null); try { sessionStorage.removeItem(保存キー_回答); } catch (e) {}
    $("ログイン_ID").value = ""; $("ログイン_PIN").value = ""; $("ログインエラー").textContent = ""; ルビ設定($("段階バッジ"), "");
    画面切替("画面_ログイン"); トースト("ログアウトしました");
  }
  $("btn_ログアウト").addEventListener("click", ログアウト);
  $("btn_メニュー_ログアウト").addEventListener("click", ログアウト);

  // ---------- 開始画面 ----------
  let 状況 = null;
  function 開始画面表示(r) {
    状況 = r;
    const 段階 = r.状態 === "完了" ? "全段階合格" : `第${r.段階}段階：${r.範囲名}`;
    ルビ設定($("段階バッジ"), r.状態 === "完了" ? "" : `第${r.段階}段階 / 全${r.全段階数}段階`);
    ルビ設定($("開始_見出し"), 段階);
    ルビ設定($("開始_氏名"), r.氏名);
    ルビ設定($("開始_受験枠"), r.受験枠 || "未設定");
    const 受験できる = r.状態 === "受験可" || r.状態 === "受験中";
    const msg = r.状態 === "受験中" ? "受験の途中です。下のボタンで続きから再開できます。" : r.状態 === "受験可" ? "今、受験できます。" : r.メッセージ;
    ルビ設定($("開始_メッセージ"), msg);
    $("開始_受験可").classList.toggle("hidden", !受験できる);
    $("btn_開始").textContent = r.状態 === "受験中" ? "続きから再開する" : "テストを始める";
    画面切替("画面_開始");
  }
  $("btn_再読込").addEventListener("click", () => 実行($("btn_再読込"), async () => 開始画面表示(await API("login", ログイン))).catch(() => {}));
  $("btn_開始").addEventListener("click", () => 実行($("btn_開始"), async () => {
    const r = await API("start", ログイン);
    受験 = { 番号: r.受験番号, 問題: r.問題, 段階: r.段階, 範囲名: r.範囲名 };
    回答 = 回答読込(受験.番号); 現在 = Math.min(回答.filter((a) => a !== null && a !== undefined).length, 受験.問題.length - 1);
    出題表示(); 画面切替("画面_出題");
  }).catch(() => {}));

  // ---------- 出題（正解は表示しない） ----------
  let 受験 = null, 現在 = 0, 回答 = [];
  function 回答読込(番号) { try { const v = JSON.parse(sessionStorage.getItem(保存キー_回答) || "null"); return v && v.番号 === 番号 ? v.回答 : []; } catch (e) { return []; } }
  function 回答保存() { try { sessionStorage.setItem(保存キー_回答, JSON.stringify({ 番号: 受験.番号, 回答 })); } catch (e) {} }
  function 出題表示() {
    const n = 受験.問題.length; const q = 受験.問題[現在];
    $("進捗バー").style.width = `${(現在 / n) * 100}%`;
    ルビ設定($("問番号"), `第${現在 + 1}問 / ${n}`);
    ルビ設定($("問文"), q.q);
    const ul = $("選択肢"); ul.innerHTML = "";
    q.c.forEach((text, i) => {
      const li = document.createElement("li"); li.className = "choice" + (回答[現在] === i ? " selected" : "");
      li.innerHTML = `<span class="mark">${"ABCD"[i]}</span><span>${ふりがな(text)}</span>`;
      li.addEventListener("click", () => { 回答[現在] = i; 回答保存(); Array.from(ul.children).forEach((c, k) => c.classList.toggle("selected", k === i)); $("btn_次へ").disabled = false; });
      ul.appendChild(li);
    });
    $("btn_前へ").disabled = 現在 === 0;
    $("btn_次へ").disabled = 回答[現在] === undefined || 回答[現在] === null;
    $("btn_次へ").textContent = 現在 + 1 < n ? "次へ →" : "提出して採点する";
    window.scrollTo(0, 0);
  }
  $("btn_前へ").addEventListener("click", () => { if (現在 > 0) { 現在--; 出題表示(); } });
  $("btn_次へ").addEventListener("click", () => {
    if (回答[現在] === undefined || 回答[現在] === null) return;
    if (現在 + 1 < 受験.問題.length) { 現在++; 出題表示(); return; }
    if (!confirm("提出すると答えを直せません。提出して採点しますか？")) return;
    実行($("btn_次へ"), async () => {
      const r = await API("submit", Object.assign({ 受験番号: 受験.番号, 回答 }, ログイン));
      try { sessionStorage.removeItem(保存キー_回答); } catch (e) {}
      結果表示(r);
    }).catch(() => {});
  });

  // ---------- 結果（得点・合否・間違えた問題） ----------
  function 結果表示(r) {
    $("進捗バー").style.width = "100%";
    ルビ設定($("結果_見出し"), `第${r.段階}段階：${r.範囲名}`);
    const 合否 = $("結果_合否"); 合否.className = "pass " + (r.合格 ? "ok" : "ng"); ルビ設定(合否, r.合格 ? "合格" : "不合格");
    $("結果_得点").innerHTML = `${r.得点}<small> / ${r.問数}問　${ふりがな(`（合格は${r.合格ライン}問以上）`)}</small>`;
    ルビ設定($("結果_説明"), r.合格
      ? (r.次の段階 ? `おめでとうございます。次は ${r.次の段階} です。受験日時は店長が決めます。` : "おめでとうございます。すべての段階に合格しました。")
      : "もう一度受けるときの受験日時は店長が決めます。間違えた問題を見直しておきましょう。");
    $("結果_不正解").innerHTML = r.不正解.length
      ? `<h2 style="margin-top:18px">${ふりがな(`間違えた問題（${r.不正解.length}問）`)}</h2>` + r.不正解.map((w) => `
        <div class="wrong">
          <div class="qnum">${ふりがな(`第${w.番号}問`)}</div>
          <div class="qtext">${ふりがな(w.q)}</div>
          <div class="ans ng"><b>${ふりがな("あなたの答え")}</b><span>${ふりがな(w.選んだ)}</span></div>
          <div class="ans ok"><b>${ふりがな("正しい答え")}</b><span>${ふりがな(w.正解)}</span></div>
          <div class="explain"><b>${ふりがな("解説")}</b>${ふりがな(w.解説)}</div>
        </div>`).join("")
      : `<p class="msg">${ふりがな("全問正解です。")}</p>`;
    画面切替("画面_結果");
  }
  $("btn_結果_戻る").addEventListener("click", () => 実行($("btn_結果_戻る"), async () => 開始画面表示(await API("login", ログイン))).catch(() => {}));

  // ---------- 管理モード: 受験者の管理 ----------
  let 管理_一覧データ = null;
  function 管理モード開始(r) { 管理_一覧データ = r; ルビ設定($("段階バッジ"), "管理モード"); 画面切替("画面_管理メニュー"); }
  $("btn_メニュー_受験者").addEventListener("click", () => 実行($("btn_メニュー_受験者"), async () => {
    受験者一覧表示(await API("admin_list", { pin: ログイン.pin })); 画面切替("画面_管理_受験者");
  }).catch(() => {}));
  $("btn_受験者_メニュー").addEventListener("click", () => 画面切替("画面_管理メニュー"));
  function 受験者一覧表示(r) {
    管理_一覧データ = r;
    const 状態表示 = { "": "受験日時の設定待ち", 未受験: "受験日時を設定済み（まだ受けていない）", 受験中: "受験中", 提出済: "提出済み（次の受験日時の設定待ち）", 未提出: "受験日時内に提出されなかった" };
    $("受験者_一覧").innerHTML = r.受験者.length ? r.受験者.map((p, k) => `
      <div class="person" data-k="${k}">
        <h3>${ふりがな(p.氏名)} <span class="sub">（ID: ${esc(p.ID)}）</span></h3>
        <dl class="info">
          <dt>${ふりがな("段階")}</dt><dd>${ふりがな(p.段階 > r.段階一覧.length ? "全段階合格" : `第${p.段階}段階：${p.範囲名}`)}${p.受験回数 ? ふりがな(`（この段階の受験 ${p.受験回数}回）`) : ""}</dd>
          <dt>${ふりがな("受験日時")}</dt><dd>${ふりがな(p.受験枠)}</dd>
          <dt>${ふりがな("状態")}</dt><dd>${ふりがな(状態表示[p.枠の状態] || p.枠の状態)}</dd>
        </dl>
        <div class="edit">
          <label>${ふりがな("受験日時を設定する（開始〜終了）")}</label>
          <input type="datetime-local" class="e_開始" value="${esc(p.開始)}">
          <input type="datetime-local" class="e_終了" value="${esc(p.終了)}">
          <label>${ふりがな("受ける段階")}</label>
          <select class="e_段階">${r.段階一覧.map((s, i) => `<option value="${i + 1}"${i + 1 === p.段階 ? " selected" : ""}>${esc(s)}</option>`).join("")}<option value="${r.段階一覧.length + 1}"${p.段階 > r.段階一覧.length ? " selected" : ""}>全段階合格（受験なし）</option></select>
          <button class="btn small e_保存" type="button">この内容で受験日時を設定する</button>
        </div>
      </div>`).join("") : `<p class="msg">${ふりがな("受験者が登録されていません。スプレッドシートの受験者シートに追加してください。")}</p>`;
    $("受験者_記録").innerHTML = r.記録.length ? r.記録.map((x) => `<li><span class="k">${esc(x.合否)}</span><span>${ふりがな(`${x.日時}　${x.氏名}　第${x.段階}段階（${x.回数}回目）　${x.得点 === "" ? "" : `${x.得点}/${x.問数}問`}`)}</span></li>`).join("") : `<li>${ふりがな("まだ記録はありません")}</li>`;
    $("受験者_一覧").querySelectorAll(".person").forEach((el) => {
      const p = r.受験者[Number(el.dataset.k)];
      el.querySelector(".e_保存").addEventListener("click", (ev) => {
        const 開始 = el.querySelector(".e_開始").value, 終了 = el.querySelector(".e_終了").value, 段階 = el.querySelector(".e_段階").value;
        if (!開始 || !終了) { トースト("開始と終了の日時を入れてください"); return; }
        if (p.枠の状態 === "受験中" && !confirm(`${p.氏名}さんは受験中です。設定し直すと途中の回答は無効になります。よろしいですか？`)) return;
        実行(ev.currentTarget, async () => { 受験者一覧表示(await API("admin_set", { pin: ログイン.pin, id: p.ID, 開始, 終了, 段階 })); トースト(`${p.氏名}さんの受験日時を設定しました`); }).catch(() => {});
      });
    });
  }

  // ---------- 管理モード: 設問の確認と修正点の記入 ----------
  /* 問題バンクは管理パスワードを確認したうえでサーバーから受け取る（このページには置かない）。
   * 修正点は問題バンク上の位置（範囲id-問番号）をキーに端末へ保存する */
  let 管理_バンク = null, 管理_番号 = 0, 管理_一覧 = [], 管理_見出し = "";
  function 修正点読込() { try { return JSON.parse(localStorage.getItem(保存キー_修正点) || "{}"); } catch (e) { return {}; } }
  function 修正点保存(obj) { try { localStorage.setItem(保存キー_修正点, JSON.stringify(obj)); } catch (e) {} }
  function 設問キー(s, i) { return `${s.id}-${i + 1}`; }
  async function バンク取得() { if (!管理_バンク) 管理_バンク = (await API("admin_bank", { pin: ログイン.pin })).バンク; return 管理_バンク; }
  function 管理_一覧を作る(i) {
    const s = 管理_バンク.セット一覧[i] || 管理_バンク.セット一覧[0];
    管理_一覧 = s.問題.map((q, k) => Object.assign({ id: 設問キー(s, k) }, q)); 管理_見出し = `範囲${s.id}：${s.名称}（全${管理_一覧.length}問）`;
  }
  $("btn_メニュー_設問").addEventListener("click", () => 実行($("btn_メニュー_設問"), async () => {
    await バンク取得();
    const sel = $("管理_範囲"); sel.innerHTML = "";
    管理_バンク.セット一覧.forEach((s, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `第${i + 1}段階：${s.名称}（全${s.問題.length}問）`; sel.appendChild(o); });
    管理_一覧を作る(0); 管理_番号 = 0; 管理_設問一覧更新(); 管理_設問表示(); 管理_出力更新();
    画面切替(["画面_管理", "画面_管理_出力"]);
  }).catch(() => {}));
  $("btn_メニュー_ふりがな").addEventListener("click", () => 実行($("btn_メニュー_ふりがな"), async () => {
    await バンク取得();
    const list = ふりがな未登録一覧(); const ta = $("ふりがな_未登録"); ta.hidden = false;
    ta.value = list.length ? `未登録 ${list.length}語\n` + list.join("　") : "未登録の漢字はありません";
  }).catch(() => {}));
  $("btn_管理_メニュー").addEventListener("click", () => 画面切替("画面_管理メニュー"));
  function 管理_設問一覧更新() {
    const notes = 修正点読込(); const sel = $("管理_設問"); sel.innerHTML = "";
    管理_一覧.forEach((q, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${notes[q.id] ? "✎ " : ""}第${i + 1}問　${q.q.length > 22 ? q.q.slice(0, 22) + "…" : q.q}`; sel.appendChild(o); });
    sel.value = String(管理_番号);
  }
  function 管理_設問表示() {
    const q = 管理_一覧[管理_番号]; const key = q.id;
    ルビ設定($("管理_問番号"), `${管理_見出し}　第${管理_番号 + 1}問 / ${管理_一覧.length}　［${key}］`);
    ルビ設定($("管理_問文"), q.q);
    const ul = $("管理_選択肢"); ul.innerHTML = "";
    q.c.forEach((text, i) => { const li = document.createElement("li"); li.className = "choice locked" + (i === q.a ? " correct" : ""); li.innerHTML = `<span class="mark">${"ABCD"[i]}</span><span>${ふりがな(text)}${i === q.a ? ふりがな("　（正解）") : ""}</span>`; ul.appendChild(li); });
    $("管理_解説").innerHTML = `<b>解説</b>${ふりがな(q.e)}<div class="src">出典: ${出典名(q.s)}</div>`;
    $("管理_修正点").value = 修正点読込()[key] || "";
    const 最後 = 管理_番号 >= 管理_一覧.length - 1;
    $("btn_管理_前へ").disabled = 管理_番号 === 0; $("btn_管理_次へ").disabled = 最後;
    $("btn_管理_保存次へ").textContent = 最後 ? "保存する（この範囲の最後の問題）" : "保存して次の問題へ";
    $("管理_設問").value = String(管理_番号);
  }
  function 修正点を保存する() {
    const key = 管理_一覧[管理_番号].id; const notes = 修正点読込();
    const v = $("管理_修正点").value; if (v.trim()) notes[key] = v; else delete notes[key];
    修正点保存(notes); 管理_出力更新();
    const opt = $("管理_設問").options[管理_番号]; if (opt) opt.textContent = (v.trim() ? "✎ " : "") + opt.textContent.replace(/^✎ /, "");
  }
  $("btn_管理_保存次へ").addEventListener("click", () => {
    修正点を保存する();
    if (管理_番号 >= 管理_一覧.length - 1) { トースト("保存しました。この範囲の最後の問題です"); return; }
    管理_番号++; 管理_設問表示(); トースト("保存しました"); window.scrollTo(0, 0);
  });
  function 管理_出力更新() {
    const notes = 修正点読込(); const lines = []; let 件数 = 0;
    管理_バンク.セット一覧.forEach((s) => {
      const rows = [];
      s.問題.forEach((q, i) => { const n = (notes[設問キー(s, i)] || "").trim(); if (n) { 件数++; rows.push(`[${設問キー(s, i)}] ${q.q}\n　修正点: ${n}`); } });
      if (rows.length) lines.push(`■ 範囲${s.id}：${s.名称}\n${rows.join("\n")}`);
    });
    const head = `【山王苑 理解テスト 修正依頼】${日時文字列()}　${件数}件`;
    $("管理_出力テキスト").value = 件数 ? `${head}\n\n${lines.join("\n\n")}` : `${head}\n（修正点の記入はまだありません）`;
    $("管理_件数").textContent = `記入済み: ${件数}件（全${管理_バンク.セット一覧.reduce((a, s) => a + s.問題.length, 0)}問中）`;
  }
  $("管理_範囲").addEventListener("change", () => { 管理_一覧を作る(parseInt($("管理_範囲").value, 10) || 0); 管理_番号 = 0; 管理_設問一覧更新(); 管理_設問表示(); });
  $("管理_設問").addEventListener("change", () => { 管理_番号 = parseInt($("管理_設問").value, 10) || 0; 管理_設問表示(); });
  $("btn_管理_前へ").addEventListener("click", () => { if (管理_番号 > 0) { 管理_番号--; 管理_設問表示(); } });
  $("btn_管理_次へ").addEventListener("click", () => { if (管理_番号 < 管理_一覧.length - 1) { 管理_番号++; 管理_設問表示(); } });
  $("管理_修正点").addEventListener("input", 修正点を保存する);
  $("btn_管理_コピー").addEventListener("click", () => コピー($("管理_出力テキスト")));
  $("btn_管理_共有").addEventListener("click", () => 共有($("管理_出力テキスト").value));
  $("btn_管理_戻る").addEventListener("click", () => 画面切替("画面_管理メニュー"));
  $("btn_管理_全消去").addEventListener("click", () => { if (confirm("記入した修正点をすべて消します。よろしいですか？")) { 修正点保存({}); 管理_設問一覧更新(); 管理_設問表示(); 管理_出力更新(); トースト("消去しました"); } });

  // ---------- 起動（同じタブで再読込したときはログイン状態を引き継ぐ） ----------
  (async function 起動() {
    try { ログイン = JSON.parse(sessionStorage.getItem(保存キー_ログイン) || "null"); } catch (e) { ログイン = null; }
    if (!ログイン) { 画面切替("画面_ログイン"); return; }
    try {
      if (ログイン.id === "admin") 管理モード開始(await API("admin_list", { pin: ログイン.pin }));
      else 開始画面表示(await API("login", ログイン));
    } catch (e) { ログイン保存(null); 画面切替("画面_ログイン"); $("ログインエラー").textContent = e.message; }
  })();
})();

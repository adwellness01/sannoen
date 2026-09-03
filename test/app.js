/* 山王苑 理解テスト 画面ロジック
 * - 週番号は「週の起点（月曜）」からの経過週で決まり、6つの範囲を順に回す
 * - 1回の出題は「その週の範囲の全問」＋「他の範囲から補充」で出題数（50問）にする
 * - 同じ週に受ける人は全員同じ問題・同じ順番（週番号をシードに決定的シャッフル）
 * - 受験中は正解を表示しない。最後に回答一覧を出し、採点は店舗で行う（管理モードに採点用の正解一覧あり）
 * - URLパラメータ: ?week=N（週を指定） ?all=1（全範囲からランダム）
 * - パスコード「admin」で管理モード（採点用の正解一覧／全設問の確認と修正点の記入）
 */
(function () {
  "use strict";
  /* 古い入口ページ（キャッシュ）から読み込まれた場合は、別URLで新しい入口を取り直す */
  if (!document.getElementById("app") || !document.getElementById("画面_管理_正解")) {
    const q = location.search.replace(/^\?/, "").split("&").filter((p) => p && !/^r=/.test(p));
    q.push("r=" + Date.now());
    location.replace(location.pathname + "?" + q.join("&"));
    return;
  }
  const バンク = window.問題バンク;
  const パスコードハッシュ = "90a1fb63e15ccfb9ec0fece0d1fb8deb78be2df610d4e3ae4d59ca1c2d30e510"; // SHA-256
  const 保存キー_認証 = "sannoen_test_auth";
  const 保存キー_氏名 = "sannoen_test_name";
  const 保存キー_履歴 = "sannoen_test_history";
  const 保存キー_修正点 = "sannoen_test_admin_notes";
  const 表示週数 = 12;

  const $ = (id) => document.getElementById(id);
  const 画面 = ["画面_パスコード", "画面_開始", "画面_出題", "画面_結果", "画面_管理メニュー", "画面_管理_正解", "画面_管理", "画面_管理_出力"];
  function 画面切替(id) { const ids = Array.isArray(id) ? id : [id]; 画面.forEach((p) => $(p).classList.toggle("hidden", !ids.includes(p))); window.scrollTo(0, 0); }
  function トースト(msg) { const t = $("トースト"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1600); }
  async function コピー(ta) {
    try { await navigator.clipboard.writeText(ta.value); トースト("コピーしました"); }
    catch (e) { ta.focus(); ta.select(); try { document.execCommand("copy"); トースト("コピーしました"); } catch (e2) { トースト("長押しでコピーしてください"); } }
  }
  async function 共有(text) {
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else { トースト("この端末は共有に対応していません。コピーを使ってください"); }
  }
  function 出典名(s) { return { 盛付: "盛り付け・調理マニュアル", 弁当: "ランチ・弁当シート", 体制: "仕込み体制・スキルシート" }[s] || s; }
  function 日時文字列() { const d = new Date(); const pad = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

  // ---------- 週の決定 ----------
  const params = new URLSearchParams(location.search);
  function 今日JST() { const now = new Date(); const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 9 * 60) * 60000); return new Date(jst.getFullYear(), jst.getMonth(), jst.getDate()); }
  function 暦の週番号() {
    const [y, m, d] = バンク.週の起点.split("-").map(Number);
    const 経過日 = Math.floor((今日JST() - new Date(y, m - 1, d)) / 86400000);
    return 経過日 < 0 ? 1 : Math.floor(経過日 / 7) + 1;
  }
  const 今週 = 暦の週番号();
  const 週 = params.get("week") ? Math.max(1, parseInt(params.get("week"), 10) || 1) : 今週;
  const 全範囲 = params.get("all") === "1";
  function 週の範囲(w) { return バンク.セット一覧[(w - 1) % バンク.セット一覧.length]; }

  // ---------- 決定的シャッフルと出題の生成 ----------
  function 乱数生成器(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function シャッフル(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function 全問(s) { return s.問題.map((q, i) => Object.assign({ id: `${s.id}-${i + 1}` }, q)); }
  /* 週番号から出題（問題と選択肢の並びまで固定）を作る。全範囲モードは毎回ランダム */
  function 出題を作る(w, ランダム) {
    const 範囲 = ランダム ? null : 週の範囲(w);
    const rnd = 乱数生成器(ランダム ? Date.now() : w * 1000 + 範囲.id);
    let 候補;
    if (ランダム) {
      候補 = シャッフル(バンク.セット一覧.flatMap(全問), rnd);
    } else {
      const 主 = シャッフル(全問(範囲), rnd);
      const 他 = シャッフル(バンク.セット一覧.filter((s) => s.id !== 範囲.id).flatMap(全問), rnd);
      候補 = 主.concat(他);
    }
    const n = Math.min(バンク.出題数, 候補.length);
    return シャッフル(候補.slice(0, n), rnd).map((q) => {
      const 並び = シャッフル(q.c.map((_, i) => i), rnd);
      return { id: q.id, q: q.q, c: 並び.map((i) => q.c[i]), a: 並び.indexOf(q.a), e: q.e, s: q.s };
    });
  }
  const セット = 全範囲 ? { id: 0, 名称: "総合（全範囲）", 範囲: "全範囲からランダム出題" } : 週の範囲(週);
  const 出題 = 出題を作る(週, 全範囲);
  const 出題数 = 出題.length;
  const 週ラベル = 全範囲 ? "総合" : `第${週}週`;

  // ---------- 表示初期化 ----------
  $("週バッジ").textContent = 週ラベル;
  $("開始_見出し").textContent = 全範囲 ? セット.名称 : `${週ラベル}：${セット.名称}`;
  $("開始_範囲").textContent = 全範囲 ? セット.範囲 : `中心となる範囲：${セット.範囲}`;
  $("開始_問数").textContent = 出題数;
  バンク.セット一覧.forEach((s, i) => {
    const li = document.createElement("li"); const 該当 = !全範囲 && s.id === セット.id;
    li.innerHTML = `<span class="n">${i + 1}週目</span><span class="${該当 ? "now" : ""}">${s.名称}</span>`;
    $("セット一覧").appendChild(li);
  });
  function 週プルダウン(sel, 総合あり) {
    sel.innerHTML = "";
    for (let w = 1; w <= 表示週数; w++) { const o = document.createElement("option"); o.value = String(w); o.textContent = `第${w}週：${週の範囲(w).名称}`; sel.appendChild(o); }
    if (総合あり) { const o = document.createElement("option"); o.value = "all"; o.textContent = `総合：全範囲からランダム${バンク.出題数}問`; sel.appendChild(o); }
  }
  週プルダウン($("週選択"), true);
  $("週選択").value = 全範囲 ? "all" : String(Math.min(週, 表示週数));
  $("週選択").addEventListener("change", () => { const v = $("週選択").value; location.href = location.pathname + (v === "all" ? "?all=1" : `?week=${v}`); });

  // ---------- パスコード ----------
  async function sha256(text) { const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
  async function パスコード確認() {
    const v = $("パスコード").value.trim(); if (!v) return;
    if (v.toLowerCase() === "admin") { 管理モード開始(); return; }
    let ok = false;
    try { ok = (await sha256(v)) === パスコードハッシュ; } catch (e) { ok = v === "0903"; }
    if (ok) { try { localStorage.setItem(保存キー_認証, "1"); } catch (e) {} 開始画面へ(); }
    else { $("パスコードエラー").textContent = "パスコードが違います。"; $("パスコード").select(); }
  }
  $("btn_パスコード").addEventListener("click", パスコード確認);
  $("パスコード").addEventListener("keydown", (e) => { if (e.key === "Enter") パスコード確認(); });

  // ---------- 開始画面 ----------
  function 履歴読込() { try { return JSON.parse(localStorage.getItem(保存キー_履歴) || "[]"); } catch (e) { return []; } }
  function 履歴表示() {
    const h = 履歴読込(); if (!h.length) { $("履歴").innerHTML = ""; return; }
    $("履歴").innerHTML = "<div>この端末での受験履歴</div><ul style='margin:4px 0 0;padding-left:18px'>" + h.slice(-5).reverse().map((r) => `<li>${r.日時}　${r.週}　${r.問数}問 回答済み</li>`).join("") + "</ul>";
  }
  function 開始画面へ() {
    let 名 = ""; try { 名 = localStorage.getItem(保存キー_氏名) || ""; } catch (e) {}
    $("氏名").value = 名; $("btn_開始").disabled = !名.trim(); 履歴表示(); 画面切替("画面_開始");
  }
  $("氏名").addEventListener("input", () => { $("btn_開始").disabled = !$("氏名").value.trim(); });
  $("btn_開始").addEventListener("click", () => {
    const 名 = $("氏名").value.trim(); if (!名) return;
    try { localStorage.setItem(保存キー_氏名, 名); } catch (e) {}
    受験者 = 名; 現在 = 0; 回答 = []; 出題表示(); 画面切替("画面_出題");
  });

  // ---------- 出題（正解は表示しない） ----------
  let 受験者 = "", 現在 = 0, 回答 = [];
  function 出題表示() {
    const q = 出題[現在];
    $("進捗バー").style.width = `${(現在 / 出題数) * 100}%`;
    $("問番号").textContent = `第${現在 + 1}問 / ${出題数}`;
    $("問文").textContent = q.q;
    const ul = $("選択肢"); ul.innerHTML = "";
    q.c.forEach((text, i) => {
      const li = document.createElement("li"); li.className = "choice" + (回答[現在] === i ? " selected" : "");
      li.innerHTML = `<span class="mark">${"ABCD"[i]}</span><span>${text}</span>`;
      li.addEventListener("click", () => { 回答[現在] = i; Array.from(ul.children).forEach((c, k) => c.classList.toggle("selected", k === i)); $("btn_次へ").disabled = false; });
      ul.appendChild(li);
    });
    $("btn_前へ").disabled = 現在 === 0;
    $("btn_次へ").disabled = 回答[現在] === undefined;
    $("btn_次へ").textContent = 現在 + 1 < 出題数 ? "次へ →" : "回答を終える";
    window.scrollTo(0, 0);
  }
  $("btn_前へ").addEventListener("click", () => { if (現在 > 0) { 現在--; 出題表示(); } });
  $("btn_次へ").addEventListener("click", () => { if (回答[現在] === undefined) return; 現在++; if (現在 < 出題数) 出題表示(); else 結果表示(); });

  // ---------- 回答完了（回答一覧を出す。採点は店舗） ----------
  function 回答行(arr) { const rows = []; for (let i = 0; i < arr.length; i += 10) rows.push(arr.slice(i, i + 10).join("　")); return rows.join("\n"); }
  function 結果表示() {
    const 日時 = 日時文字列();
    $("進捗バー").style.width = "100%";
    $("結果_氏名").textContent = `${受験者}　${日時}　${週ラベル}：${セット.名称}`;
    const 一覧 = 出題.map((q, i) => `${i + 1}:${"ABCD"[回答[i]]}`);
    const text = [`【山王苑 理解テスト 回答】${週ラベル}：${セット.名称}（${出題数}問）`, `氏名：${受験者}`, `受験日時：${日時}`, "回答：", 回答行(一覧)].join("\n");
    $("結果テキスト").value = text;
    try { const h = 履歴読込(); h.push({ 日時, 週: `${週ラベル} ${セット.名称}`, 問数: 出題数 }); localStorage.setItem(保存キー_履歴, JSON.stringify(h.slice(-20))); } catch (e) {}
    画面切替("画面_結果");
  }
  $("btn_コピー").addEventListener("click", () => コピー($("結果テキスト")));
  $("btn_共有").addEventListener("click", () => 共有($("結果テキスト").value));
  $("btn_もう一度").addEventListener("click", () => { location.href = location.pathname + location.search; });

  // ---------- 管理モード ----------
  let 管理_セット = 0, 管理_番号 = 0;
  function 修正点読込() { try { return JSON.parse(localStorage.getItem(保存キー_修正点) || "{}"); } catch (e) { return {}; } }
  function 修正点保存(obj) { try { localStorage.setItem(保存キー_修正点, JSON.stringify(obj)); } catch (e) {} }
  function 設問キー(s, i) { return `${s.id}-${i + 1}`; }
  function 管理モード開始() {
    週プルダウン($("正解_週"), false); $("正解_週").value = String(Math.min(週, 表示週数)); 正解一覧表示();
    const sel = $("管理_週"); sel.innerHTML = "";
    バンク.セット一覧.forEach((s, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${i + 1}週目：${s.名称}（${s.問題.length}問）`; sel.appendChild(o); });
    管理_セット = Math.max(0, バンク.セット一覧.findIndex((s) => s.id === セット.id)); 管理_番号 = 0; sel.value = String(管理_セット);
    管理_設問一覧更新(); 管理_設問表示(); 管理_出力更新();
    画面切替("画面_管理メニュー");
  }
  $("btn_メニュー_正解").addEventListener("click", () => 画面切替("画面_管理_正解"));
  $("btn_メニュー_設問").addEventListener("click", () => 画面切替(["画面_管理", "画面_管理_出力"]));
  $("btn_メニュー_戻る").addEventListener("click", () => { location.href = location.pathname; });
  $("btn_正解_メニュー").addEventListener("click", () => 画面切替("画面_管理メニュー"));
  $("btn_管理_メニュー").addEventListener("click", () => 画面切替("画面_管理メニュー"));
  // 採点用の正解一覧（受験者と同じ生成ロジックで週ごとに固定）
  function 正解一覧表示() {
    const w = parseInt($("正解_週").value, 10) || 1; const 範囲 = 週の範囲(w); const list = 出題を作る(w, false);
    $("正解_見出し").textContent = `第${w}週：${範囲.名称}（${list.length}問）`;
    $("正解_一覧").innerHTML = list.map((q, i) => `<li><span class="k">${i + 1}: ${"ABCD"[q.a]}</span><span class="id">[${q.id}]</span><span>${q.q}</span></li>`).join("");
    $("正解_テキスト").value = `【山王苑 理解テスト 正解】第${w}週：${範囲.名称}（${list.length}問）\n` + 回答行(list.map((q, i) => `${i + 1}:${"ABCD"[q.a]}`));
  }
  $("正解_週").addEventListener("change", 正解一覧表示);
  $("btn_正解_コピー").addEventListener("click", () => コピー($("正解_テキスト")));

  function 管理_設問一覧更新() {
    const s = バンク.セット一覧[管理_セット]; const notes = 修正点読込(); const sel = $("管理_設問"); sel.innerHTML = "";
    s.問題.forEach((q, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = `${notes[設問キー(s, i)] ? "✎ " : ""}第${i + 1}問　${q.q.length > 22 ? q.q.slice(0, 22) + "…" : q.q}`; sel.appendChild(o); });
    sel.value = String(管理_番号);
  }
  function 管理_設問表示() {
    const s = バンク.セット一覧[管理_セット]; const q = s.問題[管理_番号]; const key = 設問キー(s, 管理_番号);
    $("管理_問番号").textContent = `${管理_セット + 1}週目：${s.名称}　第${管理_番号 + 1}問 / ${s.問題.length}　［${key}］`;
    $("管理_問文").textContent = q.q;
    const ul = $("管理_選択肢"); ul.innerHTML = "";
    q.c.forEach((text, i) => { const li = document.createElement("li"); li.className = "choice locked" + (i === q.a ? " correct" : ""); li.innerHTML = `<span class="mark">${"ABCD"[i]}</span><span>${text}${i === q.a ? "　（正解）" : ""}</span>`; ul.appendChild(li); });
    $("管理_解説").innerHTML = `<b>解説</b>${q.e}<div class="src">出典: ${出典名(q.s)}</div>`;
    $("管理_修正点").value = 修正点読込()[key] || "";
    $("btn_管理_前へ").disabled = 管理_番号 === 0; $("btn_管理_次へ").disabled = 管理_番号 >= s.問題.length - 1;
    $("管理_設問").value = String(管理_番号);
  }
  function 管理_出力更新() {
    const notes = 修正点読込(); const lines = []; let 件数 = 0;
    バンク.セット一覧.forEach((s, si) => {
      const rows = [];
      s.問題.forEach((q, i) => { const n = (notes[設問キー(s, i)] || "").trim(); if (n) { 件数++; rows.push(`[${設問キー(s, i)}] ${q.q}\n　修正点: ${n}`); } });
      if (rows.length) lines.push(`■ ${si + 1}週目：${s.名称}\n${rows.join("\n")}`);
    });
    const head = `【山王苑 理解テスト 修正依頼】${日時文字列()}　${件数}件`;
    $("管理_出力テキスト").value = 件数 ? `${head}\n\n${lines.join("\n\n")}` : `${head}\n（修正点の記入はまだありません）`;
    $("管理_件数").textContent = `記入済み: ${件数}件（全${バンク.セット一覧.reduce((a, s) => a + s.問題.length, 0)}問中）`;
  }
  $("管理_週").addEventListener("change", () => { 管理_セット = parseInt($("管理_週").value, 10) || 0; 管理_番号 = 0; 管理_設問一覧更新(); 管理_設問表示(); });
  $("管理_設問").addEventListener("change", () => { 管理_番号 = parseInt($("管理_設問").value, 10) || 0; 管理_設問表示(); });
  $("btn_管理_前へ").addEventListener("click", () => { if (管理_番号 > 0) { 管理_番号--; 管理_設問表示(); } });
  $("btn_管理_次へ").addEventListener("click", () => { if (管理_番号 < バンク.セット一覧[管理_セット].問題.length - 1) { 管理_番号++; 管理_設問表示(); } });
  $("管理_修正点").addEventListener("input", () => {
    const s = バンク.セット一覧[管理_セット]; const key = 設問キー(s, 管理_番号); const notes = 修正点読込();
    const v = $("管理_修正点").value; if (v.trim()) notes[key] = v; else delete notes[key];
    修正点保存(notes); 管理_出力更新();
    const opt = $("管理_設問").options[管理_番号]; if (opt) opt.textContent = (v.trim() ? "✎ " : "") + opt.textContent.replace(/^✎ /, "");
  });
  $("btn_管理_コピー").addEventListener("click", () => コピー($("管理_出力テキスト")));
  $("btn_管理_共有").addEventListener("click", () => 共有($("管理_出力テキスト").value));
  $("btn_管理_戻る").addEventListener("click", () => 画面切替("画面_管理メニュー"));
  $("btn_管理_全消去").addEventListener("click", () => { if (confirm("記入した修正点をすべて消します。よろしいですか？")) { 修正点保存({}); 管理_設問一覧更新(); 管理_設問表示(); 管理_出力更新(); トースト("消去しました"); } });

  // ---------- 起動 ----------
  let 認証済 = false; try { 認証済 = localStorage.getItem(保存キー_認証) === "1"; } catch (e) {}
  if (認証済) 開始画面へ(); else { 画面切替("画面_パスコード"); $("パスコード").focus(); }
})();

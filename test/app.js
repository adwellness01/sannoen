/* 山王苑 理解テスト 画面ロジック
 * - 週番号は「週の起点（月曜）」からの経過週で決まり、6セットを順に回す
 * - 同じ週に受ける人は全員同じ問題・同じ順番（週番号をシードに決定的シャッフル）
 * - URLパラメータ: ?week=N（週を指定して確認） ?set=1..6（範囲を直接指定） ?all=1（全範囲からランダム）
 * - 結果はサーバー保存なし。報告テキストをコピー／共有し、端末のlocalStorageに履歴を残す
 */
(function () {
  "use strict";
  const バンク = window.問題バンク;
  const パスコードハッシュ = "a8028621700e292c184dd2f446c009faf7a6504a4fb275d04e268c65b07be1bc"; // SHA-256
  const 保存キー_認証 = "sannoen_test_auth";
  const 保存キー_氏名 = "sannoen_test_name";
  const 保存キー_履歴 = "sannoen_test_history";

  const $ = (id) => document.getElementById(id);
  const 画面 = ["画面_パスコード", "画面_開始", "画面_出題", "画面_結果"];
  function 画面切替(id) { 画面.forEach((p) => $(p).classList.toggle("hidden", p !== id)); window.scrollTo(0, 0); }

  // ---------- 週の決定 ----------
  const params = new URLSearchParams(location.search);
  function 今日JST() {
    const now = new Date();
    const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 9 * 60) * 60000);
    return new Date(jst.getFullYear(), jst.getMonth(), jst.getDate());
  }
  function 暦の週番号() {
    const [y, m, d] = バンク.週の起点.split("-").map(Number);
    const 起点 = new Date(y, m - 1, d);
    const 経過日 = Math.floor((今日JST() - 起点) / 86400000);
    return 経過日 < 0 ? 1 : Math.floor(経過日 / 7) + 1;
  }
  const 今週 = 暦の週番号();
  const 週 = params.get("week") ? Math.max(1, parseInt(params.get("week"), 10) || 1) : 今週;
  const 全範囲 = params.get("all") === "1";
  let セット;
  if (全範囲) {
    セット = { id: 0, 名称: "総合（全範囲）", 範囲: "全セットからランダム出題", 問題: バンク.セット一覧.flatMap((s) => s.問題) };
  } else if (params.get("set")) {
    const n = parseInt(params.get("set"), 10);
    セット = バンク.セット一覧.find((s) => s.id === n) || バンク.セット一覧[0];
  } else {
    セット = バンク.セット一覧[(週 - 1) % バンク.セット一覧.length];
  }

  // ---------- 決定的シャッフル ----------
  function 乱数生成器(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function シャッフル(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const シード = 全範囲 ? Date.now() : 週 * 1000 + セット.id;
  const rnd = 乱数生成器(シード);
  const 出題数 = Math.min(バンク.出題数, セット.問題.length);
  const 出題 = シャッフル(セット.問題, rnd).slice(0, 出題数).map((q) => {
    const 並び = シャッフル(q.c.map((_, i) => i), rnd);
    return { q: q.q, c: 並び.map((i) => q.c[i]), a: 並び.indexOf(q.a), e: q.e, s: q.s };
  });

  // ---------- 表示初期化 ----------
  const 週ラベル = 全範囲 ? "総合" : `第${週}週`;
  $("週バッジ").textContent = 週ラベル;
  $("開始_見出し").textContent = 全範囲 ? セット.名称 : `${週ラベル}：${セット.名称}`;
  $("開始_範囲").textContent = セット.範囲;
  $("開始_問数").textContent = 出題数;
  $("開始_合格").textContent = Math.round(バンク.合格ライン * 100);
  バンク.セット一覧.forEach((s, i) => {
    const li = document.createElement("li");
    const 該当 = !全範囲 && s.id === セット.id;
    li.innerHTML = `<span class="n">${i + 1}週目</span><span class="${該当 ? "now" : ""}">${s.名称}</span>`;
    $("セット一覧").appendChild(li);
  });

  // ---------- 週・範囲の選択（開始画面） ----------
  (function 週選択を作る() {
    const sel = $("週選択");
    const 表示週数 = Math.max(12, Math.ceil(今週 / バンク.セット一覧.length) * バンク.セット一覧.length + バンク.セット一覧.length);
    for (let w = 1; w <= 表示週数; w++) {
      const s = バンク.セット一覧[(w - 1) % バンク.セット一覧.length];
      const o = document.createElement("option");
      o.value = String(w);
      o.textContent = `第${w}週：${s.名称}${w === 今週 ? "（今週）" : ""}`;
      sel.appendChild(o);
    }
    const oAll = document.createElement("option");
    oAll.value = "all"; oAll.textContent = "総合：全範囲からランダム15問";
    sel.appendChild(oAll);
    sel.value = 全範囲 ? "all" : String(週);
    sel.addEventListener("change", () => {
      const v = sel.value;
      location.href = location.pathname + (v === "all" ? "?all=1" : `?week=${v}`);
    });
  })();

  // ---------- パスコード ----------
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function パスコード確認() {
    const v = $("パスコード").value.trim();
    if (!v) return;
    let ok = false;
    try { ok = (await sha256(v)) === パスコードハッシュ; } catch (e) { ok = v === "sannoen"; }
    if (ok) { try { localStorage.setItem(保存キー_認証, "1"); } catch (e) {} 開始画面へ(); }
    else { $("パスコードエラー").textContent = "パスコードが違います。"; $("パスコード").select(); }
  }
  $("btn_パスコード").addEventListener("click", パスコード確認);
  $("パスコード").addEventListener("keydown", (e) => { if (e.key === "Enter") パスコード確認(); });

  // ---------- 開始画面 ----------
  function 履歴読込() { try { return JSON.parse(localStorage.getItem(保存キー_履歴) || "[]"); } catch (e) { return []; } }
  function 履歴表示() {
    const h = 履歴読込();
    if (!h.length) { $("履歴").innerHTML = ""; return; }
    $("履歴").innerHTML = "<div>この端末での受験履歴</div><ul style='margin:4px 0 0;padding-left:18px'>" +
      h.slice(-5).reverse().map((r) => `<li>${r.日時}　${r.週}　${r.得点}/${r.満点}（${r.合否}）</li>`).join("") + "</ul>";
  }
  function 開始画面へ() {
    let 名 = ""; try { 名 = localStorage.getItem(保存キー_氏名) || ""; } catch (e) {}
    $("氏名").value = 名; $("btn_開始").disabled = !名.trim();
    履歴表示(); 画面切替("画面_開始");
  }
  $("氏名").addEventListener("input", () => { $("btn_開始").disabled = !$("氏名").value.trim(); });
  $("btn_開始").addEventListener("click", () => {
    const 名 = $("氏名").value.trim(); if (!名) return;
    try { localStorage.setItem(保存キー_氏名, 名); } catch (e) {}
    受験者 = 名; 現在 = 0; 回答 = []; 出題表示(); 画面切替("画面_出題");
  });

  // ---------- 出題 ----------
  let 受験者 = "", 現在 = 0, 回答 = [];
  function 出題表示() {
    const q = 出題[現在];
    $("進捗バー").style.width = `${(現在 / 出題数) * 100}%`;
    $("問番号").textContent = `第${現在 + 1}問 / ${出題数}`;
    $("問文").textContent = q.q;
    $("解説").classList.add("hidden"); $("btn_次へ").classList.add("hidden");
    const ul = $("選択肢"); ul.innerHTML = "";
    q.c.forEach((text, i) => {
      const li = document.createElement("li"); li.className = "choice";
      li.innerHTML = `<span class="mark">${"ABCD"[i]}</span><span>${text}</span>`;
      li.addEventListener("click", () => 回答する(i));
      ul.appendChild(li);
    });
  }
  function 回答する(i) {
    const q = 出題[現在]; if (回答[現在] !== undefined) return;
    回答[現在] = i;
    const items = $("選択肢").children;
    Array.from(items).forEach((li, k) => { li.classList.add("locked"); if (k === q.a) li.classList.add("correct"); else if (k === i) li.classList.add("wrong"); });
    const 正解 = i === q.a;
    $("解説").innerHTML = `<b>${正解 ? "正解" : "不正解"}${正解 ? "" : `　正解は ${"ABCD"[q.a]}`}</b>${q.e}<div class="src">出典: ${出典名(q.s)}</div>`;
    $("解説").classList.remove("hidden");
    $("btn_次へ").textContent = 現在 + 1 < 出題数 ? "次の問題へ" : "結果を見る";
    $("btn_次へ").classList.remove("hidden");
    $("btn_次へ").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function 出典名(s) { return { 盛付: "盛り付け・調理マニュアル", 弁当: "ランチ・弁当シート", 体制: "仕込み体制・スキルシート" }[s] || s; }
  $("btn_次へ").addEventListener("click", () => { 現在++; if (現在 < 出題数) 出題表示(); else 結果表示(); });

  // ---------- 結果 ----------
  function 結果表示() {
    const 正答 = 回答.filter((a, i) => a === 出題[i].a).length;
    const 率 = 正答 / 出題数; const 合格 = 率 >= バンク.合格ライン;
    const 誤答 = 出題.map((q, i) => (回答[i] === q.a ? null : i + 1)).filter(Boolean);
    const d = new Date(); const pad = (n) => String(n).padStart(2, "0");
    const 日時 = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $("進捗バー").style.width = "100%";
    $("結果_得点").innerHTML = `${正答}<small> / ${出題数}問　正答率${Math.round(率 * 100)}%</small>`;
    $("結果_判定").innerHTML = `<span class="pass ${合格 ? "ok" : "ng"}">${合格 ? "合格" : "再受験"}</span>`;
    $("結果_氏名").textContent = `${受験者}　${日時}`;
    const text = [
      `【山王苑 理解テスト】${週ラベル}：${セット.名称}`,
      `氏名：${受験者}`,
      `結果：${正答}/${出題数}問（${Math.round(率 * 100)}%）${合格 ? "合格" : "再受験"}`,
      誤答.length ? `間違えた問題：${誤答.map((n) => `第${n}問`).join("、")}` : "間違えた問題：なし",
      `受験日時：${日時}`
    ].join("\n");
    $("結果テキスト").value = text;
    $("復習").innerHTML = 出題.map((q, i) => {
      const ok = 回答[i] === q.a;
      return `<div class="item"><div class="q">第${i + 1}問　${q.q}</div>` +
        `<div class="a ${ok ? "ok" : "ng"}">${ok ? "○ " : "× "}あなたの回答：${q.c[回答[i]]}${ok ? "" : `<br>正解：${q.c[q.a]}`}</div>` +
        `<div class="e">${q.e}</div></div>`;
    }).join("");
    try {
      const h = 履歴読込(); h.push({ 日時, 週: `${週ラベル} ${セット.名称}`, 得点: 正答, 満点: 出題数, 合否: 合格 ? "合格" : "再受験" });
      localStorage.setItem(保存キー_履歴, JSON.stringify(h.slice(-20)));
    } catch (e) {}
    画面切替("画面_結果");
  }
  function トースト(msg) { const t = $("トースト"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1600); }
  $("btn_コピー").addEventListener("click", async () => {
    const ta = $("結果テキスト");
    try { await navigator.clipboard.writeText(ta.value); トースト("コピーしました"); }
    catch (e) { ta.focus(); ta.select(); try { document.execCommand("copy"); トースト("コピーしました"); } catch (e2) { トースト("長押しでコピーしてください"); } }
  });
  $("btn_共有").addEventListener("click", async () => {
    const text = $("結果テキスト").value;
    if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} }
    else { トースト("この端末は共有に対応していません。コピーを使ってください"); }
  });
  $("btn_もう一度").addEventListener("click", () => { location.href = location.pathname + location.search; });

  // ---------- 起動 ----------
  let 認証済 = false; try { 認証済 = localStorage.getItem(保存キー_認証) === "1"; } catch (e) {}
  if (認証済) 開始画面へ(); else { 画面切替("画面_パスコード"); $("パスコード").focus(); }
})();

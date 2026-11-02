(function () {
  "use strict";

  console.log('[DEBUG] IIFE started');
  document.title = document.title + ' [IIFE]';
  var items = [];
  var cats = [];
  var activeCat = "all";
  var query = "";
  var activeTab = "curated";
  var sortMode = "default";
  var liveMap = null;       // deprecated — 保留给安全引用
  var livePayload = null;   // live_multi.json 完整内容 { updated_at, curated, candidates }
  var candidateItems = [];  // 候选条目（标准化后）
  var liveResults = [];
  var liveAbort = null;
  var liveFetchedFor = "";

  var SOURCE_LABEL = {
    mcp_registry: "MCP Registry",
    github_rest: "GitHub",
    npm: "npm",
    crates: "crates.io"
  };

  /* ================= 工具函数 ================= */

  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return v.trim(); }); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var needle = esc(q);
    var out = "", rest = safe, lower = rest.toLowerCase(), nl = needle.toLowerCase();
    var idx = lower.indexOf(nl);
    if (idx === -1) return safe;
    while (idx !== -1) {
      out += rest.slice(0, idx) + "<mark>" + rest.slice(idx, idx + needle.length) + "</mark>";
      rest = rest.slice(idx + needle.length);
      lower = rest.toLowerCase();
      idx = lower.indexOf(nl);
    }
    return out + rest;
  }

  function catSortKey(cat) {
    var m = cat.match(/^(\d+)([A-Za-z]?)\./);
    if (!m) return { num: 999, letter: 0 };
    return { num: parseInt(m[1], 10), letter: m[2] ? 1 : 0 };
  }

  function splitName(full) {
    var m = full.match(/^(.*?)[（(]([^）)]*)[）)]\s*$/);
    if (m && m[1].trim()) return { title: m[1].trim(), desc: m[2].trim() };
    return { title: full, desc: "" };
  }

  function fmtStars(n) {
    if (n == null) return "";
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function relTime(iso) {
    if (!iso) return null;
    var days = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (days < 1) return { text: "今天更新", cls: "ok" };
    if (days < 30) return { text: Math.floor(days) + " 天前更新", cls: "ok" };
    if (days < 180) return { text: Math.floor(days / 30) + " 个月前更新", cls: "warm" };
    return { text: Math.floor(days / 365) + " 年前更新", cls: "cold" };
  }

  var palette = [
    ["#e8efff", "#2563eb", "#a5c0ff"],
    ["#e7f8f1", "#059669", "#7dddc0"],
    ["#fff3e0", "#d97706", "#fbc66f"],
    ["#f1e9ff", "#7c3aed", "#c9aaff"],
    ["#fff8db", "#ca8a04", "#eed77a"],
    ["#ffeaea", "#dc2626", "#f6a3a3"],
    ["#e6f3ff", "#0369a1", "#7cc7f5"],
    ["#e9f7ef", "#15803d", "#86d9a5"],
    ["#eef4ff", "#1d4ed8", "#93b4ff"],
    ["#fdeaf6", "#be1a72", "#f79ecb"],
    ["#f1f3f5", "#495057", "#adb5bd"],
    ["#eceeff", "#4338ca", "#a5b4fc"],
    ["#fbf3e4", "#92600a", "#e9c46a"],
    ["#e8fbf3", "#065f46", "#6ee7b7"],
    ["#f0edff", "#6d28d9", "#c4b5fd"],
    ["#e6faf5", "#0f766e", "#5eead4"],
    ["#fee9ec", "#be123c", "#fda4af"]
  ];

  /* ================= 数据加载 ================= */

  function load() {
    document.title = document.title + ' [LOAD]';
    console.log('[DEBUG] load() called');
    return Promise.all([
      fetch("catalog.csv").then(function (r) {
        if (!r.ok) throw new Error("catalog.csv " + r.status);
        return r.text();
      }),
      fetch("README.md").then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; }),
      fetch("live_multi.json?ts=" + Math.floor(Date.now() / 3600000)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      document.title = document.title + ' [RESOLVED payload=' + (livePayload ? 'YES' : 'NO') + ']';
      console.log('[DEBUG] Promise.all resolved, res[0] len=' + (res[0]?res[0].length:'null') + ' res[1] len=' + (res[1]?res[1].length:'null') + ' res[2]=' + (res[2] ? 'has keys ' + Object.keys(res[2]).join(',') : 'null'));
      livePayload = res[2];
      buildItems(parseCSV(res[0]));
      buildCandidates();
      buildDomains(res[1]);
      renderChips();
      buildLangFilter();
      render();
      renderCandidates();
      renderMeta(res[1]);
      // 注意顺序：animateStats() 内部用 requestAnimationFrame 异步调度，
      // 所以必须在 renderLiveMeta() 之后调用，确保 data-target 已被更新为动态值
      // （renderLiveMeta 会同步更新 textContent + data-target，animateStats 才会读到正确的 192）
      renderLiveMeta();
      animateStats();
    }).catch(function (err) {
      document.title = document.title + ' [REJECTED]';
      console.error('[DEBUG] Promise.all REJECTED:', err);
      document.getElementById("count").textContent = "";
      document.getElementById("empty").style.display = "block";
      document.getElementById("empty").innerHTML =
        "数据加载失败：" + esc(err.message) + "<br><small>请通过本地 HTTP 服务访问本页，而不是直接双击打开文件</small>";
    });
  }

  // 把 live_multi.json.candidates 数组标准化成 { title, url, hay, source, stars, ... }
  function buildCandidates() {
    if (!livePayload || !Array.isArray(livePayload.candidates)) {
      candidateItems = [];
      return;
    }
    // inbox 是高置信候选列表，用 id 建索引方便查 catalog_row / suggested_category
    var inboxIndex = {};
    if (Array.isArray(livePayload.inbox)) {
      livePayload.inbox.forEach(function (i) { inboxIndex[i.id] = i; });
    }
    var curatedIds = {};
    items.forEach(function (it) { curatedIds[it.slug.toLowerCase()] = true; });
    candidateItems = livePayload.candidates.map(function (e) {
      var inbox = inboxIndex[e.id];
      var url = e.repo_url || e.registry_url || "#";
      return {
        id: e.id,
        source: e.source,
        title: e.title,
        desc: e.desc || "",
        url: url,
        slug: e.repo_slug || "",
        registry_url: e.registry_url,
        endpoint: e.endpoint,
        stars: e.stars,
        forks: e.forks,
        downloads: e.downloads,
        pushed_at: e.pushed_at,
        status: e.status,
        lang: e.lang,
        license: e.license,
        published_at: e.published_at,
        confidence: (e.extra && e.extra.confidence) || 0,
        endpoint_status: (e.extra && e.extra.endpoint_status) || "",
        endpoint_http: (e.extra && e.extra.endpoint_http) || null,
        endpoint_note: (e.extra && e.extra.endpoint_note) || "",
        verified_at: (e.extra && e.extra.verified_at) || "",
        suggested_category: (inbox && inbox.suggested_category) || "",
        category_hits: (inbox && inbox.category_hits) || [],
        catalog_row: (inbox && inbox.catalog_row) || "",
        isInbox: !!inbox,
        isCandidate: true,
        hay: (e.title + " " + (e.desc || "") + " " + (e.repo_slug || "") + " " + (e.source || "") + " stars" + (e.stars || 0) + " " + (e.lang || "") + " " + (e.endpoint || "") + " " + ((inbox && inbox.suggested_category) || "")).toLowerCase()
      };
    }).filter(function (c) {
      if (c.slug && curatedIds[c.slug.toLowerCase()]) return false;
      return true;
    });
    document.getElementById("candidateCount").textContent = candidateItems.length;
  }

  // 生成预填 GitHub issue URL（候选 → 精选申请）
  function applyIssueUrl(c) {
    var repo = "https://github.com/manningyangs/AI-Shovel-Collection";
    var title = "🤖 申请入精选：" + (c.title || c.id);
    var hits = (c.category_hits || []).join(" / ");
    var body =
"### 候选转精选申请（Phase 2 自动发现）\n\n" +
"**自动发现来源**: " + (c.source || "unknown") + "\n\n" +
"**标题**: " + (c.title || "") + "\n\n" +
"**描述**: " + (c.desc || "—") + "\n\n" +
"**仓库/注册表**: " + (c.url || "") + "\n\n" +
"**端点**: " + (c.endpoint || "—") + "\n\n" +
"**Stars**: " + (c.stars != null ? c.stars : "未知") + "\n\n" +
"**自动建议分类**: `" + (c.suggested_category || "（请人工判断）") + "`" +
      (hits ? "（命中关键词: " + hits + "）" : "") + "\n\n" +
"**自动匹配分**: " + (c.confidence || 0) + " / 10\n\n" +
"**端点实测**: " + (c.endpoint_status === "ok" ? "✅ 验证可用" : c.endpoint_status === "auth" ? "🔑 需鉴权" : c.endpoint_status === "fail" ? "❌ 无响应（" + (c.endpoint_note || "失败") + "）" : "未实测（无远程端点）") + "\n\n" +
"---\n\n" +
"### 建议 catalog.csv 行（复制后粘贴到合适位置）\n\n" +
"```csv\n" + (c.catalog_row || c.suggested_category + "," + (c.title || "") + "," + (c.url || "")) + "\n```\n\n" +
"---\n\n" +
"请人类审核后决定：\n" +
"- ✅ 接受：把上面的 catalog.csv 行手动追加到 catalog.csv 并提 PR\n" +
"- ❌ 拒绝：在下方评论说明理由，Bot 会把此候选从 seen 中移除以便后续重新评估\n\n" +
"_本 issue 由多源 Pipeline Phase 2 自动生成。_";
    return repo + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
  }

  function renderInboxBanner() {
    var banner = document.getElementById("inboxBanner");
    if (!livePayload || !Array.isArray(livePayload.inbox) || !livePayload.inbox.length) {
      banner.classList.remove("show");
      return;
    }
    var inbox = livePayload.inbox;
    var count = inbox.length;
    var threshold = livePayload.threshold || 7;
    banner.innerHTML =
      '<span class="ib-count">✨ ' + count + ' 条高置信候选</span>' +
      '<span>满足自动匹配分 ≥ ' + threshold + ' · 每条都带建议分类 + catalog.csv 行模板</span>' +
      '<button class="btn-inbox" onclick="location.href=\'' + esc(applyIssueUrl(inbox[0])) + '\'">查看 inbox 汇总</button>' +
      '<button class="btn-inbox" onclick="openInboxAll()">批量打开申请</button>';
    banner.classList.add("show");
  }

  function openInboxAll() {
    if (!livePayload || !Array.isArray(livePayload.inbox)) return;
    livePayload.inbox.forEach(function (i) {
      try { window.open(applyIssueUrl(i), "_blank", "noopener,noreferrer"); } catch (e) {}
    });
  }

  function buildItems(rows) {
    if (rows.length && rows[0][0] && rows[0][0].indexOf("分类") !== -1) rows = rows.slice(1);
    items = rows.map(function (r) {
      var cat = (r[0] || "").trim();
      var full = (r[1] || "").trim();
      var url = (r[2] || "").trim();
      var parts = splitName(full);
      var slug = url.replace(/https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
      return {
        cat: cat,
        catLabel: cat.replace(/^\d+[A-Za-z]?\.\s*/, ""),
        title: parts.title,
        desc: parts.desc,
        url: url,
        slug: slug,
        live: null,   // 实时字段来自 live_multi.json.curated
        source: "catalog",
        hay: ""
      };
    });

    var curated = livePayload && livePayload.curated ? livePayload.curated : {};

    var seen = {};
    items.forEach(function (it) {
      // 合并多源 Pipeline 拉到的实时数据（以 repo_slug 为 key）
      var live = curated[it.slug];
      if (!live) {
        // 尝试用 id 匹配
        var idKey = "github.com/" + it.slug.toLowerCase();
        live = curated[idKey];
      }
      it.live = live || null;
      if (live) {
        it.source = live.source || "catalog";
      }
      // 建立分类统计
      if (!seen[it.cat]) seen[it.cat] = { key: it.cat, label: it.catLabel, count: 0 };
      seen[it.cat].count++;
    });
    cats = Object.keys(seen).map(function (k) { return seen[k]; });
    cats.sort(function (a, b) {
      var ka = catSortKey(a.key), kb = catSortKey(b.key);
      return ka.num - kb.num || ka.letter - kb.letter;
    });
    cats.forEach(function (c, i) { c.color = palette[i % palette.length]; });
    var colorOf = {};
    cats.forEach(function (c) { colorOf[c.key] = c.color; });

    items.forEach(function (it) {
      it.color = colorOf[it.cat] || palette[10];
      var extra = "";
      if (it.live) {
        extra = " " + (it.live.desc || "") + " " + (it.live.license || "") + " " + (it.live.lang || "") +
                " " + (it.live.source || "") + " stars" + (it.live.stars || 0) + " " +
                (it.live.endpoint || "");
      }
      it.hay = (it.title + " " + it.desc + " " + it.cat + " " + it.catLabel + " " + it.slug + " " + it.url + " " + it.source + extra).toLowerCase();
    });
  }

  /* ================= README 领域表格 ================= */

  var domainCount = 0;

  function buildDomains(md) {
    if (!md) return;
    var lines = md.split("\n");
    var inSection = false, rows = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf("## ") === 0) {
        inSection = line.indexOf("按行业/领域检索") !== -1;
        continue;
      }
      if (!inSection) continue;
      if (line.indexOf("|") !== 0) {
        if (rows.length && line === "") break;
        continue;
      }
      var cells = line.split("|");
      if (cells.length < 4) continue;
      var name = cells[1].trim(), linksCell = cells[2];
      if (!name || name === "领域" || /^-+$/.test(name)) continue;
      var links = [];
      linksCell.split("·").forEach(function (seg) {
        var m = seg.trim().match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (m) links.push({ text: m[1], url: m[2] });
      });
      if (links.length) rows.push({ name: name, links: links });
    }
    domainCount = rows.length;
    document.getElementById("domainTable").innerHTML = rows.map(function (r) {
      return '<div class="domain-row"><div class="domain-name">' + esc(r.name) +
        '</div><div class="domain-links">' +
        r.links.map(function (l) {
          return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.text) + "</a>";
        }).join("") + "</div></div>";
    }).join("") || '<div class="domain-row"><div class="domain-name">（未能解析 README 表格）</div><div class="domain-links"></div></div>';
  }

  function renderMeta(md) {
    var m = md && md.match(/本轮初始检索整理日期：([0-9-]+)/);
    if (m) document.getElementById("updated").textContent = "初始检索整理日期：" + m[1] + " · 页面随 catalog.csv 更新 · 实时数据每 6 小时同步";
  }

  function renderLiveMeta() {
    document.title = document.title + ' [LIVE]';
    // ===== P0-1 LIVE 状态动态化 =====
    var diffHours = null;
    var liveBadge = document.querySelector(".live-badge");
    var liveUpd = document.getElementById("liveUpdated");
    var legendEl = document.getElementById("statLegend");
    var liveStatus = "ok"; // ok / warn / bad
    var statusLabel = "";
    var statusHint = "";
    if (livePayload && livePayload.updated_at) {
      var ts = Date.parse(livePayload.updated_at);
      if (!isNaN(ts)) diffHours = (Date.now() - ts) / 3600000;
    }
    if (diffHours == null) {
      liveStatus = "bad";
      statusLabel = "同步中断";
      statusHint = "尚未检测到有效数据同步时间戳，请检查 GitHub Actions 运行状态";
    } else if (diffHours > 72) {
      liveStatus = "bad";
      statusLabel = "数据过期";
      statusHint = "上次同步已超过 72 小时，请检查 GitHub Actions 是否运行失败";
    } else if (diffHours > 24) {
      liveStatus = "bad";
      statusLabel = "同步延迟";
      statusHint = "上次同步已超过 24 小时，定时任务可能未按时触发";
    } else if (diffHours > 12) {
      liveStatus = "warn";
      statusLabel = "同步延迟";
      statusHint = "上次同步已超过 12 小时，略慢于 6 小时目标周期";
    } else {
      liveStatus = "ok";
      statusLabel = "LIVE";
      statusHint = "数据每 6 小时自动同步，端点实测与 Stars 来自 GitHub Actions Pipeline";
    }
    // 顶部导航 LIVE 徽章
    if (liveBadge) {
      liveBadge.className = "live-badge" + (liveStatus === "warn" ? " warn" : liveStatus === "bad" ? " bad" : "");
      liveBadge.textContent = statusLabel;
      liveBadge.title = statusHint + (diffHours != null ? " · 上次同步距今约 " + Math.round(diffHours) + " 小时" : "");
    }
    // 精选 Tab 标题行的 live-updated
    if (liveUpd) {
      liveUpd.className = "live-updated" + (liveStatus === "warn" ? " warn" : liveStatus === "bad" ? " bad" : "");
      if (livePayload && livePayload.updated_at) {
        liveUpd.textContent = "多源同步于 " + livePayload.updated_at.replace("T", " ").slice(0, 16) + " UTC";
      } else {
        liveUpd.textContent = "实时数据待首次同步";
      }
      liveUpd.title = statusHint;
    }

    // 累计 stars（来自 curated 的 GitHub REST 字段）
    var total = null;
    if (livePayload && livePayload.curated) {
      total = 0;
      Object.keys(livePayload.curated).forEach(function (k) {
        var v = livePayload.curated[k];
        if (v && typeof v.stars === "number") total += v.stars;
      });
    }
    document.getElementById("statStars").textContent = total == null ? "…" : fmtStars(total) + "+";

    // 统计口径统一：四个数字各自来源、动态计算，不写死在 HTML
    var curatedN = items.length;                                    // 目录收录（catalog.csv 行数）
    var syncedN = livePayload && livePayload.curated_count != null
      ? livePayload.curated_count
      : (livePayload && livePayload.curated ? Object.keys(livePayload.curated).length : null);
    var candN = livePayload && livePayload.candidates_count != null
      ? livePayload.candidates_count
      : (livePayload && livePayload.candidates ? livePayload.candidates.length : null);
    // 端点实测：优先从归一化后的 candidateItems 读（与卡片徽章口径一致），
    // 兜底直接从原始 livePayload.candidates 读取 extra.endpoint_status（Pipeline 写入位置）
    var okN = 0, epN = 0;
    var srcCands = (candidateItems && candidateItems.length)
      ? candidateItems
      : (livePayload && livePayload.candidates ? livePayload.candidates : []);
    srcCands.forEach(function (c) {
      if (!c || !c.endpoint) return;
      epN++;
      var st = c.endpoint_status || (c.extra && c.extra.endpoint_status) || "";
      if (st === "ok") okN++;
    });
    if (curatedN) {
      var elC = document.getElementById("statCurated");
      elC.textContent = curatedN; elC.setAttribute("data-target", curatedN);
    }
    if (syncedN != null) {
      var elS = document.getElementById("statSynced");
      if (elS) { elS.textContent = syncedN; elS.setAttribute("data-target", syncedN); }
    }
    if (candN != null) {
      var elCd = document.getElementById("statCand");
      elCd.textContent = candN; elCd.setAttribute("data-target", candN);
    }
    // statVfy 是 "108/149" 字符串，不是纯数字，不能用 data-target 动画 — 跳过
    document.getElementById("statVfy").textContent = epN ? okN + "/" + epN : "—";

    // 统计口径行：带上 LIVE 状态
    var legendTxt =
      "统计口径：<b>目录收录 " + curatedN + "</b>（catalog.csv 行数）" +
      " · <b>已同步元数据 " + (syncedN == null ? "—" : syncedN) + "</b>（live_multi.json）" +
      " · <b>候选 " + (candN == null ? "—" : candN) + "</b>" +
      " · <b>端点实测 " + (epN ? okN + "/" + epN : "—") + "</b>，四个数字口径不同，全部随数据文件动态计算。";
    if (legendEl) legendEl.innerHTML = legendTxt;
  }

  /* ================= 统计数字滚动 ================= */

  function animateStats() {
    var els = document.querySelectorAll(".stat-num[data-target]");
    els.forEach(function (el) {
      var target = parseInt(el.getAttribute("data-target"), 10);
      var start = performance.now(), dur = 900;
      function tick(now) {
        var p = Math.min((now - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + (p === 1 ? "" : "");
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      }
      requestAnimationFrame(tick);
    });
  }

  /* ================= 渲染 ================= */

  /* ================= 更新信号（⑦）：近 7 天新增/更新视图 ================= */

  var RECENT_DAYS = 7;

  function daysAgo(iso) {
    if (!iso) return Infinity;
    var t = Date.parse(iso);
    return isNaN(t) ? Infinity : (Date.now() - t) / 86400000;
  }

  // 已收录条目：7 天内有提交/发布 = "近 7 天更新"
  function isRecentCurated(it) {
    var live = it.live || {};
    return daysAgo(live.pushed_at || live.published_at) <= RECENT_DAYS;
  }

  // 候选条目：7 天内首次发布 = "近 7 天新增"（published_at 对 npm/crates 是发布时间）
  function isRecentCandidate(c) {
    return daysAgo(c.published_at || c.pushed_at) <= RECENT_DAYS;
  }

  function renderChips() {
    var recentN = items.filter(isRecentCurated).length;
    var html = '<button class="chip active" data-cat="all">全部<span class="n">' + items.length + "</span></button>" +
      '<button class="chip chip-recent" data-cat="__recent" title="最近 7 天内有提交/新发布的工具，每 6 小时同步后自动更新">🆕 近 7 天更新<span class="n">' + recentN + "</span></button>";
    html += cats.map(function (c) {
      return '<button class="chip" data-cat="' + esc(c.key) + '" title="' + esc(c.key) + '">' +
        esc(c.label) + '<span class="n">' + c.count + "</span></button>";
    }).join("");
    var chips = document.getElementById("chips");
    chips.innerHTML = html;
    chips.addEventListener("click", function (e) {
      var btn = e.target.closest(".chip");
      if (!btn) return;
      activeCat = btn.getAttribute("data-cat");
      document.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
      btn.classList.add("active");
      // 分类 chip 互斥：清掉搜索词，保证结果只按分类筛选
      if (query) {
        query = "";
        document.getElementById("searchInput").value = "";
        box.classList.remove("has-text");
        hideLiveSection();
      }
      syncTaskChips();
      render();
      // 点击分类 chip 自动滚到工具卡片区域
      document.getElementById("tools").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // 任务导向入口：按「想让 AI 做什么」跳到对应分类（前缀匹配分类编号），再点一次取消
  function catKeyByPrefix(pre) {
    for (var i = 0; i < cats.length; i++) if (cats[i].key.indexOf(pre) === 0) return cats[i].key;
    return null;
  }

  function syncTaskChips() {
    document.querySelectorAll(".task-chip").forEach(function (b) {
      var k = catKeyByPrefix(b.getAttribute("data-pre"));
      b.classList.toggle("active", k !== null && activeCat === k);
    });
  }

  function bindTaskChips() {
    document.getElementById("taskChips").addEventListener("click", function (e) {
      var btn = e.target.closest(".task-chip");
      if (!btn) return;
      var key = catKeyByPrefix(btn.getAttribute("data-pre"));
      if (!key) return;
      // 再点一次同一任务 = 取消，回到「全部」
      activeCat = (activeCat === key) ? "all" : key;
      // 任务与关键词搜索互斥，切任务时清空搜索词，保证结果与 chip 一致
      if (query) {
        query = "";
        document.getElementById("searchInput").value = "";
        hideLiveSection();
      }
      // 自动切到精选 tab 展示过滤结果
      switchTab("curated");
      document.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-cat") === activeCat);
      });
      syncTaskChips();
      render();
      document.getElementById("tools").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ================= 元数据组合筛选 ================= */

  var fState = { lang: "", minStars: 0, freshDays: 0 };

  // 语言下拉：按当前数据实际出现的语言动态生成
  function buildLangFilter() {
    var sel = document.getElementById("fLang");
    if (!sel) return;
    var counts = {};
    items.forEach(function (it) {
      var l = it.live && it.live.lang;
      if (l) counts[l] = (counts[l] || 0) + 1;
    });
    var langs = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
    // 保留首个「全部」option
    while (sel.options.length > 1) sel.remove(1);
    langs.forEach(function (l) {
      var o = document.createElement("option");
      o.value = l;
      o.textContent = l + " (" + counts[l] + ")";
      sel.appendChild(o);
    });
  }

  function markFilterActive() {
    [["fLang", fState.lang !== ""], ["fStars", fState.minStars > 0], ["fFresh", fState.freshDays > 0]]
      .forEach(function (p) {
        var el = document.getElementById(p[0]);
        if (el) el.classList.toggle("on", p[1]);
      });
  }

  function applyMetaFilters() {
    fState.lang = (document.getElementById("fLang") || {}).value || "";
    fState.minStars = parseInt((document.getElementById("fStars") || {}).value, 10) || 0;
    fState.freshDays = parseInt((document.getElementById("fFresh") || {}).value, 10) || 0;
    markFilterActive();
    render();
  }

  ["fLang", "fStars", "fFresh"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("change", applyMetaFilters);
  });

  var fResetBtn = document.getElementById("fReset");
  if (fResetBtn) {
    fResetBtn.addEventListener("click", function () {
      var l = document.getElementById("fLang"), s = document.getElementById("fStars"), f = document.getElementById("fFresh");
      if (l) l.value = ""; if (s) s.value = "0"; if (f) f.value = "0";
      applyMetaFilters();
    });
  }

  function matchesMeta(it) {
    if (fState.lang) {
      if (!it.live || it.live.lang !== fState.lang) return false;
    }
    if (fState.minStars > 0) {
      var st = it.live && it.live.stars;
      if (typeof st !== "number" || st < fState.minStars) return false;
    }
    if (fState.freshDays > 0) {
      var p = it.live && (it.live.pushed_at || it.live.published_at);
      if (!p) return false;
      if ((Date.now() - new Date(p).getTime()) / 86400000 > fState.freshDays) return false;
    }
    return true;
  }

  function matches(it) {
    if (activeCat !== "all") {
      if (activeCat === "__recent") {
        if (!isRecentCurated(it)) return false;
      } else if (it.cat !== activeCat) return false;
    }
    if (query && it.hay.indexOf(query) === -1) return false;
    if (!matchesMeta(it)) return false;
    return true;
  }

  // 活跃度徽章：基于最近提交时间的显性信号（90天内=活跃 / 1年内=转凉 / 超1年=沉寂 / 已归档）
  function actBadge(live) {
    if (!live) return "";
    if (live.status === "archived" || live.archived) return '<span class="act-badge dead" title="仓库已归档，停止维护">🪦 归档</span>';
    var iso = live.pushed_at || live.published_at;
    if (!iso) return "";
    var days = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (days < 90) return '<span class="act-badge hot" title="最近 90 天内有提交，维护活跃">● 活跃</span>';
    if (days < 365) return '<span class="act-badge mid" title="最近 90 天内无提交，仍在年内更新">● 转凉</span>';
    return '<span class="act-badge cold" title="超过 1 年未提交，可能已停止维护">● 沉寂</span>';
  }

  // 端点实测徽章：Pipeline 每 6h 对 endpoint 做一次 MCP initialize 握手
  function verifyBadge(live) {
    if (!live) return "";
    var ex = live.extra || live; // curated 走 extra 嵌套，候选为扁平字段
    var st = live.endpoint_status || ex.endpoint_status;
    if (!st) return "";
    var at = live.verified_at || ex.verified_at || "";
    var rel = at ? relTime(at) : null;
    var when = rel ? " · " + rel.text : "";
    var abs = at ? at.replace("T", " ").slice(0, 16) + " UTC" : "";
    if (st === "ok") return '<span class="vfy ok" title="MCP initialize 握手实测通过，验证于 ' + abs + '（仅验证端点在线，非功能实测）">✅ 验证可用' + when + "</span>";
    if (st === "auth") return '<span class="vfy auth" title="端点存活但需要 API Key（HTTP 401/403），填密钥即可用 · 验证于 ' + abs + '">🔑 需鉴权' + when + "</span>";
    var note = live.endpoint_note || ex.endpoint_note || "";
    return '<span class="vfy fail" title="' + esc(note || "连接失败或超时") + ' · 验证于 ' + abs + '">❌ 端点无响应' + when + "</span>";
  }

  // liveRow 统一：接受 Entry 风格对象（curated 来自 Pipeline、GitHub 全站实时搜索来自 Search API）
  function liveRow(live) {
    if (!live) return "";
    var bits = [];
    var vfy = verifyBadge(live);
    if (vfy) bits.push(vfy);
    var act = actBadge(live);
    if (act) bits.push(act);
    if (typeof live.stars === "number") bits.push('<span class="stars">★ ' + fmtStars(live.stars) + "</span>");
    if (typeof live.downloads === "number" && live.downloads > 0) bits.push('<span class="fresh ok">↧ ' + fmtStars(live.downloads) + "/wk</span>");
    var rel = relTime(live.pushed_at || live.published_at);
    if (rel) bits.push('<span class="fresh ' + rel.cls + '">' + rel.text + "</span>");
    if (live.lang) bits.push('<span class="lang-pill">' + esc(live.lang) + "</span>");
    if (!bits.length) return "";
    return '<div class="card-live">' + bits.join("") + "</div>";
  }

  function sourceBadge(src) {
    if (!src || src === "catalog") return "";
    var label = SOURCE_LABEL[src] || src;
    return '<span class="source-badge src-' + esc(src) + '" title="数据来源：' + esc(label) + '">' + esc(label) + "</span>";
  }

  function epPill(ep) {
    if (!ep) return "";
    return '<div class="ep-pill" title="MCP Server 端点 · 点击复制" onclick="navigator.clipboard.writeText(this.textContent)">📡 ' + esc(ep) + "</div>";
  }

  /* ================= 配置块弹窗 ================= */

  var cfgStore = []; // 渲染时收集条目 payload，卡片按钮用 data-cfg 索引引用
  var drawerStore = []; // 渲染时收集条目用于详情抽屉

  function cfgPayload(o) {
    var slug = o.repo_slug || o.slug || String(o.id || "").replace("github.com/", "");
    // P0-2：同时读取顶层 + extra 嵌套（curated 走 extra，candidates 走扁平）
    var ex = o.extra || {};
    var endpoint_status = o.endpoint_status || ex.endpoint_status || "";
    var verified_at = o.verified_at || ex.verified_at || "";
    return {
      title: o.title || slug,
      endpoint: o.endpoint || null,
      pkg: (slug.split("/").pop() || o.title || "server").toLowerCase(),
      lang: o.lang || "",
      headers: o.headers_req || null,
      // P0-2 新增：端点验证状态 + 来源 + 端点实测时间，用于区分已验证 vs 自动推断
      endpoint_status: endpoint_status,
      verified_at: verified_at,
      source: o.source || "" // "catalog" 或候选来源
    };
  }

  // 生成三端配置片段：endpoint 型 → HTTP（有 headers 为已验证配置，无 headers 为参考配置）；无 endpoint → stdio（npx/uvx 推断）
  function cfgSnippets(p) {
    var name = p.pkg;
    var remote = p.endpoint;
    var authHeaders = p.headers && p.headers.length ? p.headers[0] : null;
    var out = [];

    if (remote) {
      // HTTP 型：MCP streamable-http 传输
      var baseServer = { type: "http", url: remote };
      if (authHeaders) baseServer.headers = authHeaders;
      out.push({
        label: "Claude Desktop / Claude Code" + (authHeaders ? " ✅" : " 参考"),
        path: "claude_desktop_config.json",
        code: JSON.stringify({ mcpServers: { [name]: baseServer } }, null, 2)
      });
      out.push({
        label: "Cursor / Windsurf / 通用 (mcp.json)" + (authHeaders ? " ✅" : " 参考"),
        path: ".cursor/mcp.json",
        code: JSON.stringify({ mcpServers: { [name]: Object.assign({ url: remote }, authHeaders ? { headers: authHeaders } : {}) } }, null, 2)
      });
      out.push({
        label: "VS Code (Agent 模式)" + (authHeaders ? " ✅" : " 参考"),
        path: ".vscode/mcp.json",
        code: JSON.stringify({ servers: { [name]: Object.assign({ type: "http", url: remote }, authHeaders ? { headers: authHeaders } : {}) } }, null, 2)
      });
      return out;
    }

    // stdio：按语言推断启动器
    var launcher = p.lang === "Python" ? "uvx" : "npx";
    var args = launcher === "uvx" ? [p.pkg] : ["-y", p.pkg];
    var stdio = { command: launcher, args: args };
    out.push({
      label: "Claude Desktop / Claude Code",
      path: "claude_desktop_config.json",
      code: JSON.stringify({ mcpServers: { [name]: stdio } }, null, 2)
    });
    out.push({
      label: "Cursor / Windsurf / 通用 (mcp.json)",
      path: ".cursor/mcp.json",
      code: JSON.stringify({ mcpServers: { [name]: stdio } }, null, 2)
    });
    out.push({
      label: "VS Code (Agent 模式)",
      path: ".vscode/mcp.json",
      code: JSON.stringify({ servers: { [name]: stdio } }, null, 2)
    });
    return out;
  }

  function openCfg(idx) {
    var p = cfgStore[idx];
    if (!p) return;
    var mask = document.getElementById("cfgMask");
    var body = document.getElementById("cfgBody");
    var head = document.getElementById("cfgTitle");
    // P0-2 三档：ok / auth·fail / auto-infer
    var verifStatus = p.endpoint_status || "";
    var isCurated = p.source === "catalog";
    var tier = "auto";              // ok / auth / fail / auto
    var warnClass = "cfg-warn";
    var warnTxt = "";
    if (p.endpoint) {
      // 有端点
      if (verifStatus === "ok") {
        tier = "ok";
        warnClass = "cfg-warn ok";
        warnTxt = "✅ <b>已验证配置</b> — 该端点经 Pipeline 每 6 小时 MCP initialize 握手实测通过，可直接粘贴使用。";
      } else if (verifStatus === "auth") {
        tier = "auth";
        warnClass = "cfg-warn";
        warnTxt = "🔑 <b>端点需鉴权</b> — Pipeline 实测端点在线但返回 401/403，请在下面配置的 <code>headers</code> 字段填入 API Key。<br><small style='color:var(--text-3)'>⚠️ MCP 未强制鉴权方案：常见为 <code>Authorization: Bearer YOUR_KEY</code>，也可能是 API Key 头或自定义 Cookie。请查阅项目 README 确认真实鉴权方式。</small>";
      } else if (verifStatus === "fail") {
        tier = "fail";
        warnClass = "cfg-warn danger";
        warnTxt = "❌ <b>端点无响应</b> — Pipeline 实测该端点连接失败或超时，以下配置仅供参考，请自行确认端点是否已下线。";
      } else {
        // 有端点但尚未实测（Pipeline 新条目）
        tier = "auth";
        warnClass = "cfg-warn";
        warnTxt = "⚠️ <b>端点未实测</b> — 本条目有登记远程端点但尚未被 Pipeline 实测，请粘贴后自行验证是否可用。";
      }
    } else {
      // 无端点 → 自动推断启动命令
      tier = "auto";
      warnClass = "cfg-warn danger";
      warnTxt = "⚠️ <b>配置自动推断，非实测</b> — 本条目没有登记远程 MCP 端点，下面的 <code>" +
        (p.lang === "Python" ? "uvx" : "npx") + " " + esc(p.pkg) +
        "</code> 是根据仓库名和语言自动推断的，<b>请务必核对项目 README 确认真实包名、启动命令和是否支持 MCP 协议</b>。CLI 工具、Agent Skill、工作流编排项目可能完全不能作为 MCP Server 直接配置。";
      if (!isCurated) {
        warnTxt += "<br>🤖 此条目来自自动发现，尚未人工核验其是否支持 MCP 协议。";
      }
    }
    if (p.headers && p.headers.length) {
      warnTxt += "<br>📋 登记信息提示：" + esc(String(p.headers[0]).slice(0, 160));
    }
    // 更新弹窗标题
    if (head) {
      if (tier === "ok") head.textContent = "✅ 已验证配置";
      else if (tier === "auth") head.textContent = "🔑 端点需鉴权";
      else if (tier === "fail") head.textContent = "❌ 端点无响应";
      else head.textContent = "⚠️ 自动推断配置（请核对 README）";
    }
    var html = '<div class="' + warnClass + '">' + warnTxt + "</div>";
    cfgSnippets(p).forEach(function (s, i) {
      html += '<div class="cfg-sec">' +
        '<div class="cfg-label"><span>' + esc(s.label) + "</span>" +
        '<button class="cfg-copy" data-code="' + i + '">复制 JSON</button></div>' +
        '<div class="cfg-path">' + esc(s.path) + "</div>" +
        '<pre class="cfg-code" data-idx="' + i + '">' + esc(s.code) + "</pre>" +
        "</div>";
    });
    body.innerHTML = html;
    body._codes = cfgSnippets(p).map(function (s) { return s.code; });
    mask.classList.add("show");
    document.getElementById("cfgClose").focus();
  }

  function closeCfg() {
    document.getElementById("cfgMask").classList.remove("show");
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-cfg");
    if (btn) {
      var i = parseInt(btn.getAttribute("data-cfg"), 10);
      if (!isNaN(i)) openCfg(i);
      return;
    }
    if (e.target.closest("#cfgClose")) { closeCfg(); return; }
    if (e.target.id === "cfgMask") closeCfg();
    var cp = e.target.closest(".cfg-copy");
    if (cp) {
      var body = document.getElementById("cfgBody");
      var code = (body._codes || [])[parseInt(cp.getAttribute("data-code"), 10)];
      if (!code) return;
      function flash(txt, ok) {
        cp.textContent = txt;
        cp.classList.toggle("ok", !!ok);
        setTimeout(function () { cp.textContent = "复制 JSON"; cp.classList.remove("ok"); }, 1600);
      }
      var done = function () { flash("✓ 已复制", true); };
      var fail = function () {
        // clipboard 被拒（焦点/非可信手势）→ 降级：选中代码块让用户手动 Ctrl+C
        try {
          var pre = body.querySelector('.cfg-code[data-idx="' + cp.getAttribute("data-code") + '"]');
          if (pre) {
            var r = document.createRange();
            r.selectNodeContents(pre);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
          }
        } catch (ignore) {}
        flash("已选中，Ctrl+C 复制", false);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, fail);
      } else {
        fail();
      }
      return;
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeCfg();
  });

  function applySort(list) {
    var arr = list.slice();
    if (sortMode === "stars") {
      arr.sort(function (a, b) {
        var sa = (a.live && a.live.stars) || 0;
        var sb = (b.live && b.live.stars) || 0;
        return sb - sa;
      });
    } else if (sortMode === "recent") {
      arr.sort(function (a, b) {
        var ta = (a.live && a.live.pushed_at) || "";
        var tb = (b.live && b.live.pushed_at) || "";
        return tb.localeCompare(ta);
      });
    } else if (sortMode === "verified") {
      arr.sort(function (a, b) {
        // P0-4 真正的核验程度排序：端点实测 ok > 有 live 数据 > 无 live 数据
        function vScore(x) {
          var live = x.live || x || {};
          var st = live.endpoint_status || (live.extra && live.extra.endpoint_status) || "";
          var hasLive = !!(x.live || x.source);
          var isCurated = x.source === "catalog";
          if (st === "ok") return 3;
          if (isCurated && hasLive) return 2;
          if (hasLive) return 1;
          return 0;
        }
        return vScore(b) - vScore(a);
      });
    }
    return arr;
  }

  var firstRenderSkipped = false; // Astro 预渲染卡片已在 HTML 中，首次默认态跳过 innerHTML

  function render() {
    var raw = items.filter(matches);
    var list = applySort(raw);
    var grid = document.getElementById("grid");
    var empty = document.getElementById("empty");
    var countEl = document.getElementById("count");
    cfgStore = []; // 每轮渲染重建配置弹窗索引

    // Astro 预渲染：首次默认态跳过 innerHTML 重写，保留构建时已渲染的 193 张卡片
    var metaOn = fState.lang || fState.minStars > 0 || fState.freshDays > 0;
    var isDefaultState = activeTab === "curated" && !query && !metaOn && sortMode === "default";
    if (grid && grid.dataset.pre === "1" && !firstRenderSkipped && isDefaultState) {
      firstRenderSkipped = true;
      // 只更新统计数字 + 新鲜度标签，保留预渲染卡片 HTML
      countEl.textContent = items.length + " 条";
      countEl.classList.remove("hit");
      var hc1 = document.getElementById("heroCount"); if (hc1) hc1.textContent = items.length;
      document.getElementById("tabCuratedCount").textContent = items.length;
      empty.style.display = "none";
      // 绑定预渲染卡片上的 drawer/cfg 事件委托
      bindPreRenderCardEvents();
      renderCandidates();
      return;
    }

    grid.innerHTML = list.map(function (it) {
      var live = it.live || {};
      var ep = live.endpoint || (live.remotes && live.remotes[0] && live.remotes[0].url);
      var titleUrl = live.repo_url || live.registry_url || it.url;
      var drawIdx = drawerStore.push({ kind: "curated", item: it, live: live }) - 1;
      return '<article class="card">' +
        '<div class="card-top">' +
          '<div class="card-title"><a href="' + esc(titleUrl) + '" target="_blank" rel="noopener">' +
            highlight(it.title, query) + "</a></div>" +
          '<span class="badge" style="--badge-bg:' + it.color[0] + ";--badge-fg:" + it.color[1] + ";--badge-bd:" + it.color[2] + '" title="' + esc(it.cat) + '">' +
            highlight(it.catLabel, query) + "</span>" +
        "</div>" +
        (it.desc ? '<div class="card-desc">' + highlight(it.desc, query) + "</div>" : "") +
        epPill(ep) +
        liveRow(live) +
        sourceBadge(it.source) +
        '<div class="card-foot"><span class="card-repo">' + highlight((live.repo_slug || it.slug), query) + "</span>" +
          '<span><button class="btn-detail" data-draw="' + drawIdx + '" type="button" title="查看详情">详情</button>' +
          '<button class="btn-cfg" data-cfg="' + (cfgStore.push(cfgPayload(Object.assign({ title: it.title }, live))) - 1) + '" title="生成 Claude Desktop / Cursor / VS Code 配置片段">📋 配置</button>' +
          '<a class="ext" href="' + esc(it.url) + '" target="_blank" rel="noopener">GitHub ↗</a></span></div>' +
      "</article>";
    }).join("");

    if (!list.length) {
      empty.style.display = "block";
      empty.innerHTML = "本地目录没有匹配 <b>" + esc(query || activeCat) + "</b> 的工具 —— 试试切换到「自动发现」Tab 或「GitHub 实时搜索」Tab？";
    } else {
      empty.style.display = "none";
    }

    if (list.length === items.length && !query && !metaOn && sortMode === "default") {
      countEl.textContent = items.length + " 条";
      countEl.classList.remove("hit");
    } else {
      countEl.textContent = list.length === 0 ? "无结果" : "找到 " + list.length + " 条";
      countEl.classList.toggle("hit", list.length > 0);
    }
    document.getElementById("tabCuratedCount").textContent = items.length;
    var hc2 = document.getElementById("heroCount"); if (hc2) hc2.textContent = items.length;

    renderCandidates();
  }

  // Astro 预渲染卡片事件委托：填新鲜度时间戳 + 绑定任何卡片内事件
  function bindPreRenderCardEvents() {
    var freshEls = document.querySelectorAll('.grid[data-pre="1"] .fresh[data-pushed]');
    freshEls.forEach(function (el) {
      var pushed = el.getAttribute("data-pushed");
      var rt = relTime(pushed);
      if (rt) { el.textContent = rt.text; el.className = "fresh " + rt.cls; }
    });
    // liveUpdated 时间戳
    var lu = document.getElementById("liveUpdated");
    if (lu && livePayload && livePayload.updated_at) {
      lu.textContent = "最后同步：" + new Date(livePayload.updated_at).toLocaleString("zh-CN");
    }
  }

  // 候选区块渲染（独立，不受分类 chip 影响，但受搜索词过滤）
  function renderCandidates() {
    renderInboxBanner();
    var section = document.getElementById("candidates");
    var grid = document.getElementById("candidateGrid");
    var raw = candidateItems;
    if (query) raw = raw.filter(function (c) { return c.hay.indexOf(query) !== -1; });
    var list = applySort(raw);
    if (!candidateItems.length) {
      section.style.display = "none";
      return;
    }
    section.style.display = "";
    document.getElementById("tabCandidateCount").textContent = candidateItems.length;
    grid.innerHTML = list.map(function (c) {
      var titleUrl = c.url || "#";
      var catBadge = c.suggested_category && c.isInbox
        ? '<span class="cat-badge" title="自动建议分类">' + esc(c.suggested_category.split(". ", 2)[0]) + "</span>"
        : "";
      var confBadge = c.confidence
        ? '<span class="conf-badge" title="自动匹配分：Pipeline 根据 MCP 官方注册、Stars、下载量、端点实测等加权得出，不是工具质量评分">' + c.confidence + "/10</span>"
        : "";
      var applyBtn = c.repo_url || c.registry_url
        ? '<a class="btn-apply" href="' + applyIssueUrl(c) + '" target="_blank" rel="noopener">🔍 申请入精选</a>'
        : "";
      var inBoxTag = c.isInbox
        ? '<span class="unverified-tag" style="background:#0d7a43;color:#fff">✨ Inbox</span>'
        : "";
      var newTag = isRecentCandidate(c)
        ? '<span class="vfy new" title="7 天内首次发布的工具（每 6 小时同步）">🆕 新增</span>'
        : "";
      var drawIdx = drawerStore.push({ kind: "candidate", item: c, live: c }) - 1;
      return '<article class="card unverified">' +
        '<div class="card-top">' +
          '<div class="card-title"><a href="' + esc(titleUrl) + '" target="_blank" rel="noopener">' +
            highlight(c.title, query) + inBoxTag + newTag + "</a></div>" +
          sourceBadge(c.source) +
        "</div>" +
        (c.desc ? '<div class="card-desc">' + highlight(c.desc, query) + "</div>" : "") +
        epPill(c.endpoint) +
        liveRow(c) +
        '<div style="margin-top:6px">' + catBadge + confBadge + "</div>" +
        '<div class="card-foot">' +
          '<span class="card-repo">' + highlight((c.slug || c.id), query) + "</span>" +
          '<span><button class="btn-detail" data-draw="' + drawIdx + '" type="button" title="查看详情">详情</button>' +
          '<button class="btn-cfg" data-cfg="' + (cfgStore.push(cfgPayload(c)) - 1) + '" title="生成 Claude Desktop / Cursor / VS Code 配置片段">📋 配置</button>' +
          applyBtn + (c.registry_url ? '<a class="ext" href="' + esc(c.registry_url) + '" target="_blank" rel="noopener" style="margin-left:6px">来源 ↗</a>' : "") + "</span>" +
        "</div>" +
      "</article>";
    }).join("");
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="display:block">没有匹配的候选自动发现条目</div>';
    }
  }

  /* ================= GitHub 全站实时搜索 ================= */

  function hideLiveSection() {
    // liveSection 已废弃，改为 liveTab — 此函数保留兼容
    liveResults = [];
    liveFetchedFor = "";
    var g = document.getElementById("liveGrid2");
    if (g) g.innerHTML = "";
  }

  function renderLive(list, total) {
    var grid = document.getElementById("liveGrid2");
    grid.innerHTML = list.map(function (r) {
      var lang = r.language ? '<span class="lang-pill">' + esc(r.language) + "</span>" : "";
      var drawIdx = drawerStore.push({
        kind: "gh",
        gh: r
      }) - 1;
      return '<article class="card">' +
        '<div class="card-top">' +
          '<div class="card-title"><a href="' + esc(r.html_url) + '" target="_blank" rel="noopener">' +
            highlight(r.full_name, query) + "</a></div>" +
          '<span class="badge" style="--badge-bg:#fff3e0;--badge-fg:#d97706;--badge-bd:#fbc66f">★ ' +
            esc(fmtStars(r.stargazers_count)) + "</span>" +
        "</div>" +
        (r.description ? '<div class="card-desc">' + highlight(String(r.description).slice(0, 220), query) + "</div>" : "") +
        '<div class="card-live">' +
          (r.archived ? '<span class="archived">已归档</span>' : "") +
          '<span class="fresh ' + (relTime(r.pushed_at) || {}).cls + '">' + ((relTime(r.pushed_at) || {}).text || "") + "</span>" +
          lang +
        "</div>" +
        '<div class="card-foot"><span class="card-repo">' + esc(r.full_name) + "</span>" +
          '<span><button class="btn-detail" data-draw="' + drawIdx + '" type="button" title="查看详情">详情</button>' +
          '<a class="ext" href="' + esc(r.html_url) + '" target="_blank" rel="noopener">GitHub ↗</a></span></div>' +
      "</article>";
    }).join("");
  }

  function runLiveSearch(auto) {
    var q = query;
    if (!q || q.length < 2) return;
    if (activeTab !== "live") switchTab("live");
    if (liveFetchedFor === q && liveResults.length) {
      renderLive(liveResults, 0);
      return;
    }
    var btn = document.getElementById("btnLive");
    var status = document.getElementById("liveStatus");
    btn.disabled = true;
    status.textContent = "正在请求 GitHub Search API…";

    if (liveAbort) liveAbort.abort();
    liveAbort = new AbortController();

    var seen = {};
    items.forEach(function (it) { seen[it.slug.toLowerCase()] = true; });

    fetch("https://api.github.com/search/repositories?q=" + encodeURIComponent(q) +
          "&sort=stars&order=desc&per_page=30", {
      signal: liveAbort.signal,
      headers: { "Accept": "application/vnd.github+json" }
    }).then(function (r) {
      if (r.status === 403 || r.status === 429) {
        throw new Error("GitHub 免费搜索限流（每分钟 10 次），请稍等片刻再试");
      }
      if (!r.ok) throw new Error("GitHub API " + r.status);
      return r.json();
    }).then(function (data) {
      var repos = (data.items || []).filter(function (r) {
        return !seen[String(r.full_name).toLowerCase()];
      }).slice(0, 18);
      liveResults = repos;
      liveFetchedFor = q;
      btn.disabled = false;
      if (!repos.length) {
        status.textContent = "GitHub 全站也没有更多未收录的匹配结果";
        return;
      }
      status.textContent = "共 " + (data.total_count > 1000 ? "1000+" : data.total_count) + " 条，展示前 " + repos.length + " 条";
      renderLive(repos, data.total_count);
    }).catch(function (err) {
      if (err.name === "AbortError") return;
      btn.disabled = false;
      status.textContent = err.message;
    });
  }

  document.getElementById("btnLive").addEventListener("click", function () { runLiveSearch(false); });

  /* ================= 搜索交互 ================= */

  var input = document.getElementById("searchInput");
  var box = document.getElementById("searchBox");
  var debounceTimer = null;

  input.addEventListener("input", function () {
    query = input.value.trim().toLowerCase();
    box.classList.toggle("has-text", !!query);
    // 搜索互斥：清掉分类筛选，保证结果只按关键词匹配
    if (activeCat !== "all") {
      activeCat = "all";
      document.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-cat") === "all");
      });
      syncTaskChips();
    }
    // 有搜索词时自动切到精选 tab 展示过滤结果
    if (query && activeTab !== "curated") switchTab("curated");
    render();
    // 搜索有结果才自动滚到工具卡片区域；0 结果时保持当前页面位置
    // 用 "auto"（无动画）避免逐字输入时多次 smooth scroll 互相打断导致"看起来没跳"
    if (query) {
      var hit = items.filter(matches).length;
      if (hit > 0) document.getElementById("tools").scrollIntoView({ behavior: "auto", block: "start" });
    }
    // 停顿 700ms 后：若本地过滤 0 结果，自动触发 GitHub 全站实时搜索（防抖保护限流额度）
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      if (!query || query.length < 2) return;
      if (items.filter(matches).length === 0) runLiveSearch(true);
    }, 700);
  });

  document.getElementById("clearBtn").addEventListener("click", function () {
    input.value = ""; query = "";
    box.classList.remove("has-text");
    input.focus();
    hideLiveSection();
    // 防御：清空搜索后 activeCat 已是 "all"，确保 chip 视觉状态同步
    syncTaskChips();
    render();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === "Escape" && document.activeElement === input && input.value) {
      input.value = ""; query = "";
      box.classList.remove("has-text");
      hideLiveSection();
      syncTaskChips();
      render();
    }
  });

  // ---- 滚动紧凑化：超过 120px toolbar 紧凑，超过 260px chips 收起 ----
  //      如果用户手动 force-expand，滚动不再自动折叠 chips
  var toolbar = document.querySelector(".toolbar");
  var chips = document.querySelector(".chips");
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      // toolbar 紧凑化（padding 变小），chips 折叠只由手动按钮控制
      toolbar.classList.toggle("compact", y > 120);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---- 分类筛选 chips 手动展开/收起（按钮 toggle，不再跟滚动绑定）----
  var btnChips = document.getElementById("btnToggleChips");
  if (btnChips && chips) {
    function syncBtnText() {
      var collapsed = chips.classList.contains("chips-collapsed");
      btnChips.textContent = (collapsed ? '📂 分类展示' : '🏷️ 分类折叠');
    }
    syncBtnText();
    btnChips.addEventListener("click", function () {
      var nowCollapsed = !chips.classList.contains("chips-collapsed");
      chips.classList.toggle("chips-collapsed", nowCollapsed);
      btnChips.classList.toggle("active", nowCollapsed);
      btnChips.setAttribute("aria-expanded", String(!nowCollapsed));
      syncBtnText();
    });
  }

  // ---- P1-2: 统计卡可折叠（类似 chips 折叠模式）----
  var statsWrap = document.getElementById("statsGridWrap");
  var btnStats = document.getElementById("btnToggleStats");
  if (statsWrap && btnStats) {
    var STORAGE_STATS = "ai-shovels:stats-collapsed";
    // 读取持久化偏好
    var savedStatsCollapsed = localStorage.getItem(STORAGE_STATS) === "1";
    function syncStatsBtn() {
      var collapsed = statsWrap.classList.contains("collapsed");
      btnStats.textContent = collapsed ? "+ 展开统计数字" : "— 收起统计数字";
      btnStats.setAttribute("aria-expanded", String(!collapsed));
    }
    if (savedStatsCollapsed) {
      statsWrap.classList.add("collapsed");
      syncStatsBtn();
    }
    btnStats.addEventListener("click", function () {
      var nowCollapsed = !statsWrap.classList.contains("collapsed");
      statsWrap.classList.toggle("collapsed", nowCollapsed);
      localStorage.setItem(STORAGE_STATS, nowCollapsed ? "1" : "0");
      syncStatsBtn();
    });
  }

  bindTaskChips();
  load();
  // 初始状态：只显示 curated tab
  switchTab("curated");

  /* ================= Tab 切换 ================= */
  function switchTab(name) {
    activeTab = name;
    var tabs = document.querySelectorAll(".list-tab");
    var panels = document.querySelectorAll("[data-tabpanel]");
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-tab") === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    panels.forEach(function (p) {
      p.style.display = p.getAttribute("data-tabpanel") === name ? "" : "none";
    });
    // 切到 candidates tab 时触发渲染（renderCandidates 依赖 candidateItems 已由 load/buildCandidates 初始化）
    if (name === "candidates") {
      renderCandidates();
    }
    // 切换到 liveTab 且有搜索词时自动搜索
    if (name === "live" && query.length >= 2 && liveFetchedFor !== query) {
      runLiveSearch(true);
    }
  }
  document.addEventListener("click", function (e) {
    var tab = e.target.closest(".list-tab");
    if (tab) {
      switchTab(tab.getAttribute("data-tab"));
      e.preventDefault();
    }
  });

  /* ================= 排序 ================= */
  var sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      sortMode = sortSelect.value;
      // 重置 drawerStore + cfgStore 避免索引越界
      drawerStore = [];
      cfgStore = [];
      if (activeTab === "curated") render();
      else if (activeTab === "candidates") renderCandidates();
    });
  }

  /* ================= 搜索示例 chips：走分类过滤（和下方 task chip 同一路径） ================= */
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".se-chip");
    if (!chip) return;
    var pre = chip.getAttribute("data-pre");
    var q = chip.getAttribute("data-q");
    if (pre) {
      // 优先走分类过滤路径（和下方 10 个 task-chip 联动）
      var key = catKeyByPrefix(pre);
      if (!key) return;
      // 再点一次同一分类 = 取消，回到「全部」
      activeCat = (activeCat === key) ? "all" : key;
      // 清空搜索词：示例 chips 不再往搜索框写硬编码关键词（避免"PPT"之类搜不到 0 结果）
      query = "";
      input.value = "";
      box.classList.remove("has-text");
      hideLiveSection();
      switchTab("curated");
      document.querySelectorAll(".chip").forEach(function (c) {
        c.classList.toggle("active", c.getAttribute("data-cat") === activeCat);
      });
      syncTaskChips();
      render();
      document.getElementById("tools").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // 兜底：没有 data-pre 时仍按关键词走
      input.value = q;
      query = q.toLowerCase();
      box.classList.add("has-text");
      switchTab("curated");
      render();
      input.focus();
    }
    e.preventDefault();
  });

  /* ================= 详情抽屉 ================= */
  function openDrawer(idx) {
    var data = drawerStore[idx];
    if (!data) return;
    var mask = document.getElementById("drawerMask");
    var drawer = document.getElementById("drawer");
    var title = document.getElementById("drawerTitle");
    var sub = document.getElementById("drawerSub");
    var body = document.getElementById("drawerBody");
    var actions = document.getElementById("drawerActions");

    var item = data.item || data.gh || {};
    var live = data.live || {};
    var gh = data.gh || {};

    // 标题 + 副标题
    title.textContent = item.title || gh.full_name || "—";
    var desc = item.desc || gh.description || "";
    sub.textContent = desc ? desc.slice(0, 120) + (desc.length > 120 ? "…" : "") : "";

    // 构造"它能做什么"列表（从分类+描述推断）
    var doList = [];
    if (item.cat) doList.push("属于「" + item.catLabel + "」分类的 AI 工具");
    if (gh.language) doList.push("主要语言：" + gh.language);
    if (gh.stargazers_count != null) doList.push("GitHub Stars：" + gh.stargazers_count + "，社区关注度" + (gh.stargazers_count >= 1000 ? "高" : gh.stargazers_count >= 100 ? "中" : "基础"));
    if (gh.archived) doList.push("⚠️ 该仓库已标记归档，可能不再维护");
    var days = gh.pushed_at ? Math.floor((Date.now() - new Date(gh.pushed_at).getTime()) / 86400000) : null;
    if (days != null && days >= 0 && !gh.archived) {
      if (days < 30) doList.push("近 " + days + " 天内有更新，活跃维护中");
      else if (days < 180) doList.push("最近更新于 " + days + " 天前");
      else doList.push("最近更新于 " + days + " 天前，维护节奏较慢");
    }

    // 基本信息
    var infoHtml = "";
    if (item.cat || data.catLabel) infoHtml += "<dt>分类</dt><dd>" + esc(item.catLabel || item.cat) + "</dd>";
    if (live.source && data.kind !== "gh") infoHtml += "<dt>数据来源</dt><dd>" + (SOURCE_LABEL[live.source] || live.source) + "</dd>";
    if (item.endpoint || live.endpoint) infoHtml += "<dt>远程端点</dt><dd style='word-break:break-all'>" + esc(item.endpoint || live.endpoint) + "</dd>";
    if (live.license || gh.license) infoHtml += "<dt>许可证</dt><dd>" + esc((live.license || gh.license || {}).spdx_id || live.license || "") + "</dd>";
    if (live.lang || gh.language) infoHtml += "<dt>语言</dt><dd>" + esc(live.lang || gh.language) + "</dd>";
    if (live.stars != null || gh.stargazers_count != null) infoHtml += "<dt>Stars</dt><dd>★ " + esc(fmtStars(live.stars != null ? live.stars : gh.stargazers_count)) + "</dd>";

    // ===== P1-1 新增：部署方式 / API Key 提示（基于现有字段推断，不动 Pipeline） =====
    var deployHtml = "";
    var ep = live.endpoint || item.endpoint;
    var epSt = live.endpoint_status || (live.extra && live.extra.endpoint_status) || item.endpoint_status || "";
    var lang = live.lang || gh.language || item.lang || "";
    var hasLiveData = !!(live.stars || live.pushed_at || ep || live.license || live.source);
    // 部署方式
    if (ep) {
      deployHtml += "<dt>部署方式</dt><dd>🖥️ 远程端点（免安装，粘贴配置即用）</dd>";
    } else if (lang === "Python") {
      deployHtml += "<dt>部署方式</dt><dd>💻 本地（uvx / uv） — 无远程端点，需在本机运行</dd>";
    } else if (lang) {
      deployHtml += "<dt>部署方式</dt><dd>💻 本地（按 README，通常 npx）</dd>";
    } else if (item.url) {
      deployHtml += "<dt>部署方式</dt><dd>💻 本地（请查看项目 README）</dd>";
    }
    // 端点实测状态（从配置推断）
    if (ep && epSt) {
      var vfyText = "";
      if (epSt === "ok") vfyText = "✅ 端点可访问（MCP initialize 握手通过，Pipeline 每 6 小时重测）";
      else if (epSt === "auth") vfyText = "🔑 端点在线但需要 API Key（返回 401/403），配置中需补 headers";
      else if (epSt === "fail") vfyText = "❌ 端点实测失败（连接超时或无响应），请自行确认端点是否已下线";
      if (vfyText) deployHtml += "<dt>端点实测</dt><dd>" + vfyText + "</dd>";
    } else if (ep && !epSt) {
      deployHtml += "<dt>端点实测</dt><dd>⚠️ 有登记端点但尚未被 Pipeline 实测</dd>";
    }
    // API Key 提示
    if (epSt === "auth") {
      deployHtml += "<dt>是否需要 API Key</dt><dd>🔑 是 — Pipeline 实测返回 401/403，请在配置 headers 中填入密钥</dd>";
    } else if (ep && epSt === "ok") {
      deployHtml += "<dt>是否需要 API Key</dt><dd>✅ 当前端点无需 Key（Pipeline 实测通过），但端点服务端可能在后续版本加鉴权</dd>";
    } else if (!ep) {
      deployHtml += "<dt>是否需要 API Key</dt><dd>📋 视项目而定 — 本地 stdio 启动通常不需要，但项目 README 可能有额外要求</dd>";
    }
    // 许可证
    if (live.license || gh.license) {
      var spdx = (live.license || gh.license || {}).spdx_id || live.license || "";
      if (spdx) deployHtml += "<dt>开源许可证</dt><dd>📄 " + esc(spdx) + "</dd>";
    }

    var html = "";
    if (doList.length) {
      html += '<div class="drawer-section"><h4>它能做什么</h4><ul class="drawer-do">';
      doList.forEach(function (t) { html += "<li>" + esc(t) + "</li>"; });
      html += "</ul></div>";
    }
    if (infoHtml) {
      html += '<div class="drawer-section"><h4>基本信息</h4><dl class="drawer-info">' + infoHtml + "</dl></div>";
    }
    // 新增"部署与使用"section（GitHub 实时搜索条目无 live 数据，不显示）
    if (deployHtml && data.kind !== "gh") {
      html += '<div class="drawer-section"><h4>部署与使用提示</h4><dl class="drawer-info">' + deployHtml + "</dl></div>";
    }
    if (data.kind === "candidate") {
      html += '<div class="drawer-section"><h4>核验状态</h4><p style="font-size:13px;color:var(--text-2)">此条目由 Pipeline 自动发现，<b>未经过人工核验</b>。自动匹配分 ' + esc(item.confidence || "") + '/10 代表算法推断的可信度（综合 MCP 官方注册、Stars、下载量、端点实测等加权），<b>不是工具质量评分</b>。</p></div>';
    }
    body.innerHTML = html || '<p style="color:var(--text-3);font-size:13px">暂无更多信息</p>';

    // 底部操作按钮
    var repoUrl = live.repo_url || item.url || gh.html_url || item.registry_url || "#";
    var cfgIdx = cfgStore.push(cfgPayload(Object.assign({ title: item.title || gh.full_name || "" }, live))) - 1;
    actions.innerHTML =
      '<a class="btn-gh" href="' + esc(repoUrl) + '" target="_blank" rel="noopener">🐙 查看 GitHub ↗</a>' +
      (data.kind === "gh" ? "" :
        '<button class="btn-cfg" data-cfg="' + cfgIdx + '" type="button">📋 复制配置</button>');

    mask.classList.add("show");
    drawer.classList.add("show");
    document.getElementById("drawerClose").focus();
  }

  function closeDrawer() {
    document.getElementById("drawerMask").classList.remove("show");
    document.getElementById("drawer").classList.remove("show");
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-detail");
    if (btn) {
      var i = parseInt(btn.getAttribute("data-draw"), 10);
      if (!isNaN(i)) openDrawer(i);
      return;
    }
    if (e.target.closest("#drawerClose")) { closeDrawer(); return; }
    if (e.target.id === "drawerMask") closeDrawer();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  /* ================= 汉堡菜单 ================= */
  var hamburger = document.getElementById("navHamburger");
  var mobileMenu = document.getElementById("navMobileMenu");
  if (hamburger && mobileMenu) {
    hamburger.addEventListener("click", function () {
      var on = mobileMenu.classList.toggle("show");
      hamburger.setAttribute("aria-expanded", String(on));
    });
    // 点击移动端菜单项后自动收起
    mobileMenu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") mobileMenu.classList.remove("show");
    });
  }

  /* ================= 主导航锚点跳转：先切 Tab 再 smooth scroll ================= */
  // 纯 href="#id" 无法切 Tab（候选/领域检索默认隐藏），这里统一拦截处理
  function handleNavAnchor(hash) {
    if (!hash) return;
    // 把 hash → (tab, elementId) 映射
    var map = {
      "#hero":       { tab: null,        el: "hero" },
      "#tools":      { tab: "curated",   el: "tools" },
      "#candidates": { tab: "candidates",el: "candidates" },
      "#domains":    { tab: "live",      el: "domains" }
    };
    var m = map[hash];
    if (!m) return;
    if (m.tab) switchTab(m.tab);
    if (m.el === "hero") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      var el = document.getElementById(m.el);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href^='#']");
    if (!a) return;
    var hash = a.getAttribute("href");
    if (!hash || hash === "#" || hash.length < 2) return;
    // 只处理站内锚点（跳过 GitHub 外链、skip-link 等）
    if (a.href && a.getAttribute("target") === "_blank") return;
    // 排除 skip-link（它直接让浏览器跳到 #tools，不需要我们拦截）
    if (a.classList.contains("skip-link")) return;
    handleNavAnchor(hash);
    e.preventDefault();
  });

  /* ================= 右侧悬浮回到顶部按钮 ================= */
  var backToTop = document.createElement("button");
  backToTop.className = "back-to-top";
  backToTop.type = "button";
  backToTop.setAttribute("aria-label", "回到页面顶部");
  backToTop.innerHTML = "↑";
  document.body.appendChild(backToTop);
  var throttled = false;
  window.addEventListener("scroll", function () {
    if (throttled) return;
    throttled = true;
    requestAnimationFrame(function () {
      throttled = false;
      backToTop.classList.toggle("show", window.scrollY > 320);
    });
  }, { passive: true });
  backToTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  // 键盘可访问性：也能 Tab 到按钮
})();

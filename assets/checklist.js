(function () {
  "use strict";

  var TAB_ORDER = ["mine", "route", "java", "agent", "redis", "mysql", "llm", "rag", "concurrent", "mq", "net"];
  var TAB_SHORT = {
    overview: "总览",
    mine: "我的整理",
    route: "Agent路线",
    java: "Java",
    agent: "Agent",
    redis: "Redis",
    mysql: "MySQL",
    llm: "大模型",
    rag: "RAG",
    concurrent: "并发编程",
    mq: "消息队列",
    net: "计算机网络",
    docker: "Docker",
    claudecode: "ClaudeCode",
    es: "ElasticSearch",
    rpc: "RPC",
    kafka: "Kafka",
    pg: "PostgreSQL",
    langgraph: "LangGraph",
    go: "Go语言",
    design: "设计模式",
    distributed: "分布式",
    redisstream: "Redis Stream",
    linux: "Linux",
    python: "Python"
  };
  var PRI_LABEL = { must: "面试必考", high: "高频", core: "必须掌握", know: "了解即可" };
  var PRI_ORDER = ["must", "high", "core", "know"];
  var STORE_KEY = "speedrun-progress-v2";
  var SKIP_OTHERS_KEYS = { route: 1 };

  var DATA = window.TAB_DATA || {};
  var PATCH = window.TAB_PATCH || {};
  var OTHERS = (window.OTHERS || []).filter(function (d) { return !SKIP_OTHERS_KEYS[d.key]; });
  var OTHER_KEYS = OTHERS.map(function (d) { return d.key; });
  var LINKS = window.LINKS || { groups: [] };
  var ICONS = {};
  LINKS.groups.forEach(function (g) { g.items.forEach(function (it) { if (it.key) ICONS[it.key] = it.icon; }); });

  var progress = {};
  try { progress = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch (e) { progress = {}; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function norm(s) { return String(s).trim().replace(/[?？。.\s]+$/g, ""); }
  function cleanTitle(t) {
    return String(t)
      .replace(/^\d+(\.\d+)?\s*(小时|分钟|周|天)\s*速通/, "")
      .replace(/（更新ing[^）]*）/g, "")
      .trim();
  }
  function hasAns(h) {
    return !!(h && h.replace(/<[^>]+>/g, "").replace(/\s/g, "").replace(/[\[\]原文档此处有配图]/g, "").length > 0);
  }
  function resolveAnswer(tabKey, q) {
    if (hasAns(q.html)) return { html: q.html, ai: false };
    var pk = PATCH[tabKey] || {};
    var h = pk[q.t] || pk[norm(q.t)];
    if (hasAns(h)) return { html: h, ai: true };
    return null;
  }
  function otherDocAns(d, q) {
    if (q.s != null && window.OTHERS_SHARED && hasAns(window.OTHERS_SHARED[q.s])) return window.OTHERS_SHARED[q.s];
    return "";
  }
  function otherResolve(d, q) {
    if (otherDocAns(d, q)) return { html: otherDocAns(d, q), ai: false };
    var h = (window.OTHERS_AI || {})[d.key + q.t];
    if (hasAns(h)) return { html: h, ai: true };
    return null;
  }

  var state = { tab: "overview", filter: {}, query: {} };
  var docStats = [];

  /* ---------- Panels (core static, others dynamic) ---------- */
  function buildPanels() {
    var wrap = document.querySelector(".wrap");
    if (!wrap) return;
    OTHERS.forEach(function (d) {
      if (document.getElementById("panel-" + d.key)) return;
      var sec = document.createElement("section");
      sec.className = "panel";
      sec.id = "panel-" + d.key;
      wrap.appendChild(sec);
    });
  }

  function qCount(doc) { var n = 0; doc.chapters.forEach(function (c) { n += c.questions.length; }); return n; }

  /* ---------- Tab bar ---------- */
  function buildTabbar() {
    var bar = document.getElementById("tabbar");
    var all = ["overview"].concat(TAB_ORDER).concat(OTHER_KEYS);
    var html = "";
    all.forEach(function (k) {
      var n = 0;
      if (DATA[k]) n = qCount(DATA[k]);
      else if (k !== "overview") { var d = OTHERS.filter(function (x) { return x.key === k; })[0]; if (d) n = qCount(d); }
      html += '<button class="tabbtn" data-tab="' + k + '">' + TAB_SHORT[k] +
        (n ? '<span class="cnt">' + n + '</span><span class="done-cnt" data-done="' + k + '"></span>' : "") + "</button>";
    });
    bar.innerHTML = html;
    bar.addEventListener("click", function (e) {
      var btn = e.target.closest(".tabbtn");
      if (!btn) return;
      switchTab(btn.getAttribute("data-tab"));
    });
  }

  function switchTab(key) {
    state.tab = key;
    document.querySelectorAll(".tabbtn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === key);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + key);
    });
    if (key === "overview" && window.APP_CHART && window.APP_CHART.resize) window.APP_CHART.resize();
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    var fullQ = 0, fullA = 0, listQ = 0;
    TAB_ORDER.forEach(function (k) {
      var n = 0, a = 0;
      DATA[k].chapters.forEach(function (c) {
        c.questions.forEach(function (q) { n++; if (resolveAnswer(k, q)) a++; });
      });
      fullQ += n; fullA += a;
      docStats.push({ name: DATA[k].title.replace(/（更新ing[^）]*）/, "").replace(/^(\d+小时|\d+分钟|一周)/, "").replace("速通", "速通·"), raw: DATA[k].title, count: n, answered: a, status: "full", key: k });
    });
    var AIo = window.OTHERS_AI || {};
    OTHERS.forEach(function (d) {
      var n = 0, a = 0;
      d.chapters.forEach(function (c) {
        c.questions.forEach(function (q) { n++; if (otherDocAns(d, q) || AIo[d.key + q.t]) a++; });
      });
      listQ += n;
      docStats.push({ name: d.title.replace(/（更新ing[^）]*）/, ""), raw: d.title, count: n, answered: a, status: "list", key: d.key });
    });

    var statDocs = document.getElementById("statDocs");
    var statQs = document.getElementById("statQs");
    var statAns = document.getElementById("statAns");
    var statTabs = document.getElementById("statTabs");
    var listA = docStats.filter(function (s) { return s.status === "list"; }).reduce(function (s2, x) { return s2 + x.answered; }, 0);
    var totalDocs = 0;
    LINKS.groups.forEach(function (g) { totalDocs += g.items.length; });
    if (statDocs) statDocs.textContent = totalDocs;
    if (statQs) statQs.textContent = (fullQ + listQ).toLocaleString();
    if (statAns) statAns.textContent = (fullA + listA).toLocaleString();
    if (statTabs) statTabs.textContent = TAB_ORDER.length + OTHER_KEYS.length;

    var lg = document.getElementById("linkgroups");
    var html = "";
    LINKS.groups.forEach(function (g) {
      html += '<div class="linkgroup"><h3>' + esc(g.name) + ' <span class="badge">' + g.items.length + ' 份</span></h3>';
      if (g.note) html += '<p style="font-size:.82rem;color:var(--muted);margin:-0.3rem 0 .6rem">' + esc(g.note) + "</p>";
      html += '<div class="linkgrid">';
      g.items.forEach(function (it) {
        var isPdf = !!it.pdf;
        var url = isPdf ? encodeURI(it.pdf) : (it.local ? "#" : "https://utxc8uqzfk.feishu.cn/wiki/" + it.token);
        var desc = it.note ? esc(it.note) : "";
        if (!desc && isPdf) desc = (it.size || "") + (it.size ? " · " : "") + "PDF 原文阅读";
        if (!desc) {
          if (it.status === "full") {
            var st = docStats.filter(function (s) { return s.key === it.key; })[0];
            desc = st ? st.count + " 题 · 全部含答案" : "含完整答案";
          } else if (it.status === "list") {
            var st2 = docStats.filter(function (s) { return s.key === it.key; })[0];
            desc = st2 ? st2.count + " 题 · 含完整答案" : "含完整答案";
          }
        }
        var stTxt = isPdf ? "PDF" : (it.status === "full" ? "全文+答案" : it.status === "list" ? "全文+答案" : it.status === "mine" ? "已收录" : "无权限");
        var goto = null;
        if (!isPdf) {
          if (it.status === "mine") goto = "mine";
          else if (it.key && DATA[it.key]) goto = it.key;
          else if (it.status === "list") goto = it.key;
        }
        if (goto) desc += " · 点击进入";
        var attrs = 'href="' + url + '"';
        if (isPdf) attrs += ' data-pdf="' + esc(url) + '" data-pdf-title="' + esc(cleanTitle(it.title)) + '"';
        else if (goto) attrs += ' data-goto="' + goto + '"';
        else attrs += ' target="_blank" rel="noopener"';
        html += '<a class="linkcard" ' + attrs + ">" +
          '<span class="ic">' + (it.icon || "📄") + "</span>" +
          '<span class="meta"><span class="t">' + esc(cleanTitle(it.title)) + "</span>" +
          (desc ? '<span class="d">' + desc + "</span>" : "") + "</span>" +
          '<span class="st ' + (isPdf ? "pdf" : it.status) + '">' + stTxt + "</span></a>";
      });
      html += "</div></div>";
    });
    lg.innerHTML = html;
    lg.addEventListener("click", function (e) {
      var pdfCard = e.target.closest(".linkcard[data-pdf]");
      if (pdfCard) {
        e.preventDefault();
        openPdf(pdfCard.getAttribute("data-pdf"), pdfCard.getAttribute("data-pdf-title"));
        return;
      }
      var card = e.target.closest(".linkcard[data-goto]");
      if (!card) return;
      e.preventDefault();
      switchTab(card.getAttribute("data-goto"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Shared toolbar HTML ---------- */
  function toolbarHtml(key, pris) {
    var chips = '<button class="chip fchip active" data-f="all">全部</button>';
    PRI_ORDER.forEach(function (p) {
      if (pris[p]) chips += '<button class="chip fchip" data-f="' + p + '">' + PRI_LABEL[p] + "</button>";
    });
    if (state.filter[key] === undefined) state.filter[key] = "all";
    if (state.query[key] === undefined) state.query[key] = "";
    return '<div class="toolbar">' +
      '<input class="search" type="search" placeholder="搜索本 Tab 题目关键词…" data-search="' + key + '" value="' + esc(state.query[key]) + '">' +
      chips +
      '<button class="chip fchip" data-f="undone">未做</button>' +
      '<button class="chip fchip" data-f="done">已做</button>' +
      '<button class="chip expand" data-expand="' + key + '">展开全部答案</button>' +
      "</div>";
  }

  function progressHtml(key, total) {
    return '<div class="progress-line">' +
      '<div class="progress-track"><div class="progress-fill" id="fill-' + key + '"></div></div>' +
      '<span class="progress-text" id="ptext-' + key + '">0 / ' + total + "</span>" +
      '<button class="btn-reset" data-reset="' + key + '">重置本Tab进度</button>' +
      "</div>";
  }

  /* ---------- Tech tab (core, with answers) ---------- */
  function renderTechTab(key) {
    var panel = document.getElementById("panel-" + key);
    var d = DATA[key];
    var pris = {};
    var total = 0;
    d.chapters.forEach(function (c) { c.questions.forEach(function (q) { pris[q.p] = 1; total++; }); });

    var html = toolbarHtml(key, pris) + progressHtml(key, total) +
      '<p style="font-size:.82rem;color:var(--muted);margin:.2rem 0 .2rem">来源：' +
      (d.url ? '<a href="' + d.url + '" target="_blank" rel="noopener" style="color:var(--accent)">' + esc(d.title) + " ↗</a>"
             : "<strong>" + esc(d.title) + "</strong>（本地 Markdown 笔记解析）") + "</p>";

    var gid = 0;
    html += '<div data-chapters="' + key + '">';
    d.chapters.forEach(function (c) {
      html += '<section class="chapter">';
      html += '<div class="chapter-head"><span class="no">' + (c.no ? "第" + c.no + "章" : "章节") + "</span><h2>" + esc(c.title) + '</h2><span class="done" data-chdone></span></div>';
      c.questions.forEach(function (q) {
        gid++;
        var ans = resolveAnswer(key, q);
        var id = key + ":" + gid;
        var tagCls = q.p || "know";
        var tagTxt = q.tag || PRI_LABEL[q.p] || "";
        var aiTag = ans && ans.ai ? '<span class="tag ai" title="原文档未提供答案，由 AI 补写">AI补充</span>' : "";
        html += '<div class="qa" data-gid="' + id + '" data-pri="' + (q.p || "") + '" data-text="' + esc(q.t.toLowerCase()) + '">' +
          '<div class="qa-head">' +
          '<label class="chk"><input type="checkbox" data-id="' + id + '"' + (progress[id] ? " checked" : "") + '><span class="box"></span></label>' +
          '<button class="qtext-btn" data-twist><span class="gid">#' + String(gid).padStart(3, "0") + '</span><span class="qtext">' + esc(q.t) + "</span></button>";
        if (tagTxt) html += '<span class="tag ' + tagCls + '">' + esc(tagTxt) + "</span>";
        if (aiTag) html += aiTag;
        html += '<button class="twist" data-twist>答案</button></div>';
        html += '<div class="answer">' + (ans ? ans.html : '<p class="no-answer"><strong>本文档未提供该题答案</strong>，请查阅原文档或等待后续补充。</p>') + "</div></div>";
      });
      html += "</section>";
    });
    html += "</div>";
    panel.innerHTML = html;
  }

  /* ---------- Other doc tab (each ext doc = one tab) ---------- */
  function renderOtherTab(d) {
    var key = d.key;
    var panel = document.getElementById("panel-" + key);
    if (!panel) return;
    var pris = {};
    var total = 0;
    d.chapters.forEach(function (c) { c.questions.forEach(function (q) { pris[q.p] = 1; total++; }); });

    var html = toolbarHtml(key, pris) + progressHtml(key, total) +
      '<p style="font-size:.82rem;color:var(--muted);margin:.2rem 0 .2rem">来源：' +
      '<a href="' + d.url + '" target="_blank" rel="noopener" style="color:var(--accent)">' + esc(d.title) + " ↗</a></p>";

    var gid = 0;
    d.chapters.forEach(function (c) {
      html += '<section class="chapter">';
      html += '<div class="chapter-head"><span class="no">' + (ICONS[d.key] || "📄") + "</span><h2>" + esc(c.title) + '</h2><span class="done" data-chdone></span></div>';
      c.questions.forEach(function (q) {
        gid++;
        var id = key + ":" + gid;
        var ans = otherResolve(d, q);
        var tagCls = q.p || "know";
        var tagTxt = q.tag || PRI_LABEL[q.p] || "";
        html += '<div class="qa" data-gid="' + id + '" data-pri="' + (q.p || "") + '" data-text="' + esc(q.t.toLowerCase()) + '">' +
          '<div class="qa-head">' +
          '<label class="chk"><input type="checkbox" data-id="' + id + '"' + (progress[id] ? " checked" : "") + '><span class="box"></span></label>' +
          '<button class="qtext-btn" data-twist><span class="gid">#' + String(gid).padStart(3, "0") + '</span><span class="qtext">' + esc(q.t) + "</span></button>";
        if (tagTxt) html += '<span class="tag ' + tagCls + '">' + esc(tagTxt) + "</span>";
        if (ans && ans.ai) html += '<span class="tag ai" title="原文档未提供答案，由 AI 补写">AI补充</span>';
        if (ans) html += '<button class="twist" data-twist>答案</button>';
        html += "</div>";
        if (ans) html += '<div class="answer">' + ans.html + "</div>";
        html += "</div>";
      });
      html += "</section>";
    });
    panel.innerHTML = html;
  }

  /* ---------- Progress & filters ---------- */
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) {} }

  function refreshTab(key) {
    var panel = document.getElementById("panel-" + key);
    if (!panel) return;
    var qs = panel.querySelectorAll(".qa");
    var done = 0;
    var f = state.filter[key] || "all";
    var kw = (state.query[key] || "").trim().toLowerCase();
    qs.forEach(function (el) {
      var box = el.querySelector("input[type=checkbox]");
      var pri = el.getAttribute("data-pri");
      var text = el.getAttribute("data-text") || "";
      var show;
      switch (f) {
        case "done": show = box.checked; break;
        case "undone": show = !box.checked; break;
        case "all": show = true; break;
        default: show = pri === f;
      }
      if (show && kw) show = text.indexOf(kw) >= 0;
      el.classList.toggle("hidden-filter", !show);
      if (box.checked) done++;
    });
    panel.querySelectorAll(".chapter").forEach(function (sec) {
      var v = sec.querySelectorAll(".qa:not(.hidden-filter)").length;
      var boxes = sec.querySelectorAll("input[type=checkbox]");
      var dn = 0; boxes.forEach(function (b) { if (b.checked) dn++; });
      sec.classList.toggle("hidden-chapter", v === 0);
      var doneEl = sec.querySelector("[data-chdone]");
      if (doneEl) doneEl.textContent = dn + " / " + boxes.length;
    });

    var fill = document.getElementById("fill-" + key);
    var pt = document.getElementById("ptext-" + key);
    var pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
    if (fill) fill.style.width = pct + "%";
    if (pt) pt.textContent = done + " / " + qs.length + "（" + pct + "%）";

    var dc = document.querySelector('[data-done="' + key + '"]');
    if (dc) dc.textContent = done ? "✓" + done : "";

    panel.querySelectorAll(".fchip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-f") === (f || "all"));
    });
  }

  function refreshAll() {
    TAB_ORDER.forEach(refreshTab);
    OTHER_KEYS.forEach(refreshTab);
  }

  /* ---------- Global events ---------- */
  document.addEventListener("change", function (e) {
    var box = e.target;
    if (box.matches('.qa input[type=checkbox]')) {
      var id = box.getAttribute("data-id");
      if (box.checked) progress[id] = 1; else delete progress[id];
      save();
      var key = box.closest(".panel").id.replace("panel-", "");
      refreshTab(key);
    }
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    var twist = t.closest("[data-twist]");
    if (twist) {
      var qa = twist.closest(".qa");
      var open = qa.classList.toggle("open");
      if (twist.classList.contains("qtext-btn")) {
        var btn = qa.querySelector(".twist");
        if (btn) btn.textContent = open ? "收起" : "答案";
      } else {
        twist.textContent = open ? "收起" : "答案";
      }
      return;
    }
    var exp = t.closest("[data-expand]");
    if (exp) {
      var key = exp.getAttribute("data-expand");
      var panel = document.getElementById("panel-" + key);
      var anyClosed = panel.querySelectorAll(".qa:not(.open)").length > 0;
      panel.querySelectorAll(".qa").forEach(function (el) {
        el.classList.toggle("open", anyClosed);
        var b = el.querySelector(".twist");
        if (b) b.textContent = anyClosed ? "收起" : "答案";
      });
      exp.textContent = anyClosed ? "收起全部答案" : "展开全部答案";
      return;
    }
    var rst = t.closest("[data-reset]");
    if (rst) {
      var k = rst.getAttribute("data-reset");
      if (confirm("确定清空该 Tab 的打卡记录？")) {
        Object.keys(progress).forEach(function (id) { if (id.indexOf(k + ":") === 0) delete progress[id]; });
        save();
        document.querySelectorAll('#panel-' + k + ' .qa input[type=checkbox]').forEach(function (b) { b.checked = false; });
        refreshTab(k);
      }
      return;
    }
    var fchip = t.closest(".fchip");
    if (fchip) {
      var pk = fchip.closest(".panel").id.replace("panel-", "");
      state.filter[pk] = fchip.getAttribute("data-f");
      refreshTab(pk);
    }
  });

  document.addEventListener("input", function (e) {
    var s = e.target;
    if (s.matches && s.matches(".search")) {
      var key = s.getAttribute("data-search");
      state.query[key] = s.value;
      refreshTab(key);
    }
  });

  /* ---------- PDF modal ---------- */
  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  }
  function openPdf(src, title) {
    if (isMobile()) {
      window.open(src, "_blank", "noopener");
      return true;
    }
    var modal = document.getElementById("pdf-modal");
    var frame = document.getElementById("pdf-frame");
    var t = document.getElementById("pdf-modal-title");
    if (!modal || !frame) return;
    if (t) t.textContent = title || "PDF 预览";
    frame.src = src;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closePdf() {
    var modal = document.getElementById("pdf-modal");
    var frame = document.getElementById("pdf-frame");
    if (frame) frame.src = "about:blank";
    if (modal) modal.classList.remove("open");
    document.body.style.overflow = "";
  }
  (function bindPdf() {
    var modal = document.getElementById("pdf-modal");
    if (!modal) return;
    modal.addEventListener("click", function (e) { if (e.target === modal) closePdf(); });
    var btn = document.getElementById("pdf-modal-close");
    if (btn) btn.addEventListener("click", closePdf);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePdf(); });
  })();

  /* ---------- Init ---------- */
  buildPanels();
  buildTabbar();
  renderOverview();
  TAB_ORDER.forEach(renderTechTab);
  OTHERS.forEach(renderOtherTab);
  refreshAll();
  switchTab("overview");

  window.APP_STATE = { docStats: docStats, tabs: TAB_ORDER.concat(OTHER_KEYS) };
})();
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
    others: "清单库"
  };
  var PRI_LABEL = { must: "面试必考", high: "高频", core: "必须掌握", know: "了解即可" };
  var PRI_ORDER = ["must", "high", "core", "know"];
  var STORE_KEY = "speedrun-progress-v2";
  var SKIP_OTHERS_KEYS = { route: 1 };

  var DATA = window.TAB_DATA || {};
  var PATCH = window.TAB_PATCH || {};
  var OTHERS = (window.OTHERS || []).filter(function (d) { return !SKIP_OTHERS_KEYS[d.key]; });
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

  var state = { tab: "overview", filter: {}, query: {} };
  var docStats = [];

  /* ---------- Tab bar ---------- */
  function buildTabbar() {
    var bar = document.getElementById("tabbar");
    var html = "";
    var tabs = ["overview"].concat(TAB_ORDER).concat(["others"]);
    tabs.forEach(function (k) {
      var cnt = "";
      if (DATA[k]) {
        var n = 0; DATA[k].chapters.forEach(function (c) { n += c.questions.length; });
        cnt = '<span class="cnt">' + n + '</span><span class="done-cnt" data-done="' + k + '"></span>';
      } else if (k === "others") {
        var n2 = 0; OTHERS.forEach(function (d) { d.chapters.forEach(function (c) { n2 += c.questions.length; }); });
        cnt = '<span class="cnt">' + n2 + '</span><span class="done-cnt" data-done="others"></span>';
      }
      html += '<button class="tabbtn" data-tab="' + k + '">' + TAB_SHORT[k] + cnt + "</button>";
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
    OTHERS.forEach(function (d) {
      var n = 0; d.chapters.forEach(function (c) { n += c.questions.length; });
      listQ += n;
      docStats.push({ name: d.title.replace(/（更新ing[^）]*）/, ""), raw: d.title, count: n, answered: 0, status: "list", key: d.key });
    });

    var statQs = document.getElementById("statQs");
    var statAns = document.getElementById("statAns");
    if (statQs) statQs.textContent = (fullQ + listQ).toLocaleString();
    if (statAns) statAns.textContent = fullA.toLocaleString();

    var lg = document.getElementById("linkgroups");
    var html = "";
    LINKS.groups.forEach(function (g) {
      html += '<div class="linkgroup"><h3>' + esc(g.name) + ' <span class="badge">' + g.items.length + ' 份</span></h3>';
      if (g.note) html += '<p style="font-size:.82rem;color:var(--muted);margin:-0.3rem 0 .6rem">' + esc(g.note) + "</p>";
      html += '<div class="linkgrid">';
      g.items.forEach(function (it) {
        var url = it.local ? "#" : "https://utxc8uqzfk.feishu.cn/wiki/" + it.token;
        var desc = it.note ? esc(it.note) : "";
        if (!desc) {
          if (it.status === "full") {
            var st = docStats.filter(function (s) { return s.key === it.key; })[0];
            desc = st ? st.count + " 题 · 全部含答案" : "含完整答案";
          } else if (it.status === "list") {
            var st2 = docStats.filter(function (s) { return s.key === it.key; })[0];
            desc = st2 ? st2.count + " 题 · 题目清单（见清单库）" : "题目清单";
          }
        }
        var stTxt = it.status === "full" ? "全文+答案" : it.status === "list" ? "题目清单" : it.status === "mine" ? "已收录" : "无权限";
        var goto = null;
        if (it.status === "mine") goto = "mine";
        else if (it.key && DATA[it.key]) goto = it.key;
        else if (it.status === "list") goto = "others";
        if (goto) desc += " · 点击进入";
        html += '<a class="linkcard" href="' + url + '"' + (goto ? ' data-goto="' + goto + '"' : ' target="_blank" rel="noopener"') + ">" +
          '<span class="ic">' + (it.icon || "📄") + "</span>" +
          '<span class="meta"><span class="t">' + esc(it.title) + "</span>" +
          (desc ? '<span class="d">' + desc + "</span>" : "") + "</span>" +
          '<span class="st ' + it.status + '">' + stTxt + "</span></a>";
      });
      html += "</div></div>";
    });
    lg.innerHTML = html;
    lg.addEventListener("click", function (e) {
      var card = e.target.closest(".linkcard[data-goto]");
      if (!card) return;
      e.preventDefault();
      switchTab(card.getAttribute("data-goto"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------- Tech tab (with answers) ---------- */
  function renderTechTab(key) {
    var panel = document.getElementById("panel-" + key);
    var d = DATA[key];
    var pris = {};
    var total = 0;
    d.chapters.forEach(function (c) { c.questions.forEach(function (q) { pris[q.p] = 1; total++; }); });

    var chips = '<button class="chip fchip active" data-f="all">全部</button>';
    PRI_ORDER.forEach(function (p) {
      if (pris[p]) chips += '<button class="chip fchip" data-f="' + p + '">' + PRI_LABEL[p] + "</button>";
    });
    if (state.filter[key] === undefined) state.filter[key] = "all";
    if (state.query[key] === undefined) state.query[key] = "";

    var html =
      '<div class="toolbar">' +
      '<input class="search" type="search" placeholder="搜索本 Tab 题目关键词…" data-search="' + key + '" value="' + esc(state.query[key]) + '">' +
      chips +
      '<button class="chip fchip" data-f="undone">未做</button>' +
      '<button class="chip fchip" data-f="done">已做</button>' +
      '<button class="chip expand" data-expand="' + key + '">展开全部答案</button>' +
      "</div>" +
      '<div class="progress-line">' +
      '<div class="progress-track"><div class="progress-fill" id="fill-' + key + '"></div></div>' +
      '<span class="progress-text" id="ptext-' + key + '">0 / ' + total + "</span>" +
      '<button class="btn-reset" data-reset="' + key + '">重置本Tab进度</button>' +
      "</div>" +
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

  /* ---------- Others tab (list-only) ---------- */
  function renderOthers() {
    var panel = document.getElementById("panel-others");
    var html =
      '<div class="callout" style="margin-top:.6rem">以下 <strong>' + OTHERS.length + ' 份文档</strong>仅抓取到<strong>题目大纲</strong>（原文档正文未开放或以图片为主），此处汇总为题目清单，可勾选打卡追踪学习进度；点击文档标题可跳转原文查看答案。</div>';
    OTHERS.forEach(function (d, di) {
      var n = 0; d.chapters.forEach(function (c) { n += c.questions.length; });
      html += '<section class="chapter" style="margin-top:1.2rem">' +
        '<div class="chapter-head"><span class="no">' + (ICONS[d.key] || "📄") + "</span><h2>" +
        '<a href="' + d.url + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">' + esc(d.title) + " ↗</a></h2>" +
        '<span class="done" data-chdone>0 / ' + n + "</span></div>";
      var gid = 0;
      d.chapters.forEach(function (c) {
        html += '<p style="font-size:.85rem;font-weight:700;color:var(--muted);margin:.7rem 0 .2rem">' + esc(c.title) + "</p>";
        c.questions.forEach(function (q) {
          gid++;
          var id = "others:" + di + ":" + gid;
          var tagCls = q.p || "know";
          var tagTxt = q.tag || PRI_LABEL[q.p] || "";
          html += '<div class="qa" data-gid="' + id + '" data-pri="' + (q.p || "") + '" data-text="' + esc(q.t.toLowerCase()) + '">' +
            '<div class="qa-head">' +
            '<label class="chk"><input type="checkbox" data-id="' + id + '"' + (progress[id] ? " checked" : "") + '><span class="box"></span></label>' +
            '<span class="qtext-btn" style="flex:1;font-size:.92rem;line-height:1.55"><span class="gid">#' + String(gid).padStart(3, "0") + '</span><span class="qtext">' + esc(q.t) + "</span></span>";
          if (tagTxt) html += '<span class="tag ' + tagCls + '">' + esc(tagTxt) + "</span>";
          html += "</div></div>";
        });
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
    var done = 0, visible = 0;
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
      if (show) visible++;
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
    refreshTab("others");
  }

  /* ---------- Global events ---------- */
  document.addEventListener("change", function (e) {
    var box = e.target;
    if (box.matches('.qa input[type=checkbox]')) {
      var id = box.getAttribute("data-id");
      if (box.checked) progress[id] = 1; else delete progress[id];
      save();
      var qa = box.closest(".qa");
      var panel = qa.closest(".panel");
      var key = panel.id.replace("panel-", "");
      refreshTab(key === "others" ? "others" : key);
    }
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    var twist = t.closest("[data-twist]");
    if (twist) {
      var qa = twist.closest(".qa");
      if (twist.hasAttribute("data-expand")) return;
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

  /* ---------- Init ---------- */
  buildTabbar();
  renderOverview();
  TAB_ORDER.forEach(renderTechTab);
  renderOthers();
  refreshAll();
  switchTab("overview");

  window.APP_STATE = { docStats: docStats, tabs: TAB_ORDER };
})();

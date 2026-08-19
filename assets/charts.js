(function () {
  "use strict";
  var el = document.getElementById("chart-docs");
  if (!el || typeof echarts === "undefined" || !window.APP_STATE) return;

  var cs = getComputedStyle(document.documentElement);
  var ink = cs.getPropertyValue("--ink").trim();
  var muted = cs.getPropertyValue("--muted").trim();
  var rule = cs.getPropertyValue("--rule").trim();
  var accent = cs.getPropertyValue("--accent").trim();
  var accent2 = cs.getPropertyValue("--accent2").trim();

  var stats = window.APP_STATE.docStats.slice().sort(function (a, b) { return b.count - a.count; });
  var names = stats.map(function (s) { return s.name; });
  var counts = stats.map(function (s) { return s.count; });
  var colors = stats.map(function (s) {
    return s.answered > 0 ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: accent }, { offset: 1, color: accent2 }
    ]) : "rgba(100,116,139,0.35)";
  });

  var chart = echarts.init(el, null, { renderer: "svg" });
  chart.setOption({
    animation: false,
    tooltip: {
      trigger: "item",
      formatter: function (p) {
        var s = stats[p.dataIndex];
        var tag = s.answered > 0 ? "含完整答案 " + s.answered + " / " + s.count + " 题" : "题目清单（无答案）";
        return "<b>" + s.raw + "</b><br/>题目数：" + s.count + "<br/>" + tag;
      }
    },
    grid: { left: 8, right: 40, top: 10, bottom: 4, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: names,
      axisLabel: { color: ink, fontSize: 11 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    series: [{
      type: "bar",
      data: counts.map(function (v, i) { return { value: v, itemStyle: { color: colors[i], borderRadius: [0, 4, 4, 0] } }; }),
      barMaxWidth: 16,
      label: {
        show: true,
        position: "right",
        color: muted,
        fontSize: 10,
        fontFamily: "JetBrainsMono, Consolas, monospace",
        formatter: "{c}"
      }
    }]
  });

  window.APP_CHART = chart;
  window.addEventListener("resize", function () { chart.resize(); });
})();

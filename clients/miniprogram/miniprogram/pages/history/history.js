const quiz = require("../../utils/quiz");
const session = require("../../utils/session");
const store = require("../../utils/store");
const uCharts = require("../../libs/ucharts");

function getDpr() {
  try {
    return wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio;
  } catch (e) {
    return 2;
  }
}

Page({
  data: {
    ready: false,
    tab: "records",
    history: [],
    hasData: false,
    rankList: [],
    okCount: 0,
    errCount: 0,
    trendCount: 0,
  },

  onLoad() {
    const bank = session.curBank;
    if (!bank) {
      wx.navigateBack();
      return;
    }
    this.bank = bank;
    this.setData({ ready: true });
    this.render();
  },

  setTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    this.render();
  },

  render() {
    if (this.data.tab === "records") this.renderRecords();
    else this.renderStat();
  },

  renderRecords() {
    const bank = this.bank;
    const history = store
      .get(store.KEYS.HISTORY, [])
      .filter((h) => h.bank === bank.name)
      .map((h) => ({
        ts: h.ts,
        date: h.date,
        modeText: h.mode === "exam" ? "考试" : "练习",
        scoreText: `${h.correct}/${h.total}`,
        score: h.score,
        time: h.time,
      }));
    this.setData({ history });
  },

  renderStat() {
    const bank = this.bank;
    const stat = store.get(store.KEYS.STAT, {})[bank.name] || {};
    const history = store.get(store.KEYS.HISTORY, []).filter((h) => h.bank === bank.name);
    if (!Object.keys(stat).length && !history.length) {
      this.setData({ hasData: false, rankList: [] });
      return;
    }
    let okCount = 0;
    let errCount = 0;
    Object.keys(stat).forEach((k) => {
      okCount += stat[k].tries - stat[k].wrong;
      errCount += stat[k].wrong;
    });
    const ranked = quiz.rankStat(stat);
    const rankList = ranked.slice(0, 10).map((r) => {
      const q = bank.questions.find((x) => x.num === r.num);
      return {
        num: r.num,
        text: q ? (q.text || "").slice(0, 24) : "",
        tries: r.tries,
        wrong: r.wrong,
        rate: Math.round((r.wrong / r.tries) * 100),
      };
    });
    this.setData({ hasData: true, okCount, errCount, rankList });
    wx.nextTick(() => this.drawCharts(history, stat, ranked));
  },

  drawCharts(history, stat, ranked) {
    this.drawLine(history);
    this.drawPie();
    this.drawBar(ranked.slice(0, 10));
  },

  makeCanvas(id, cb) {
    const query = wx.createSelectorQuery().in(this);
    query
      .select("#" + id)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext("2d");
        const dpr = getDpr();
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        cb(ctx, res[0].width, res[0].height);
      });
  },

  drawLine(history) {
    const list = history.slice().reverse();
    const categories = list.map((h) => (h.date || "").slice(5, 16));
    const data = list.map((h) => h.score);
    this.makeCanvas("statLine", (ctx, width, height) => {
      try {
        new uCharts({
          type: "line",
          canvas2d: true,
          context: ctx,
          width,
          height,
          categories,
          series: [{ name: "正确率", data }],
          animation: false,
          background: "#FFFFFF",
          color: ["#2563eb"],
          padding: [15, 20, 0, 10],
          dataLabel: false,
          dataPointShape: true,
          enableScroll: false,
          legend: { show: false },
          xAxis: { disableGrid: true, fontSize: 10 },
          yAxis: { gridType: "dash", min: 0, max: 100, fontSize: 10 },
          extra: { line: { type: "curve", width: 2 } },
        });
      } catch (e) {
        console.warn("line chart err", e);
      }
    });
  },

  drawPie() {
    const series = [
      { name: "答对", data: this.data.okCount },
      { name: "答错", data: this.data.errCount },
    ];
    this.makeCanvas("statPie", (ctx, width, height) => {
      try {
        new uCharts({
          type: "ring",
          canvas2d: true,
          context: ctx,
          width,
          height,
          series,
          animation: false,
          background: "#FFFFFF",
          color: ["#16a34a", "#dc2626"],
          padding: [5, 5, 5, 5],
          dataLabel: true,
          legend: { show: true, position: "bottom", fontSize: 12 },
          extra: {
            ring: {
              ringWidth: 30,
              activeOpacity: 0.5,
              activeRadius: 10,
              offsetAngle: 0,
              labelWidth: 15,
              border: true,
              borderWidth: 2,
              borderColor: "#FFFFFF",
            },
          },
        });
      } catch (e) {
        console.warn("pie chart err", e);
      }
    });
  },

  drawBar(ranked) {
    const categories = ranked.map((r) => "#" + r.num);
    const data = ranked.map((r) => Math.round((r.wrong / r.tries) * 100));
    this.makeCanvas("statBar", (ctx, width, height) => {
      try {
        new uCharts({
          type: "column",
          canvas2d: true,
          context: ctx,
          width,
          height,
          categories,
          series: [{ name: "出错率", data }],
          animation: false,
          background: "#FFFFFF",
          color: ["#f59e0b"],
          padding: [15, 15, 0, 10],
          dataLabel: true,
          legend: { show: false },
          xAxis: { disableGrid: true, fontSize: 10 },
          yAxis: { gridType: "dash", min: 0, max: 100, fontSize: 10 },
          extra: { column: { width: 18, barBorderCircle: true } },
        });
      } catch (e) {
        console.warn("bar chart err", e);
      }
    });
  },

  back() {
    wx.navigateBack();
  },
});

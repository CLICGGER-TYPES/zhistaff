const quiz = require("../../utils/quiz");
const session = require("../../utils/session");

Page({
  data: {
    ready: false,
    title: "练习结果",
    correct: 0,
    total: 0,
    pct: 0,
    cls: "bad",
    wrong: 0,
    timeText: "",
  },

  onLoad() {
    const r = session.result;
    if (!r) {
      wx.navigateBack();
      return;
    }
    const pct = r.total ? Math.round((r.correct / r.total) * 100) : 0;
    const cls = pct >= 80 ? "ok" : pct >= 60 ? "mid" : "bad";
    this.setData({
      ready: true,
      title: r.mode === "exam" ? "考试成绩" : "练习结果",
      correct: r.correct,
      total: r.total,
      wrong: r.wrong,
      pct,
      cls,
      timeText: `${Math.floor(r.elapsed / 60)}分${r.elapsed % 60}秒`,
    });
  },

  reRun() {
    const bank = session.curBank;
    const ls = session.lastStart;
    if (!bank || !ls) {
      wx.navigateBack();
      return;
    }
    const list = quiz.pickQuestions(bank, ls.scope, ls.randomCount);
    if (!list.length) {
      wx.showModal({ title: "提示", content: "该范围没有题目", showCancel: false });
      return;
    }
    session.session = {
      mode: ls.mode,
      scope: ls.scope,
      bankName: bank.name,
      questions: quiz.buildQuestions(bank, quiz.shuffle(list)),
      answers: {},
      marked: {},
      curIdx: 0,
      t0: Date.now(),
      minutes: ls.mode === "exam" ? ls.examMinutes : 0,
    };
    wx.redirectTo({ url: "/pages/quiz/quiz" });
  },

  goWrongBook() {
    wx.navigateTo({ url: "/pages/wrongbook/wrongbook" });
  },

  goHistory() {
    wx.navigateTo({ url: "/pages/history/history" });
  },

  back() {
    wx.navigateBack();
  },
});

const quiz = require("../../utils/quiz");
const session = require("../../utils/session");
const store = require("../../utils/store");

Page({
  data: {
    tab: "wrong",
    bankName: "",
    wronglog: [],
    favs: [],
    sheet: null,
    ready: false,
  },

  onLoad() {
    const bank = session.curBank;
    if (!bank) {
      wx.navigateBack();
      return;
    }
    this.setData({ bankName: bank.name, ready: true });
    this.loadWrong();
    this.loadFav();
  },

  setTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab, sheet: null });
  },

  loadWrong() {
    const bank = session.curBank;
    const log = store.get(store.KEYS.WRONGLOG, {})[bank.name] || [];
    const wronglog = log.map((w) => ({
      ts: w.ts,
      date: w.date,
      modeText: w.mode === "exam" ? "考试" : "练习",
      correct: w.correct,
      total: w.total,
      wrongN: (w.wrongNums || []).length,
    }));
    this.setData({ wronglog });
  },

  loadFav() {
    const bank = session.curBank;
    const nums = quiz.favOf(bank.name);
    const favs = bank.questions
      .filter((q) => nums.indexOf(q.num) >= 0)
      .map((q) => ({
        num: q.num,
        typeText: q.type === "fill" ? "填空" : "",
        text: (q.text || "").slice(0, 60),
      }));
    this.setData({ favs });
  },

  openSession(e) {
    const ts = e.currentTarget.dataset.ts;
    const bank = session.curBank;
    const w = (store.get(store.KEYS.WRONGLOG, {})[bank.name] || []).find((x) => x.ts === ts);
    if (!w) return;
    const rawNums = w.qNums && w.qNums.length ? w.qNums : w.wrongNums || [];
    const qNums = Array.from(new Set(rawNums)).sort((a, b) => a - b);
    const wrongSet = new Set(w.wrongNums || []);
    const cells = qNums.map((num) => {
      const exists = !!bank.questions.find((x) => x.num === num);
      return {
        num,
        cls: !exists ? "" : wrongSet.has(num) ? "bad" : "ok",
      };
    });
    this.setData({
      sheet: {
        ts,
        date: w.date,
        modeText: w.mode === "exam" ? "考试" : "练习",
        correct: w.correct,
        total: w.total,
        wrongN: (w.wrongNums || []).length,
        qNums,
        cells,
      },
    });
  },

  closeSheet() {
    this.setData({ sheet: null });
  },

  reviewCell(e) {
    const num = e.currentTarget.dataset.num;
    this.reviewSingle(num, this.data.sheet ? this.data.sheet.qNums : null);
  },

  reviewSingle(num, qNums) {
    const bank = session.curBank;
    const q = bank.questions.find((x) => x.num === num);
    if (!q) {
      wx.showToast({ title: "该题在题库中不存在", icon: "none" });
      return;
    }
    if (qNums && qNums.length > 1) {
      this.reviewSheet(qNums, num);
    } else {
      const opts =
        q.type === "choice"
          ? q.options.map((o, i) => ({ disp: quiz.LETTERS[i], orig: o.k, v: o.v }))
          : [];
      session.session = {
        mode: "practice",
        scope: null,
        review: true,
        bankName: bank.name,
        questions: [{ q, opts }],
        answers: {},
        marked: { 0: true },
        curIdx: 0,
        t0: Date.now(),
        minutes: 0,
      };
      wx.navigateTo({ url: "/pages/quiz/quiz" });
    }
  },

  reviewSheet(qNums, startNum) {
    const bank = session.curBank;
    const questions = qNums
      .map((num) => {
        const q = bank.questions.find((x) => x.num === num);
        if (!q) return null;
        const opts =
          q.type === "choice"
            ? q.options.map((o, i) => ({ disp: quiz.LETTERS[i], orig: o.k, v: o.v }))
            : [];
        return { q, opts };
      })
      .filter(Boolean);
    if (!questions.length) {
      wx.showToast({ title: "试卷中没有可回看的题", icon: "none" });
      return;
    }
    const marked = {};
    questions.forEach((_, i) => (marked[i] = true));
    const startIdx = Math.max(
      0,
      questions.findIndex((it) => it.q.num === startNum)
    );
    session.session = {
      mode: "practice",
      scope: null,
      review: true,
      bankName: bank.name,
      questions,
      answers: {},
      marked,
      curIdx: startIdx,
      t0: Date.now(),
      minutes: 0,
    };
    wx.navigateTo({ url: "/pages/quiz/quiz" });
  },

  practiceRecordWrong(e) {
    const ts = e.currentTarget.dataset.ts;
    const bank = session.curBank;
    const w = (store.get(store.KEYS.WRONGLOG, {})[bank.name] || []).find((x) => x.ts === ts);
    if (!w) return;
    const nums = (w.wrongNums || []).slice().sort((a, b) => a - b);
    if (!nums.length) {
      wx.showModal({ title: "提示", content: "该次记录没有错题。", showCancel: false });
      return;
    }
    const list = bank.questions.filter((q) => nums.indexOf(q.num) >= 0);
    session.lastStart = { mode: "practice", scope: "all", randomCount: 20, examMinutes: 60 };
    session.session = {
      mode: "practice",
      scope: null,
      bankName: bank.name,
      questions: quiz.buildQuestions(bank, list),
      answers: {},
      marked: {},
      curIdx: 0,
      t0: Date.now(),
      minutes: 0,
    };
    wx.navigateTo({ url: "/pages/quiz/quiz" });
  },

  reviewFav(e) {
    const num = e.currentTarget.dataset.num;
    this.reviewSingle(num, null);
  },

  practiceFav() {
    const bank = session.curBank;
    const nums = quiz.favOf(bank.name);
    const list = bank.questions.filter((q) => nums.indexOf(q.num) >= 0);
    if (!list.length) {
      wx.showToast({ title: "还没有收藏的题", icon: "none" });
      return;
    }
    session.lastStart = { mode: "practice", scope: "fav", randomCount: 20, examMinutes: 60 };
    session.session = {
      mode: "practice",
      scope: "fav",
      bankName: bank.name,
      questions: quiz.buildQuestions(bank, quiz.shuffle(list)),
      answers: {},
      marked: {},
      curIdx: 0,
      t0: Date.now(),
      minutes: 0,
    };
    wx.navigateTo({ url: "/pages/quiz/quiz" });
  },

  back() {
    wx.navigateBack();
  },
});

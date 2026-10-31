const quiz = require("../../utils/quiz");
const session = require("../../utils/session");

function modal(title, content, confirmText, cancelText) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: confirmText || "确定",
      cancelText: cancelText || "取消",
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    });
  });
}

Page({
  data: {
    ready: false,
    isExam: false,
    isReview: false,
    qNumText: "",
    qText: "",
    qImage: "",
    qDesc: "",
    type: "choice",
    options: [],
    fillValue: "",
    marked: false,
    showExplain: false,
    explainTitle: "",
    correctText: "",
    explain: "",
    timerText: "",
    progressPct: 0,
    isFav: false,
    prevDisabled: true,
    submitText: "结束",
    showSubmit: true,
    showJudgeBtn: false,
  },

  onLoad() {
    const s = session.session;
    if (!s || !s.questions || !s.questions.length) {
      wx.showToast({ title: "会话已失效", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    if (s.mode === "exam") {
      wx.enableAlertBeforeUnload({ message: "退出后本次考试不保存，确定退出？" });
    } else if (!s.review) {
      wx.enableAlertBeforeUnload({ message: "退出后将保存当前进度，下次可继续。" });
    }
    this.render();
    this.startTimer();
  },

  onHide() {
    const s = session.session;
    if (s && s.mode === "practice" && !s.review) quiz.saveResume(s);
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
    wx.disableAlertBeforeUnload();
    const s = session.session;
    if (s && s.mode === "practice" && !s.review) quiz.saveResume(s);
  },

  startTimer() {
    const s = session.session;
    if (s.mode !== "exam") return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - s.t0) / 1000);
      const remain = s.minutes * 60 - elapsed;
      if (remain <= 0) {
        clearInterval(this.timer);
        this.setData({ timerText: "时间到！" });
        this.submitQuiz();
        return;
      }
      this.setData({
        timerText: `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, "0")}`,
      });
    };
    tick();
    this.timer = setInterval(tick, 1000);
  },

  render() {
    const s = session.session;
    if (!s) return;
    const idx = s.curIdx;
    const item = s.questions[idx];
    const q = item.q;
    const isExam = s.mode === "exam";
    const isReview = !!s.review;
    const marked = !!(s.marked && s.marked[idx]);
    const showJudge = !isExam && (marked || isReview);

    let options = [];
    if (q.type === "choice") {
      const chosen = s.answers[q.num] || [];
      options = item.opts.map((o) => {
        const checked = chosen.indexOf(o.disp) >= 0;
        let cls = "";
        if (showJudge) {
          const correct = (q.answer || []).indexOf(o.orig) >= 0;
          if (correct) cls = "correct";
          else if (checked) cls = "wrong";
        } else if (checked) {
          cls = "checked";
        }
        return { disp: o.disp, v: o.v, checked, cls };
      });
    }

    let showExplain = false;
    let explainTitle = "";
    let correctText = "";
    if (showJudge) {
      showExplain = true;
      const r = quiz.judge(item, s.answers);
      explainTitle = isReview ? "📖 参考答案" : r.ok ? "✅ 回答正确" : "❌ 回答错误";
      if (q.type === "choice") {
        correctText = r.correct
          .map((disp) => {
            const o = item.opts.find((x) => x.disp === disp);
            return `${disp}. ${o ? o.v : ""}`;
          })
          .join("\n");
      } else {
        correctText = r.correct[0] || "(无)";
      }
    }

    this.setData({
      ready: true,
      isExam,
      isReview,
      qNumText: `第 ${idx + 1} / ${s.questions.length} 题${q.num ? "  ·  题库 #" + q.num : ""}`,
      qText: q.text,
      qImage: q.image || "",
      qDesc: q.desc || "",
      type: q.type,
      options,
      fillValue: typeof s.answers[q.num] === "string" ? s.answers[q.num] : "",
      marked,
      showExplain,
      explainTitle,
      correctText,
      explain: q.explain || "",
      progressPct: ((idx + 1) / s.questions.length) * 100,
      isFav: quiz.isFav(s.bankName, q.num),
      prevDisabled: idx === 0,
      submitText: isExam ? "交卷" : "结束",
      showSubmit: !isReview,
      showJudgeBtn: !isExam && !marked && q.type === "fill",
    });
  },

  onOptionTap(e) {
    const s = session.session;
    if (!s || s.review) return;
    if (s.mode !== "exam" && s.marked && s.marked[s.curIdx]) return;
    const q = s.questions[s.curIdx].q;
    if (q.type !== "choice") return;
    const disp = e.currentTarget.dataset.disp;
    const cur = (s.answers[q.num] || []).slice();
    const i = cur.indexOf(disp);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(disp);
    s.answers[q.num] = cur;
    if (s.mode === "practice") quiz.saveResume(s);
    this.render();
  },

  onFillInput(e) {
    const s = session.session;
    if (!s || s.review) return;
    const q = s.questions[s.curIdx].q;
    s.answers[q.num] = e.detail.value;
  },

  judgeCurrent() {
    const s = session.session;
    if (!s) return;
    s.marked = s.marked || {};
    s.marked[s.curIdx] = true;
    this.render();
  },

  prev() {
    const s = session.session;
    if (!s || s.curIdx <= 0) return;
    s.curIdx--;
    this.render();
  },

  next() {
    const s = session.session;
    if (!s) return;
    const idx = s.curIdx;
    if (s.review) {
      if (idx < s.questions.length - 1) {
        s.curIdx++;
        this.render();
      } else {
        wx.showToast({ title: "已是最后一题", icon: "none" });
      }
      return;
    }
    if (s.mode === "practice" && !(s.marked && s.marked[idx])) {
      s.marked = s.marked || {};
      s.marked[idx] = true;
      const r = quiz.judge(s.questions[idx], s.answers);
      this.render();
      if (!r.ok) return;
    }
    if (idx < s.questions.length - 1) {
      s.curIdx++;
      this.render();
    } else {
      this.submitQuiz();
    }
  },

  clearAnswer() {
    const s = session.session;
    if (!s) return;
    const q = s.questions[s.curIdx].q;
    delete s.answers[q.num];
    if (s.marked) delete s.marked[s.curIdx];
    this.render();
  },

  toggleFav() {
    const s = session.session;
    if (!s) return;
    quiz.toggleFav(s.bankName, s.questions[s.curIdx].q.num);
    this.render();
  },

  async submitQuiz() {
    const s = session.session;
    if (!s) return;
    if (s.mode === "exam") {
      const ok = await modal("确认交卷？", "交卷后将统计成绩并记录本次错题。", "交卷", "再检查");
      if (!ok) return;
    }
    if (this.timer) clearInterval(this.timer);
    wx.disableAlertBeforeUnload();
    const summary = quiz.commitSession(s);
    if (s.mode === "practice") quiz.clearResume();
    session.result = Object.assign({}, summary, { mode: s.mode, bankName: s.bankName });
    wx.redirectTo({ url: "/pages/result/result" });
  },

  async quit() {
    const s = session.session;
    if (this.timer) clearInterval(this.timer);
    wx.disableAlertBeforeUnload();
    if (s && s.mode === "practice" && !s.review) quiz.saveResume(s);
    session.session = null;
    wx.navigateBack();
  },

  // 滑动手势
  onTouchStart(e) {
    this._sx = e.touches[0].clientX;
    this._sy = e.touches[0].clientY;
  },
  onTouchEnd(e) {
    if (this._sx == null) return;
    const dx = e.changedTouches[0].clientX - this._sx;
    const dy = e.changedTouches[0].clientY - this._sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) this.next();
      else this.prev();
    }
    this._sx = null;
  },
});

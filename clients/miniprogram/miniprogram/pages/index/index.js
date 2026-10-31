const bankUtil = require("../../utils/bank");
const quiz = require("../../utils/quiz");
const session = require("../../utils/session");
const store = require("../../utils/store");

const SCOPE_LABELS = ["全部题目", "仅错题本", "仅收藏", "随机抽取"];
const SCOPE_VALUES = ["all", "wrong", "fav", "random"];

Page({
  data: {
    loading: true,
    loadingText: "正在加载题库…",
    banks: [],
    bankNames: [],
    bankIndex: 0,
    hasBanks: false,
    mode: "practice",
    scopeIndex: 0,
    scope: "all",
    scopeLabels: SCOPE_LABELS,
    randomCount: 20,
    examMinutes: 60,
    scopeInfo: "",
  },

  onLoad() {
    this.init();
  },

  onShow() {
    if (!this.data.loading) this.refreshBankList();
  },

  async init() {
    try {
      const list = await bankUtil.ensureBanks((l, t) => {
        this.setData({ loadingText: `正在加载题库 ${l}/${t}…` });
      });
      session.banks = list;
      this.applyBankList(list);
      if (!list.length) {
        const errs = bankUtil.getLastErrors();
        wx.showModal({
          title: "题库加载失败",
          content: errs.length ? errs.join("\n\n") : "未获取到任何题库（可能云存储权限不足）",
          showCancel: false,
        });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "题库加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  refreshBankList() {
    const list = bankUtil.listBanks();
    session.banks = list;
    this.applyBankList(list);
  },

  applyBankList(list) {
    const savedName = store.get(store.KEYS.SELECTED_BANK, "");
    let idx = list.findIndex((b) => b.name === savedName);
    if (idx < 0) idx = 0;
    this.setData({
      banks: list,
      bankNames: list.map((b) => `${b.name} (${b.count || 0})`),
      bankIndex: idx,
      hasBanks: list.length > 0,
    });
    this.updateScopeInfo();
  },

  onBankChange(e) {
    const idx = Number(e.detail.value);
    const b = this.data.banks[idx];
    if (b) store.set(store.KEYS.SELECTED_BANK, b.name);
    this.setData({ bankIndex: idx });
    this.updateScopeInfo();
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onScopeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ scopeIndex: idx, scope: SCOPE_VALUES[idx] });
    this.updateScopeInfo();
  },

  onRandomCount(e) {
    this.setData({ randomCount: Number(e.detail.value) || 20 });
  },

  onExamMinutes(e) {
    this.setData({ examMinutes: Number(e.detail.value) || 60 });
  },

  updateScopeInfo() {
    const b = this.data.banks[this.data.bankIndex];
    if (!b) return;
    const total = b.count || 0;
    const scope = this.data.scope;
    let info = `共 ${total} 题`;
    if (scope === "wrong") info = `错题 ${quiz.wrongOf(b.name).length} 题`;
    if (scope === "fav") info = `收藏 ${quiz.favOf(b.name).length} 题`;
    this.setData({ scopeInfo: info });
  },

  async loadCurBank() {
    const b = this.data.banks[this.data.bankIndex];
    if (!b) return null;
    if (session.curBank && session.curBank.name === b.name) return session.curBank;
    const raw = bankUtil.readBank(b.path);
    const bank = bankUtil.normalizeBank(raw, b.name);
    session.curBank = bank;
    return bank;
  },

  rebuildFromResume(bank, resume) {
    return resume.items
      .map((it) => {
        const q = bank.questions.find((x) => x.num === it.num);
        if (!q) return null;
        let opts;
        if (!it.order || !it.order.length) {
          opts = (q.options || []).map((o) => ({ disp: "", orig: o.k, v: o.v }));
        } else {
          opts = it.order.map((orig, i) => ({
            disp: quiz.LETTERS[i],
            orig,
            v: (q.options.find((o) => o.k === orig) || {}).v || "",
          }));
        }
        return { q, opts };
      })
      .filter(Boolean);
  },

  async startQuiz() {
    const bank = await this.loadCurBank();
    if (!bank) return;
    const scope = this.data.scope;
    const mode = this.data.mode;

    // 练习模式：检测未完成进度
    if (mode === "practice") {
      const resume = quiz.loadResume();
      if (
        resume &&
        resume.bankName === bank.name &&
        resume.scope === scope &&
        quiz.hasResumeProgress(resume)
      ) {
        const goOn = await new Promise((resolve) => {
          wx.showModal({
            title: "继续上次练习？",
            content: `发现上次未完成的练习进度（第 ${resume.curIdx + 1}/${resume.items.length} 题）`,
            confirmText: "继续",
            cancelText: "重新开始",
            success: (r) => resolve(r.confirm),
            fail: () => resolve(false),
          });
        });
        if (goOn) {
          const items = this.rebuildFromResume(bank, resume);
          if (!items.length) {
            quiz.clearResume();
            wx.showToast({ title: "题库已更新，重新开始", icon: "none" });
          } else {
            session.session = {
              mode,
              scope,
              bankName: bank.name,
              questions: items,
              answers: resume.answers || {},
              marked: resume.marked || {},
              curIdx: Math.min(resume.curIdx, items.length - 1),
              t0: resume.t0 || Date.now(),
              minutes: 0,
            };
            wx.navigateTo({ url: "/pages/quiz/quiz" });
            return;
          }
        } else {
          quiz.clearResume();
        }
      }
    }

    const list = quiz.pickQuestions(bank, scope, this.data.randomCount);
    if (!list.length) {
      const msg =
        scope === "wrong" ? "错题本是空的，先刷几题吧！" : scope === "fav" ? "还没有收藏的题！" : "该范围没有题目";
      wx.showModal({ title: "提示", content: msg, showCancel: false });
      return;
    }
    const questions = quiz.buildQuestions(bank, quiz.shuffle(list));
    const minutes = mode === "exam" ? this.data.examMinutes : 0;
    session.lastStart = {
      mode,
      scope,
      randomCount: this.data.randomCount,
      examMinutes: this.data.examMinutes,
    };
    session.session = {
      mode,
      scope,
      bankName: bank.name,
      questions,
      answers: {},
      marked: {},
      curIdx: 0,
      t0: Date.now(),
      minutes,
    };
    wx.navigateTo({ url: "/pages/quiz/quiz" });
  },

  async goWrongBook() {
    const bank = await this.loadCurBank();
    if (!bank) return;
    wx.navigateTo({ url: "/pages/wrongbook/wrongbook" });
  },

  async goHistory() {
    await this.loadCurBank();
    wx.navigateTo({ url: "/pages/history/history" });
  },

  diagnose() {
    const FS = wx.getFileSystemManager();
    const p = `${wx.env.USER_DATA_PATH}/__diag.txt`;
    try {
      FS.writeFileSync(p, "hello-diagnose", "utf8");
    } catch (e) {}
    wx.showLoading({ title: "诊断中…" });
    wx.cloud.uploadFile({
      cloudPath: `diag/${Date.now()}.txt`,
      filePath: p,
      success: (res) => {
        const fileID = res.fileID;
        wx.cloud.downloadFile({
          fileID,
          success: () => {
            wx.hideLoading();
            wx.showModal({
              title: "诊断：成功",
              content: `上传+下载都OK\nfileID=${fileID}`,
              showCancel: false,
            });
          },
          fail: (e) => {
            wx.hideLoading();
            wx.showModal({
              title: "诊断：下载失败",
              content: `fileID=${fileID}\n下载错误: ${e.errMsg || JSON.stringify(e)}`,
              showCancel: false,
            });
          },
        });
      },
      fail: (e) => {
        wx.hideLoading();
        wx.showModal({
          title: "诊断：上传失败",
          content: `错误: ${e.errMsg || JSON.stringify(e)}`,
          showCancel: false,
        });
      },
    });
  },

  uploadBanksToCloud() {
    wx.chooseMessageFile({
      count: 10,
      type: "file",
      success: async (res) => {
        const files = res.tempFiles || [];
        if (!files.length) return;
        wx.showLoading({ title: `上传中 0/${files.length}` });
        const results = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const name = f.name || "";
          if (!/\.bank$/i.test(name)) {
            results.push(`${name}: 跳过(非.bank)`);
            continue;
          }
          wx.showLoading({ title: `上传中 ${i + 1}/${files.length}` });
          try {
            const r = await new Promise((resolve, reject) =>
              wx.cloud.uploadFile({
                cloudPath: "banks/" + name,
                filePath: f.path,
                success: resolve,
                fail: reject,
              })
            );
            results.push(`${name}: OK\n${r.fileID}`);
          } catch (e) {
            results.push(`${name}: 失败 ${e.errMsg || JSON.stringify(e)}`);
          }
        }
        wx.hideLoading();
        wx.showModal({ title: "上传结果", content: results.join("\n\n"), showCancel: false });
        this.refreshBankList();
      },
      fail: () => {},
    });
  },

  importBank() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const f = res.tempFiles[0];
        if (!f) return;
        const name = (f.name || "导入题库").replace(/\.(bank|json)$/i, "");
        try {
          const bank = bankUtil.importBankFile(f.path, name);
          wx.showToast({ title: `导入成功，共 ${bank.questions.length} 题`, icon: "none" });
          this.refreshBankList();
        } catch (e) {
          wx.showModal({ title: "导入失败", content: e.message || "格式不对", showCancel: false });
        }
      },
      fail: () => {},
    });
  },
});

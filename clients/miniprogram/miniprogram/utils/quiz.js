// 刷题核心逻辑（移植自 H5 版 index.html）
const store = require("./store");

const LETTERS = "ABCDEFGH";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 把题库题目构造成会话题目（选项乱序、重新分配显示字母）
function buildQuestions(bank, list) {
  return list.map((q) => {
    let opts;
    if (q.type === "choice") {
      const shuffled = shuffle(q.options.slice());
      opts = shuffled.map((o, i) => ({ disp: LETTERS[i], orig: o.k, v: o.v }));
    } else {
      opts = (q.options || []).map((o) => ({ disp: "", orig: o.k, v: o.v }));
    }
    return { q, opts };
  });
}

// 按范围挑题
function pickQuestions(bank, scope, randomCount) {
  if (scope === "wrong") {
    const nums = wrongOf(bank.name);
    return bank.questions.filter((q) => nums.indexOf(q.num) >= 0);
  }
  if (scope === "fav") {
    const nums = favOf(bank.name);
    return bank.questions.filter((q) => nums.indexOf(q.num) >= 0);
  }
  if (scope === "random") {
    const n = Math.min(randomCount || 20, bank.questions.length);
    return shuffle(bank.questions).slice(0, n);
  }
  return bank.questions.slice();
}

// 判题：返回 { ok, chosen, correct }
// answers 为该题的作答；item 为 { q, opts }
function judge(item, answers) {
  const q = item.q;
  const my = answers[q.num];
  if (q.type === "fill") {
    const val = (my || "").toString().trim().replace(/\s+/g, "");
    const std = ((q.answer || [""])[0] || "").trim().replace(/\s+/g, "");
    const ok = val !== "" && (val === std || val.toUpperCase() === std.toUpperCase());
    return { ok, correct: [std] };
  }
  const chosenDisp = my || [];
  const chosenOrig = chosenDisp.map((d) => {
    const o = item.opts.find((x) => x.disp === d);
    return o ? o.orig : d;
  });
  const correct = q.answer || [];
  const ok =
    chosenOrig.length === correct.length && correct.every((a) => chosenOrig.indexOf(a) >= 0);
  const correctDisp = item.opts
    .filter((o) => correct.indexOf(o.orig) >= 0)
    .map((o) => o.disp);
  return { ok, chosen: chosenDisp, correct: correctDisp };
}

/* ===== 错题本 ===== */
function wrongOf(bankName) {
  return store.get(store.KEYS.WRONG, {})[bankName] || [];
}
function saveWrong(bankName, nums) {
  const all = store.get(store.KEYS.WRONG, {});
  all[bankName] = Array.from(new Set(nums));
  store.set(store.KEYS.WRONG, all);
}

/* ===== 收藏 ===== */
function favOf(bankName) {
  return store.get(store.KEYS.FAV, {})[bankName] || [];
}
function saveFav(bankName, nums) {
  const all = store.get(store.KEYS.FAV, {});
  all[bankName] = Array.from(new Set(nums));
  store.set(store.KEYS.FAV, all);
}
function isFav(bankName, num) {
  return favOf(bankName).indexOf(num) >= 0;
}
function toggleFav(bankName, num) {
  const cur = favOf(bankName);
  if (cur.indexOf(num) >= 0) saveFav(bankName, cur.filter((n) => n !== num));
  else saveFav(bankName, cur.concat([num]));
}

/* ===== 交卷：写入错题/错题日志/统计/历史 ===== */
function commitSession(session) {
  const results = session.questions.map((item) => ({ item, r: judge(item, session.answers) }));
  const total = results.length;
  const correct = results.filter((x) => x.r.ok).length;
  const wrongs = results.filter((x) => !x.r.ok);
  const elapsed = Math.floor((Date.now() - session.t0) / 1000);

  // 错题集合
  const wrongSet = new Set(wrongOf(session.bankName));
  wrongs.forEach((x) => wrongSet.add(x.item.q.num));
  const correctNums = new Set(results.filter((x) => x.r.ok).map((x) => x.item.q.num));
  saveWrong(session.bankName, Array.from(wrongSet).filter((n) => !correctNums.has(n)));

  // 考试错题日志
  if (session.mode === "exam") {
    const wronglog = store.get(store.KEYS.WRONGLOG, {});
    const wl = wronglog[session.bankName] || [];
    wl.unshift({
      ts: Date.now(),
      mode: session.mode,
      date: fmtDate(Date.now()),
      wrongNums: wrongs.map((x) => x.item.q.num),
      qNums: session.questions.map((x) => x.q.num),
      total,
      correct,
    });
    wronglog[session.bankName] = wl.slice(0, 200);
    store.set(store.KEYS.WRONGLOG, wronglog);
  }

  // 每题做次/错次
  const stat = store.get(store.KEYS.STAT, {});
  const st = stat[session.bankName] || {};
  results.forEach((x) => {
    const num = x.item.q.num;
    const rec = st[num] || { tries: 0, wrong: 0 };
    rec.tries++;
    if (!x.r.ok) rec.wrong++;
    st[num] = rec;
  });
  stat[session.bankName] = st;
  store.set(store.KEYS.STAT, stat);

  // 历史成绩
  const history = store.get(store.KEYS.HISTORY, []);
  history.unshift({
    ts: Date.now(),
    bank: session.bankName,
    mode: session.mode,
    total,
    correct,
    wrong: total - correct,
    score: total ? Math.round((correct / total) * 100) : 0,
    time: `${Math.floor(elapsed / 60)}分${elapsed % 60}秒`,
    date: fmtDate(Date.now()),
  });
  store.set(store.KEYS.HISTORY, history.slice(0, 200));

  return {
    total,
    correct,
    wrong: total - correct,
    elapsed,
    score: total ? Math.round((correct / total) * 100) : 0,
  };
}

/* ===== 练习续做 ===== */
function saveResume(session) {
  if (!session || session.mode !== "practice" || session.review || !session.scope) return;
  const items = session.questions.map((it) => ({
    num: it.q.num,
    order: it.q.type === "choice" ? it.opts.map((o) => o.orig) : [],
  }));
  store.set(store.KEYS.RESUME, {
    bankName: session.bankName,
    scope: session.scope,
    curIdx: session.curIdx,
    answers: session.answers || {},
    marked: session.marked || {},
    items,
    t0: session.t0,
  });
}
function loadResume() {
  return store.get(store.KEYS.RESUME, null);
}
function clearResume() {
  store.remove(store.KEYS.RESUME);
}
function hasResumeProgress(resume) {
  const answers = resume.answers || {};
  return resume.curIdx > 0 || Object.keys(answers).length > 0;
}

/* ===== 统计排行 ===== */
function rankStat(stat) {
  return Object.keys(stat)
    .map((num) => Object.assign({ num: Number(num) }, stat[num], { rate: stat[num].wrong / stat[num].tries }))
    .filter((r) => r.tries > 0)
    .sort((a, b) => b.rate - a.rate || a.num - b.num);
}

function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

module.exports = {
  LETTERS,
  shuffle,
  buildQuestions,
  pickQuestions,
  judge,
  wrongOf,
  saveWrong,
  favOf,
  saveFav,
  isFav,
  toggleFav,
  commitSession,
  saveResume,
  loadResume,
  clearResume,
  hasResumeProgress,
  rankStat,
  fmtDate,
};

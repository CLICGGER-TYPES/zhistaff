// 题库加载：云存储下载 -> USER_DATA_PATH 缓存 -> 读取解析
const config = require("../config");
const store = require("./store");

const FS = wx.getFileSystemManager();
const BANKS_DIR = `${wx.env.USER_DATA_PATH}/banks`;

function ensureDir() {
  try {
    FS.accessSync(BANKS_DIR);
  } catch (e) {
    try {
      FS.mkdirSync(BANKS_DIR, true);
    } catch (e2) {}
  }
}

function safeName(name) {
  return name.replace(/[^\w\u4e00-\u9fa5-]+/g, "_");
}

function fileExists(path) {
  try {
    FS.accessSync(path);
    return true;
  } catch (e) {
    return false;
  }
}

function readBank(path) {
  const raw = FS.readFileSync(path, "utf8");
  return JSON.parse(raw);
}

// 统一题库结构，过滤标记为 bad 的题
function normalizeBank(raw, name) {
  if (!raw || !Array.isArray(raw.questions)) throw new Error("格式不对");
  return {
    name: raw.name || name,
    questions: raw.questions
      .filter((q) => q && !(q.meta && q.meta.bad))
      .map((q) => ({
        num: q.num,
        type: q.type || (q.options && q.options.length ? "choice" : "fill"),
        text: q.text || "",
        options: q.options || [],
        answer: q.answer || null,
        explain: q.explain || "",
        image: q.image || null,
        desc: q.desc || "",
        meta: q.meta || {},
      })),
  };
}

let lastErrors = [];

function downloadOne(bank) {
  return new Promise((resolve) => {
    wx.cloud.downloadFile({
      fileID: bank.fileID,
      success: (res) => {
        const dest = `${BANKS_DIR}/${safeName(bank.name)}.bank`;
        try {
          FS.saveFileSync(res.tempFilePath, dest);
          resolve({ name: bank.name, path: dest });
        } catch (e) {
          const msg = `saveFile ${bank.name}: ${e.message || JSON.stringify(e)}`;
          lastErrors.push(msg);
          console.warn(msg);
          resolve(null);
        }
      },
      fail: (err) => {
        const msg = `download ${bank.name}: ${err.errMsg || err.message || JSON.stringify(err)}`;
        lastErrors.push(msg);
        console.warn(msg, err);
        resolve(null);
      },
    });
  });
}

function getLastErrors() {
  return lastErrors.slice();
}

// 确保内置题库已缓存；onProgress(loaded, total)
async function ensureBanks(onProgress) {
  ensureDir();
  lastErrors = [];
  const files = store.get(store.KEYS.BANK_FILES, {});
  const counts = store.get(store.KEYS.BANK_COUNTS, {});
  const result = [];
  const total = config.BANKS.length;
  let loaded = 0;
  for (const bank of config.BANKS) {
    let path = files[bank.name];
    if (!path || !fileExists(path)) {
      const r = await downloadOne(bank);
      if (r) {
        files[bank.name] = r.path;
        path = r.path;
        delete counts[bank.name];
      }
    }
    if (path && fileExists(path)) {
      if (counts[bank.name] == null) {
        try {
          counts[bank.name] = normalizeBank(readBank(path), bank.name).questions.length;
        } catch (e) {}
      }
      result.push({ name: bank.name, path, count: counts[bank.name] || 0 });
    }
    loaded++;
    if (onProgress) onProgress(loaded, total);
  }
  store.set(store.KEYS.BANK_FILES, files);
  store.set(store.KEYS.BANK_COUNTS, counts);
  return result;
}

// 列出所有可用题库（内置 + 导入）
function listBanks() {
  const files = store.get(store.KEYS.BANK_FILES, {});
  const counts = store.get(store.KEYS.BANK_COUNTS, {});
  const custom = store.get(store.KEYS.CUSTOM_BANKS, []);
  const out = [];
  for (const name of Object.keys(files)) {
    if (fileExists(files[name])) out.push({ name, path: files[name], count: counts[name] || 0 });
  }
  for (const c of custom) {
    if (fileExists(c.path) && !out.find((x) => x.name === c.name)) {
      out.push({ name: c.name, path: c.path, count: c.count || 0 });
    }
  }
  return out;
}

// 从临时文件导入题库（wx.chooseMessageFile 得到 tempFilePath）
function importBankFile(tempFilePath, fallbackName) {
  ensureDir();
  const dest = `${BANKS_DIR}/custom_${safeName(fallbackName)}_${Date.now()}.bank`;
  FS.copyFileSync(tempFilePath, dest);
  const bank = normalizeBank(readBank(dest), fallbackName);
  const custom = store.get(store.KEYS.CUSTOM_BANKS, []).filter(
    (c) => c.name !== bank.name
  );
  custom.push({ name: bank.name, path: dest });
  store.set(store.KEYS.CUSTOM_BANKS, custom);
  return bank;
}

module.exports = {
  ensureBanks,
  listBanks,
  readBank,
  normalizeBank,
  importBankFile,
  fileExists,
  getLastErrors,
};

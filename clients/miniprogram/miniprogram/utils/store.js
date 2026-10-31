// 本地存储封装（替代 H5 的 localStorage / Capacitor Preferences）
const KEYS = {
  HISTORY: "zz_quiz_history_v1",
  WRONG: "zz_quiz_wrong_v1",
  FAV: "zz_quiz_fav_v1",
  WRONGLOG: "zz_quiz_wronglog_v1",
  STAT: "zz_quiz_stat_v1",
  RESUME: "zz_practice_resume_v1",
  FAB_POS: "zz_fab_pos_v1",
  SELECTED_BANK: "zz_selected_bank_v1",
  BANK_FILES: "zz_bank_files_v1", // { name: savedFilePath }
  BANK_COUNTS: "zz_bank_counts_v1", // { name: count }
  CUSTOM_BANKS: "zz_custom_banks_v1", // [{ name, path }] 导入的题库
};

function get(key, def) {
  try {
    const v = wx.getStorageSync(key);
    return v === "" || v === undefined || v === null ? def : v;
  } catch (e) {
    return def;
  }
}

function set(key, val) {
  try {
    wx.setStorageSync(key, val);
  } catch (e) {
    console.warn("setStorage 失败", key, e);
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {}
}

module.exports = { KEYS, get, set, remove };

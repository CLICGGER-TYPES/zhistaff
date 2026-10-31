// 跨页面共享状态（题库列表、当前题库、当前会话）
module.exports = {
  banks: [], // [{ name, path }]
  curBank: null, // { name, questions: [] }
  session: null, // 当前答题会话
};

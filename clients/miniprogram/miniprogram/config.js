// 云开发与题库配置
//
// ⚠️ ENV_ID 和 fileID 都需要换成你自己的：
//  1. 在微信开发者工具里开通云开发，拿到环境 ID，填到 ENV_ID
//  2. 把 .bank 上传到云存储，把返回的 fileID 填进 BANKS
//  3. 也可以用云函数 cloudfunctions/initbanks 一次性批量上传，它会返回所有 fileID
module.exports = {
  // 云开发环境 ID（换成你自己的）
  ENV_ID: "",

  // 内置题库清单。留空表示不预置，用户从云端拉取或手动导入 .bank
  // 格式：
  //   { name: "显示名", fileID: "云存储返回的 fileID" }
  BANKS: [],
};

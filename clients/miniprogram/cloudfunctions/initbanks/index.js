const cloud = require("wx-server-sdk");
const fs = require("fs");
const path = require("path");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 把内置题库通过云 API 上传到云存储（生成可被客户端解析的 fileID）
// 入参: { name?: "xxx.bank" } 只传一个；不传则全部
exports.main = async (event) => {
  const only = event && event.name;
  const dir = path.join(__dirname, "banks");
  let files = fs.readdirSync(dir).filter((f) => f.endsWith(".bank"));
  if (only) files = files.filter((f) => f === only);
  const uploaded = [];
  for (const f of files) {
    const res = await cloud.uploadFile({
      cloudPath: "banks/" + f,
      fileContent: fs.readFileSync(path.join(dir, f)),
    });
    uploaded.push({ file: f, fileID: res.fileID });
  }
  return { ok: true, uploaded };
};

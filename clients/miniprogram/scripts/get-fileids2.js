// 通过 CI 内部接口取云存储文件的真实 fileID
// 用法: node scripts/get-fileids2.js <envId>
const ci = require("miniprogram-ci");
const path = require("path");
const { getSignature } = require("miniprogram-ci/dist/utils/sign");
const { request } = require("miniprogram-ci/dist/utils/request");
const urlConfig = require("miniprogram-ci/dist/config/url.config");
const { initEnvironmentByProject } = require("miniprogram-ci/dist/ci/cloud/utils");

const APPID = process.env.WX_APPID || require("../project.config.json").appid;
const _OWNER_NOTE = "APPID 请填自己小程序的，见 project.config.json";
const PROJECT_PATH = path.resolve(__dirname, "..");
const PRIVATE_KEY = path.join(PROJECT_PATH, ".keys", `private.${APPID}.key`);
// 题库文件名从仓库根的 bank/ 目录自动读取；也可用 BANK_FILES 环境变量指定（逗号分隔）
const fs = require("fs");
const BANK_DIR = path.resolve(PROJECT_PATH, "..", "..", "bank");
const FILES = process.env.BANK_FILES
  ? process.env.BANK_FILES.split(",").map((s) => s.trim()).filter(Boolean)
  : fs.existsSync(BANK_DIR)
    ? fs.readdirSync(BANK_DIR).filter((f) => f.endsWith(".bank"))
    : [];

async function main() {
  const env = process.argv[2];
  const project = new ci.Project({
    appid: APPID,
    type: "miniProgram",
    projectPath: PROJECT_PATH,
    privateKeyPath: PRIVATE_KEY,
    ignores: ["node_modules/**/*", ".keys/**/*", "scripts/**/*"],
  });
  const { currentEnv } = await initEnvironmentByProject(project, env);
  const bucket = currentEnv.storages[0].bucket;
  const keys = FILES.map((f) => "banks/" + f);
  const signature = await getSignature(project.privateKey, project.appid);
  const extAppid = await project.getExtAppid();
  const { resp, body } = await request({
    url: urlConfig.cloudCosUploadURL,
    method: "post",
    body: JSON.stringify({
      appid: project.appid,
      extAppid: extAppid || undefined,
      signature,
      action: "CLOUD_ROUTE_GETCOSMETA",
      agentReq: { action: "batchencode", bucket, mpappid: project.appid, paths: keys },
    }),
    headers: { "content-type": "application/json" },
  });
  console.log("status:", resp && resp.statusCode);
  console.log("body:", typeof body === "string" ? body : JSON.stringify(body));
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

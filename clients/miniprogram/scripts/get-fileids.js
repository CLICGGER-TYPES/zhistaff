// 读取云存储 bucket，拼出 4 个题库的 fileID
// 用法: node scripts/get-fileids.js <envId>
const ci = require("miniprogram-ci");
const path = require("path");
const {
  initEnvironmentByProject,
} = require("miniprogram-ci/dist/ci/cloud/utils");

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
  console.log("envId:", currentEnv.envId);
  console.log("storages:", JSON.stringify(currentEnv.storages, null, 2));
  const bucket = currentEnv.storages && currentEnv.storages[0] && currentEnv.storages[0].bucket;
  const fileIds = {};
  FILES.forEach((f) => {
    fileIds[f] = `cloud://${env}.${bucket}/banks/${f}`;
  });
  console.log("FILEIDS:", JSON.stringify(fileIds, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

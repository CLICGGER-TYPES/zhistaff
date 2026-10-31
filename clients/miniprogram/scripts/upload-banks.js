// 把 4 个题库 .bank 上传到云开发存储
// 用法: node scripts/upload-banks.js <envId>
const ci = require("miniprogram-ci");
const path = require("path");
const fs = require("fs");

const APPID = process.env.WX_APPID || require("../project.config.json").appid;
const _OWNER_NOTE = "APPID 请填自己小程序的，见 project.config.json";
const PROJECT_PATH = path.resolve(__dirname, "..");
const PRIVATE_KEY = path.join(PROJECT_PATH, ".keys", `private.${APPID}.key`);
const BANKS_DIR = path.resolve(PROJECT_PATH, "..", "..", "bank");

async function main() {
  const env = process.argv[2];
  if (!env) {
    console.error("用法: node scripts/upload-banks.js <envId>");
    process.exit(1);
  }
  if (!fs.existsSync(BANKS_DIR)) {
    console.error("题库目录不存在:", BANKS_DIR);
    process.exit(1);
  }
  console.log("本地题库:", fs.readdirSync(BANKS_DIR).filter((f) => f.endsWith(".bank")));

  const project = new ci.Project({
    appid: APPID,
    type: "miniProgram",
    projectPath: PROJECT_PATH,
    privateKeyPath: PRIVATE_KEY,
    ignores: ["node_modules/**/*", ".keys/**/*", "scripts/**/*"],
  });

  const result = await ci.cloud.uploadStorage({
    project,
    env,
    path: BANKS_DIR,
    remotePath: "banks",
  });
  console.log("UPLOAD RESULT:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

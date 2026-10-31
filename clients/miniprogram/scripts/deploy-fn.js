// 部署云函数
// 用法: node scripts/deploy-fn.js <envId> <fnName>
const ci = require("miniprogram-ci");
const path = require("path");

const APPID = process.env.WX_APPID || require("../project.config.json").appid;
const _OWNER_NOTE = "APPID 请填自己小程序的，见 project.config.json";
const PROJECT_PATH = path.resolve(__dirname, "..");
const PRIVATE_KEY = path.join(PROJECT_PATH, ".keys", `private.${APPID}.key`);

async function main() {
  const env = process.argv[2];
  const name = process.argv[3] || "initbanks";
  const project = new ci.Project({
    appid: APPID,
    type: "miniProgram",
    projectPath: PROJECT_PATH,
    privateKeyPath: PRIVATE_KEY,
    ignores: ["node_modules/**/*", ".keys/**/*", "scripts/**/*"],
  });
  const result = await ci.cloud.uploadFunction({
    project,
    env,
    name,
    path: path.join(PROJECT_PATH, "cloudfunctions", name),
    remoteNpmInstall: true,
  });
  console.log("DEPLOY DONE:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

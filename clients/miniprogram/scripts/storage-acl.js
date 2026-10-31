// 查看/修改云存储安全规则（storage 读写权限）
// 用法:
//   node scripts/storage-acl.js describe <envId>
//   node scripts/storage-acl.js set-public <envId>
const ci = require("miniprogram-ci");
const path = require("path");
const cloudAPI = require("miniprogram-ci/dist/common/cloud-api");
const { boundTransactRequest } = require("miniprogram-ci/dist/ci/cloud/cloudapi");
const { initEnvironmentByProject } = require("miniprogram-ci/dist/ci/cloud/utils");

const APPID = process.env.WX_APPID || require("../project.config.json").appid;
const _OWNER_NOTE = "APPID 请填自己小程序的，见 project.config.json";
const PROJECT_PATH = path.resolve(__dirname, "..");
const PRIVATE_KEY = path.join(PROJECT_PATH, ".keys", `private.${APPID}.key`);

function ctx(project) {
  const r = { request: boundTransactRequest(project), transactType: cloudAPI.TransactType.IDE };
  cloudAPI.setRequest(boundTransactRequest(project));
  cloudAPI.setTransactType(cloudAPI.TransactType.IDE);
  return r;
}

async function main() {
  const cmd = process.argv[2];
  const env = process.argv[3];
  const project = new ci.Project({
    appid: APPID,
    type: "miniProgram",
    projectPath: PROJECT_PATH,
    privateKeyPath: PRIVATE_KEY,
    ignores: ["node_modules/**/*", ".keys/**/*", "scripts/**/*"],
  });
  await initEnvironmentByProject(project, env);
  const c = ctx(project);

  if (cmd === "describe") {
    const r = await cloudAPI.tcbDescribeSafeRule({ envId: env }, c);
    console.log("SAFE RULE:", JSON.stringify(r, null, 2));
  } else if (cmd === "acl") {
    const r = await cloudAPI.tcbGetStorageACL({ envId: env }, c);
    console.log("STORAGE ACL:", JSON.stringify(r, null, 2));
  } else if (cmd === "set-public") {
    // 所有用户可读，仅创建者可写
    const rule = { read: true, write: "auth != null" };
    const r = await cloudAPI.tcbModifySafeRule(
      { envId: env, collectionName: "storage", aclTag: "CUSTOM", rule: JSON.stringify(rule) },
      c
    );
    console.log("MODIFY RESULT:", JSON.stringify(r, null, 2));
  } else {
    console.log("用法: describe|acl|set-public <envId>");
  }
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

// 取 4 个题库对象的 x-cos-meta-fileid（真实 fileID）
const ci = require("miniprogram-ci");
const path = require("path");
const COS = require("cos-nodejs-sdk-v5");
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

async function ciCall(project, action, agentReq) {
  const signature = await getSignature(project.privateKey, project.appid);
  const extAppid = await project.getExtAppid();
  const { body } = await request({
    url: urlConfig.cloudCosUploadURL,
    method: "post",
    body: JSON.stringify({ appid: project.appid, extAppid: extAppid || undefined, signature, action, agentReq }),
    headers: { "content-type": "application/json" },
  });
  const l = typeof body === "string" ? JSON.parse(body) : body;
  if (l.errCode) throw new Error(l.errCode + " " + l.errMsg);
  return JSON.parse(l.data.content);
}

function head(cos, bucket, region, key) {
  return new Promise((resolve) => {
    cos.headObject({ Bucket: bucket, Region: region, Key: key }, (err, data) => {
      resolve(err ? { err: err.message } : data.headers);
    });
  });
}

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
  const st = currentEnv.storages[0];
  const auth = await ciCall(project, "CLOUD_ROUTE_GETCOSAUTH", { region: st.region, bucket: st.bucket });
  const cred = auth.Response.Credentials;
  const cos = new COS({ SecretId: cred.TmpSecretId, SecretKey: cred.TmpSecretKey, SecurityToken: cred.Token });
  const out = {};
  for (const f of FILES) {
    const h = await head(cos, st.bucket, st.region, "banks/" + f);
    out[f] = h["x-cos-meta-fileid"] || h.err || "none";
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

// 用 CI 的 COS 临时凭证检查云存储对象是否存在/可读
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

async function ciCall(project, action, agentReq) {
  const signature = await getSignature(project.privateKey, project.appid);
  const extAppid = await project.getExtAppid();
  const { body } = await request({
    url: urlConfig.cloudCosUploadURL,
    method: "post",
    body: JSON.stringify({
      appid: project.appid,
      extAppid: extAppid || undefined,
      signature,
      action,
      agentReq,
    }),
    headers: { "content-type": "application/json" },
  });
  const l = typeof body === "string" ? JSON.parse(body) : body;
  if (l.errCode) throw new Error(l.errCode + " " + l.errMsg);
  return JSON.parse(l.data.content);
}

async function main() {
  const env = process.argv[2];
  const key = process.argv[3] || "banks/example.bank";
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
  const cred = auth.Response && auth.Response.Credentials;
  console.log("got creds:", !!cred);
  const cos = new COS({
    SecretId: cred.TmpSecretId,
    SecretKey: cred.TmpSecretKey,
    SecurityToken: cred.Token,
  });
  cos.headObject({ Bucket: st.bucket, Region: st.region, Key: key }, (err, data) => {
    if (err) {
      console.log("HEAD ERR:", JSON.stringify(err));
    } else {
      console.log("HEAD OK:", JSON.stringify(data));
    }
    // 生成签名下载 URL
    const url = cos.getObjectUrl(
      { Bucket: st.bucket, Region: st.region, Key: key, Sign: true, Expires: 600 },
      (e, d) => {
        console.log("SIGNED URL:", e ? "err " + e.message : d.Url);
      }
    );
  });
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

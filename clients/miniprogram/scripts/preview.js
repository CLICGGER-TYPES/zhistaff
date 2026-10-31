const ci = require("miniprogram-ci");
const path = require("path");

const APPID = process.env.WX_APPID || require("../project.config.json").appid;
const _OWNER_NOTE = "APPID 请填自己小程序的，见 project.config.json";
const PROJECT_PATH = path.resolve(__dirname, "..");
const PRIVATE_KEY = path.join(PROJECT_PATH, ".keys", `private.${APPID}.key`);

async function main() {
  const project = new ci.Project({
    appid: APPID,
    type: "miniProgram",
    projectPath: PROJECT_PATH,
    privateKeyPath: PRIVATE_KEY,
    ignores: ["node_modules/**/*", ".keys/**/*", "scripts/**/*", "cloudfunctions/**/*"],
  });

  const mode = process.argv[2] || "preview";
  const outDir = path.join(PROJECT_PATH, "dist");
  require("fs").mkdirSync(outDir, { recursive: true });

  if (mode === "upload") {
    const result = await ci.upload({
      project,
      version: process.argv[3] || "1.0.0",
      desc: process.argv[4] || "知杖刷题",
      setting: { es6: true, minify: true },
      onProgressUpdate: console.log,
    });
    console.log("UPLOAD DONE", result);
  } else {
    const result = await ci.preview({
      project,
      desc: "preview",
      setting: { es6: true, minify: false },
      qrcodeFormat: "image",
      qrcodeOutputDest: path.join(outDir, "preview.png"),
      onProgressUpdate: console.log,
    });
    console.log("PREVIEW DONE", result);
  }
}

main().catch((e) => {
  console.error("FAILED:", e && e.message ? e.message : e);
  process.exit(1);
});

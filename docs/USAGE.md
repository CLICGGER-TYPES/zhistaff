# 使用教程

## 一、网页版（最简单）

不需要安装任何东西，不需要构建。

### 启动

在仓库根目录起一个静态服务器：

```bash
python3 -m http.server 8080
```

浏览器打开 <http://localhost:8080>。

> 必须用 http 服务器，不能直接双击 `index.html`。
> 因为页面用 `fetch()` 加载 `bank/` 下的题库，`file://` 协议下浏览器会拦截。

### 导入题库

首次打开时题库是空的。两种方式：

**方式一：自动加载内置题库**

把 `.bank` 文件放进 `bank/` 目录，文件名要出现在 `index.html` 的 `BUNDLED_BANKS` 列表里：

```js
const BUNDLED_BANKS = ["bank/你的题库.bank"];   // 有几个写几个
```

刷新页面就会自动导入。

**方式二：手动导入**

点右上角「导入题库」，选任意 `.bank` 文件。导入后存在浏览器本地（IndexedDB），下次打开还在。

### 刷题流程

界面分三步：

```
① 选题库  →  ② 选模式 + 范围  →  ③ 开始刷题
```

**选模式**

| 模式 | 说明 |
|---|---|
| 练习 | 答完立刻看对错和解析，不计时 |
| 考试 | 限时（默认 60 分钟），交卷后才出结果，带答题卡 |

**选范围**

| 范围 | 说明 |
|---|---|
| 全部题目 | 当前题库的所有题（不含 `meta.bad` 的残缺题） |
| 仅错题本 | 只刷之前答错过的题 |
| 仅收藏 | 只刷点过收藏的题 |
| 随机抽取 | 从全部题里随机抽 N 道，N 可自己填（默认 20） |

选定后点「开始刷题」。

### 答题界面

- 选项点一下就是选中，多选题可以选多个
- 底部按钮：上一题 / 下一题 / 清空答案
- 右下角悬浮按钮：收藏本题
- 练习模式下答完立即显示对错和解析

### 断点续答

中途关掉页面不会丢进度。下次打开同一题库、同一范围时，会提示从上次的位置继续。

### 错题本 / 收藏 / 历史

首页三个入口：

- **错题本**：按科目列出错题，可以只看、重做、或从错题本移除
- **历史成绩**：每次刷题/考试的成绩记录，含正确率排行（Chart.js 画图）
- **收藏**：答题页右下角点星标，在「仅收藏」范围里重刷

### 数据存哪

全部在浏览器本地：IndexedDB 存题库和答题记录，localStorage 存偏好设置。

**清浏览器数据会全部丢失**。想备份的话，题库文件本身在 `bank/` 目录，重新导入即可；错题和收藏记录没法导出。

---

## 二、微信小程序

```
clients/miniprogram/
```

云开发架构，题库托管在云存储，客户端通过 `fileID` 拉取。

### 首次配置

仓库里的 `project.config.json` 的 `appid` 是 `touristappid`（微信开发者工具的游客模式占位符），需要换成你自己的：

1. 把 `clients/miniprogram/project.config.json` 的 `appid` 改成你的小程序 APPID
   （`scripts/` 下的所有脚本都从这个文件读 APPID，改一处即可；也可以用环境变量 `WX_APPID` 覆盖）
2. 开通云开发，拿到环境 ID，填到 `clients/miniprogram/miniprogram/config.js` 的 `ENV_ID`
3. 把 `.bank` 上传到云存储，把返回的 `fileID` 填进同一个文件的 `BANKS` 数组

### 上传题库

`clients/miniprogram/scripts/` 下有一批脚本（上传题库、预览、部署云函数等），需要小程序上传私钥：

```
clients/miniprogram/.keys/private.<APPID>.key
```

**这个私钥已经在 `.gitignore` 里排除，不要提交。** 去微信公众平台「开发管理 → 开发设置 → 小程序代码上传密钥」自己下载。

### 开发调试

用微信开发者工具直接打开 `clients/miniprogram/` 目录。

---

## 三、Android

```
clients/android/
```

Capacitor 把网页版包成 APK。

```bash
cd clients/android
npm install
npx cap sync android      # 把 www/ 同步进原生工程
cd android
./gradlew assembleDebug
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`。

`www/` 是构建产物（网页版 + 题库的拷贝），已在 `.gitignore` 中排除。改完 `index.html` 后重新 `npx cap sync android` 即可。

---

## 四、制作自己的题库

见 [`BANK_FORMAT.md`](./BANK_FORMAT.md)。最短路径：

```bash
uv run --with pymupdf python tools/build_bank.py 我的题库.pdf bank/我的题库.bank "科目名"
```

然后把生成的 `.bank` 放进 `bank/` 或直接网页版手动导入。

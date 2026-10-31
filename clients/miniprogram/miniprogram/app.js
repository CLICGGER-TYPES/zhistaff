const config = require("./config");

App({
  globalData: {
    env: config.ENV_ID,
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }
    wx.cloud.init({
      env: config.ENV_ID,
      traceUser: true,
    });
  },
});

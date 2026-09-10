import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  // 1. 指定测试运行器与测试文件目录
  runner: 'local',
  specs: [
    './test/e2e-android/**/*.spec.js'
  ],
  maxInstances: 1,

  // 2. 连接本地 Appium 端口
  port: 4723,
  path: '/',

  // 3. Android 混合应用 Capability 配置
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android Emulator',
    // 指向工程当前已生成的 debug APK 路径
    'appium:app': path.resolve(__dirname, './android/app/build/outputs/apk/debug/app-debug.apk'),
    // capacitor.config.json 中定义的 appId
    'appium:appPackage': 'com.guardiandapp.mobile',
    'appium:appActivity': 'com.guardiandapp.mobile.MainActivity',

    // 关键配置：让 Appium 自动下载与当前 Android 设备 WebView 版本匹配的 ChromeDriver
    'appium:chromedriverAutodownload': true,
    'appium:autoGrantPermissions': true,
    'appium:noReset': false,
    'appium:newCommandTimeout': 240,
  }],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 20000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // 框架与报告器
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000
  },

  // 自动管理 Appium 服务
  services: [
    ['appium', {
      args: {
        relaxedSecurity: true
      },
      logPath: './'
    }]
  ]
};

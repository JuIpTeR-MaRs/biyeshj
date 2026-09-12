import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 自动检测并补齐 ANDROID_HOME 与 ANDROID_SDK_ROOT 环境变量（解决 Appium 报找不到 Android SDK 的问题）
const defaultSdkPath = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
if (!process.env.ANDROID_HOME && fs.existsSync(defaultSdkPath)) {
  process.env.ANDROID_HOME = defaultSdkPath;
}
if (!process.env.ANDROID_SDK_ROOT && fs.existsSync(defaultSdkPath)) {
  process.env.ANDROID_SDK_ROOT = defaultSdkPath;
}

// 自动将 adb 和 emulator 工具目录注入 PATH
if (process.env.ANDROID_HOME) {
  const platformTools = path.join(process.env.ANDROID_HOME, 'platform-tools');
  const emulatorDir = path.join(process.env.ANDROID_HOME, 'emulator');
  if (!process.env.PATH.includes(platformTools)) {
    process.env.PATH = `${platformTools};${emulatorDir};${process.env.PATH}`;
  }
}

export const config = {
  // 1. 设置本地 runner
  runner: 'local',

  // 指定测试脚本路径
  specs: [
    './test/e2e/android.spec.js'
  ],
  maxInstances: 1,

  // 2. 连接 Appium 默认端口
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',

  // 3. Android 混合应用 Capability 配置
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    // 匹配本地运行的 Android 模拟器
    'appium:deviceName': process.env.ANDROID_DEVICE_NAME || 'Android Emulator',
    // 本地已有的 AVD 镜像名称（如未预先启动模拟器，Appium 可自动唤起）
    'appium:avd': process.env.ANDROID_AVD || 'Resizable_Experimental',
    'appium:avdLaunchTimeout': 180000,
    'appium:avdReadyTimeout': 180000,
    // 指向工程当前已生成的 debug APK 路径
    'appium:app': path.resolve(__dirname, './android/app/build/outputs/apk/debug/app-debug.apk'),
    // Capacitor 应用包名与主入口 Activity
    'appium:appPackage': 'com.guardiandapp.mobile',
    'appium:appActivity': 'com.guardiandapp.mobile.MainActivity',

    // 混合应用核心配置：自动匹配并下载对应 WebView 版本的 Chromedriver
    'appium:chromedriverAutodownload': true,
    'appium:autoGrantPermissions': true,
    'appium:noReset': false,
    'appium:newCommandTimeout': 240,
  }],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // 4. 测试框架与报告器
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 180000
  },

  // 5. 自动管理与启动 Appium 服务
  services: [
    ['appium', {
      args: {
        relaxedSecurity: true
      },
      logPath: './'
    }]
  ]
};

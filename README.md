# 🛡️ GuardianDApp 智能监护银行系统

本系统是一款基于区块链技术（Ethereum/Hardhat）与外部关系型数据库（MySQL）相结合的双重记账智能监护银行系统。系统集成了**支付宝沙箱支付系统**以及 **DeepSeek 大模型 AI 消费习惯诊断审计系统**，旨在为家庭成员（监护人与被监护人）提供资金流动监控、超额消费链上预警审批、大模型理财咨询及平台全局金融审计等多维功能。

---

## 💻 运行环境准备

在运行本项目前，请确保您的本地电脑已安装并配置好以下环境：

1. **Node.js**: 推荐安装 `v18.x` 或以上版本（本地开发使用 `v24.x`）。
2. **MySQL**: 推荐安装 `5.7` 或 `8.0` 以上版本。
3. **支付宝沙箱账号**: 需拥有沙箱买家/商家账户（用于测试模拟交易流程）。
4. **Git**: 用于版本控制（可选）。

---

## ⚙️ 第一步：初始化数据库

1. 启动本地 MySQL 服务。
2. 打开数据库管理工具（如 Navicat 或 DataGrip），连接您的 MySQL 服务器。
3. 导入项目根目录下的 [navicat_init.sql](file:///d:/biyesheji/navicat_init.sql) 脚本，它将自动创建名为 `guardian_db` 的数据库，并建立以下三张核心数据表：
   - `transactions`: 链下交易流水记录表（与链上数据双重记账）。
   - `guardianship_bindings`: 监护关系绑定映射表。
   - `user_thresholds`: 被监护人消费限额/阈值配置表。

---

## 📝 第二步：配置文件设定

在项目启动前，请检查并完善后端的配置文件：[mock-server/.env](file:///d:/biyesheji/mock-server/.env)

打开该文件，根据您的本地环境修改配置参数：

```env
# 1. 区块链 RPC 节点配置（部署合约时会自动在此文件中更新 CONTRACT_ADDRESS，无需手动修改）
RPC_URL=http://127.0.0.1:8545
ORACLE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONTRACT_ADDRESS=0x...

# 2. 本地数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=您的数据库密码
DB_NAME=guardian_db

# 3. 支付宝沙箱配置（需填写您在支付宝开放平台的对应沙箱参数）
ALIPAY_APP_ID=9021000163696067
ALIPAY_PRIVATE_KEY=您的沙箱应用私钥
ALIPAY_PUBLIC_KEY=您的沙箱支付宝公钥
ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do

# 4. DeepSeek 大模型配置（用于三端 AI 智能诊断分析，无需暴露在前端）
DEEPSEEK_API_KEY=您的DeepSeek_API_KEY
```

> [!WARNING]
> **安全警示**：请勿将包含您真实 API Key 和私密凭证的 `.env` 文件提交至 Git 远程仓库。该文件已被 `.gitignore` 排除。

---

## 🚀 第三步：系统启动方式

项目提供了**一键脚本快速启动**和**分步手动启动**两种方式。

### 方式一：一键快捷启动 (推荐)
直接双击运行项目根目录下的：
👉 [**`start-all.bat`**](file:///d:/biyesheji/start-all.bat)

该脚本会以多窗口形式在后台依次自动执行：
1. 启动本地 Hardhat 虚拟区块链网络节点。
2. 编译并部署智能合约，且**自动读取 MySQL 中的历史数据（绑定关系、阈值、交易流水）写回区块链中进行同步恢复**。
3. 启动银行 API 后台 mock 服务（端口 `3000`）。
4. 启动前端 Vite 调试服务器，并自动调起 Electron 桌面端窗口。

---

### 方式二：手动分步启动 (开发调试)
如果您想观察每个环节的详细日志输出，可依次在控制台执行：

1. **安装项目依赖**（首次运行需执行）:
   ```bash
   npm install
   ```
2. **启动区块链节点**:
   ```bash
   npm run node
   ```
3. **部署智能合约与状态恢复**:
   ```bash
   npm run deploy
   ```
4. **生成测试 Demo 数据**（可选，用于往数据库和链上注入 10 笔模拟交易和绑定关系）:
   ```bash
   npm run seed
   ```
5. **启动后台 API 服务器**:
   ```bash
   npm run mock:start
   ```
6. **启动桌面 UI 客户端**:
   ```bash
   npm run dev
   # 另开窗口拉起 Electron 客户端
   npm run app
   ```

---

## 🔑 系统内置测试账号

系统内置了三套不同权限的测试账号，供快速演示体验：

| 角色 | 登录手机号/账号 | 登录密码 | 说明 |
| :--- | :--- | :--- | :--- |
| **被监护人 (张三)** | `15876581014` | `123` | 被保护钱包。可发起消费（小额自动通过，大额需监护人同意），向 AI 申请习惯报告。 |
| **监护人 (李四)** | `13826193664` | `123` | 监护人账户。可管理张三，审批其超额大额消费，设定限额，生成 AI 监护建议。 |
| **商户端 (测试)** | `merchant` | `123` | 模拟收款商户。可向被监护人发起扣款请求，用于触发支付及预警流程。 |
| **超级管理员** | `admin` | `admin123` | 平台最高管理者。拥有全局安全视图，对全网交易流水进行数据大屏展示及 AI 系统风控审计。 |

---

## 📦 第四步：桌面客户端打包与运行

项目支持将 Electron 桌面客户端打包为标准的 `.exe` 可执行文件。

### 1. 执行客户端打包
在控制台执行以下命令：
```bash
npm run app:dist
```
该命令会自动先打包 Vite 前端静态资源（生成到 `dist` 目录），随后使用 `electron-builder` 构建 Windows 可执行应用。

### 2. 打包产物说明
打包成功后，所有产物将自动输出在项目根目录下的 [**`release/`**](file:///d:/biyesheji/release) 目录中：

- 🚀 **便携版（单文件 EXE，推荐）**: [release/GuardianDApp 0.0.0.exe](file:///d:/biyesheji/release/GuardianDApp%200.0.0.exe) （无需安装，双击直接运行）
- 💿 **安装包（NSIS 简易安装程序）**: [release/GuardianDApp Setup 0.0.0.exe](file:///d:/biyesheji/release/GuardianDApp%20Setup%200.0.0.exe) （双击可安装至电脑）
- 📁 **免安装绿色目录**: [release/win-unpacked/GuardianDApp.exe](file:///d:/biyesheji/release/win-unpacked/GuardianDApp.exe) （可以直接在解压目录中双击运行）

### 3. 打包后 App 运行步骤
运行打包后的应用前，请确保后台依赖（区块链节点与 API 服务）已就绪：

1. **拉起后端服务**：双击运行根目录下的 [**`start-backend.bat`**](file:///d:/biyesheji/start-backend.bat)（启动区块链 Hardhat 节点、部署智能合约并启动后端 Mock 服务器）。
2. **打开桌面应用**：双击运行 [release/GuardianDApp 0.0.0.exe](file:///d:/biyesheji/release/GuardianDApp%200.0.0.exe) 或已经安装好的桌面应用图标即可体验。

---

## 📱 第五步：移动手机端 (Android / 跨平台 App) 构建与运行

项目已完成 Capacitor 跨平台移动端工程适配，能够将系统一键导出为标准的 **Android 原生工程**。

### 1. 移动端资源构建与同步
在控制台运行以下命令，会自动编译前端 Vite 静态工程并同步到 Android 原生目录：
```bash
npm run cap:sync
```

### 2. 导出 Android APK 安装包
1. 打开 **Android Studio** 软件。
2. 选择 `Open Project`，打开项目根目录下的 [**`android/`**](file:///d:/biyesheji/android) 文件夹。
3. 点击顶部菜单 `Build` ➔ `Build Bundle(s) / APK(s)` ➔ `Build APK(s)`，即可成功打出可在任意 Android 手机上安装运行的 **`.apk` 文件**！

### 3. 手机与电脑多端实时同步（测试方法）
* **局域网连接**：确保手机与电脑连接同一 Wi-Fi，手机浏览器或 App 访问 `http://<电脑局域网IP>:3000` 即可与电脑端的区块链、数据库实时同步数据。
* **快捷命令**：在控制台运行 `npm run cap:android` 亦可自动调起 Android Studio 或已连接的手机调试设备进行真机运行。



---

## 🧪 第六步：系统自动化测试指南

系统构建了涵盖**PC 桌面端 E2E 测试、移动端 Android E2E 测试、前端单元测试及智能合约集成测试**的多层自动化测试防护网。

### 1. 测试指令概览

| 测试类型 | 测试目标 | 执行命令 | 技术栈 |
| :--- | :--- | :--- | :--- |
| **PC 端 E2E 测试** | Electron 桌面应用启动、界面渲染与选项卡交互 | `npm run test:e2e:pc` | Playwright + Electron (`_electron`) |
| **Android 端 E2E 测试** | Capacitor Android 容器启动、切入 WebView 渲染断言 | `npm run test:e2e:android` | WebdriverIO + Appium (UiAutomator2) |
| **前端单元测试** | React Hooks、本地银行账户逻辑与合约调用代理 | `npm run test:unit` | Vitest |
| **智能合约集成测试** | 以太坊智能合约权限流转、消费审批与冻结逻辑 | `npm run test:contract` | Hardhat + Ethers.js |

---

### 2. PC 桌面端端到端测试 (Playwright + Electron)

基于 Playwright 官方 `_electron` API，自动化调用本地编译的 Electron 二进制文件并进行端到端测试。

- **快速运行测试**：
  ```bash
  npm run test:e2e:pc
  ```
  *(注：Playwright 内置了 `webServer` 探活机制，执行该命令会自动检查并在后台启动 Vite 服务，无需手动开启两个终端窗口。)*

- **可视化交互与调试模式 (推荐)**：
  ```bash
  # 启动 Playwright UI 可视化面板，支持实时预览、单步断点与 DOM 快照检查
  npx playwright test --ui

  # 查看最近一次的测试报告
  npx playwright show-report
  ```

---

### 3. 移动 Android 端端到端测试 (WebdriverIO + Appium)

针对 Capacitor 生成的混合应用工程，自动化安装拉起 Android APK，并安全切入 WebView 进行 DOM 渲染与交互断言。

#### 前置环境准备：
1. **安装全局 Appium 2.x 与 Android 驱动**（首次使用需安装）：
   ```bash
   npm install -g appium
   appium driver install uiautomator2
   ```
2. **连接设备或启动模拟器**：
   ```bash
   adb devices
   ```
   确保列表中出现可用在线设备。
3. **确保已构建最新 Debug APK**：
   ```bash
   npm run cap:sync
   cd android && ./gradlew assembleDebug && cd ..
   ```

#### 执行测试：
```bash
npm run test:e2e:android
```
*(注：[wdio.android.conf.js](file:///d:/biyesheji/wdio.android.conf.js) 中配置了 `'appium:chromedriverAutodownload': true`，执行测试时会自动下载并适配设备系统内置的 WebView 版本。)*

---

### 4. 单元测试与智能合约集成测试

- **前端单元测试**：
  ```bash
  # 单次运行
  npm run test:unit

  # 监听模式运行
  npm run test:unit:watch
  ```

- **智能合约测试**：
  ```bash
  npm run test:contract
  ```

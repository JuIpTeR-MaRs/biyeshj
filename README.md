# GuardianDApp 家庭监护消费管理系统

GuardianDApp 是一个面向家庭监护场景的消费管理项目。系统支持监护关系绑定、消费限额设置、异常交易审批、支付宝沙箱支付、消费统计与 AI 辅助分析，并通过 Solidity 智能合约保存关键交易状态和报告摘要。

项目使用同一套 React 前端同时支持 Web、Electron 桌面端和 Capacitor Android 端，适合作为《基于 Solidity 的家庭监护消费管理系统的设计与实现》的毕业设计项目。

## 核心功能

- 被监护人、监护人、商户和管理员多角色使用
- 监护关系申请、接受、拒绝与查询
- 单笔消费阈值和受限商户类别管理
- 正常交易自动通过，超额或受限交易进入审批
- 监护人批准、拒绝及账户冻结/解冻
- 支付宝沙箱预下单、支付查询和结果回写
- MySQL 业务明细与 Ethereum 智能合约关键状态双重记录
- DeepSeek 消费分析及报告摘要上链验证
- Web、Windows 和 Android 多端运行

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | React 18、Vite、Tailwind CSS、Recharts |
| 后端 | Node.js、Express |
| 数据库 | MySQL 5.7+/8.0+ |
| 智能合约 | Solidity、Hardhat、OpenZeppelin、Ethers.js |
| 支付与 AI | 支付宝沙箱、DeepSeek API |
| 多端封装 | Electron、Capacitor 8、Android Studio |
| 测试 | Hardhat、Vitest、Playwright、WebdriverIO、Appium |

## 系统架构

```text
React + Vite
├─ Web 浏览器
├─ Electron Windows 客户端
└─ Capacitor Android 应用
        │
        ▼
Node.js + Express API
├─ MySQL：交易、监护关系、阈值和 AI 报告
├─ Hardhat/Ethereum：关键状态与摘要存证
├─ 支付宝沙箱：模拟支付流程
└─ DeepSeek：消费记录辅助分析
```

## 环境要求

- Node.js 18 或更高版本
- MySQL 5.7 或 8.0+
- Git
- Android Studio、Android SDK 36 和 JDK 21（仅 Android 构建需要）
- 支付宝开放平台沙箱账号（仅真实沙箱流程需要）
- DeepSeek API Key（仅 AI 分析功能需要）

## 安装依赖

```bash
npm install
```

## 初始化数据库

1. 启动 MySQL。
2. 执行项目根目录的 `navicat_init.sql`。
3. 脚本会创建 `guardian_db` 及以下核心表：
   - `transactions`：交易明细
   - `guardianship_bindings`：监护关系
   - `user_thresholds`：消费阈值

后端启动时还会按需初始化 AI 报告和交易状态相关字段。

## 环境变量

在 `mock-server/.env` 中配置后端环境变量。该文件已被 `.gitignore` 排除，请勿提交真实密钥。

使用 Docker Compose 时，在项目根目录复制 `.env.example` 为 `.env`，并将 `MYSQL_ROOT_PASSWORD` 和 `ADMIN_PASSWORD` 设置为各自至少 16 个字符的强密码。Compose 启动预检会拒绝空值、过短密码及示例占位值；Hardhat RPC 默认仅映射到本机 `127.0.0.1:8545`。

```env
# Hardhat / Ethereum
RPC_URL=http://127.0.0.1:8545
ORACLE_PRIVATE_KEY=仅用于本地开发的预言机私钥
CONTRACT_ADDRESS=部署后自动更新或手动填写

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=您的数据库密码
DB_NAME=guardian_db

# 支付宝沙箱
ALIPAY_APP_ID=您的沙箱应用ID
ALIPAY_PRIVATE_KEY=您的沙箱应用私钥
ALIPAY_PUBLIC_KEY=支付宝沙箱公钥
ALIPAY_GATEWAY=https://openapi-sandbox.dl.alipaydev.com/gateway.do

# DeepSeek
DEEPSEEK_API_KEY=您的DeepSeek_API_KEY

# API 安全与监听
ADMIN_PASSWORD=请设置独立的管理员强密码
HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=http://localhost:5173,capacitor://localhost,http://localhost,https://localhost
```

前端远程部署或 Android Release 构建可在根目录 `.env.local` 中配置：

```env
VITE_API_BASE_URL=https://api.example.com
VITE_RPC_URL=https://rpc.example.com
```

## 本地启动

### 一键启动

Windows 环境可运行：

```text
start-all.bat
```

脚本会依次启动 Hardhat 节点、部署智能合约、恢复演示数据，并启动 API、前端及 Electron 客户端。

### 手动启动

建议在不同终端中依次执行：

```bash
# 1. 启动本地区块链
npm run node

# 2. 编译并部署智能合约
npm run compile
npm run deploy

# 3. 可选：写入演示数据
npm run seed

# 4. 启动后端和 Vite 前端
npm run dev:all
```

访问 Vite 输出的本地地址即可使用 Web 端。

## Electron 客户端

启动源码模式：

```bash
npm run app
```

构建 Windows 安装包和便携版：

```bash
npm run app:dist
```

构建产物位于 `release/`，该目录不会提交到 Git。

## Android 运行

同步前端资源并打开 Android Studio：

```bash
npm run cap:sync
npm run cap:android
```

也可以直接使用 Android Studio 打开项目中的 `android/` 目录，然后选择模拟器或真机运行。

### Android 网络说明

- Debug 构建允许访问本地开发服务，Android 模拟器通过 `10.0.2.2` 访问宿主机。
- 真机调试时，手机与电脑需要处于同一局域网；后端设置 `HOST=0.0.0.0`，并将实际客户端 Origin 加入 `CORS_ORIGINS`。
- Android Release 默认禁止明文 HTTP 和混合内容，必须通过 `VITE_API_BASE_URL`、`VITE_RPC_URL` 指向可信 HTTPS 服务。
- 不要将 MySQL、Hardhat RPC 或开发 API 直接暴露到公网。

## 演示账号

本地开发首次运行时会初始化以下演示账号：

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 被监护人 | `15876581014` | `123` |
| 监护人 | `13826193664` | `123` |
| 商户 | `13900000000` | `123` |
| 管理员 | `admin` | `ADMIN_PASSWORD` 的配置值 |

演示钱包使用 Hardhat 本地测试账户，只能用于本地开发，不能用于真实资产或生产环境。

## 身份认证与安全边界

- 普通用户通过一次性挑战和钱包签名创建短期 API 会话。
- 管理员使用服务端 `ADMIN_PASSWORD` 登录，密码不再硬编码在前端。
- 受保护接口校验会话类型、钱包地址归属或管理员权限。
- 浏览器只保存加密后的本地钱包 keystore；解密后的私钥仅保留在当前运行内存中。
- CORS 仅允许 `CORS_ORIGINS` 中配置的来源。
- Android Release 禁止明文流量和用户自签名证书。

当前认证会话保存在后端内存中，服务重启后会失效；本项目仍是教学与演示系统，不应直接作为生产金融系统使用。

## 测试

```bash
# 智能合约测试 + 前端单元测试
npm test

# 单独运行智能合约测试
npm run test:contract

# 单独运行前端单元测试
npm run test:unit

# PC / Electron 端到端测试
npm run test:e2e:pc

# Android 端到端测试（需要 Android SDK、模拟器和 Appium）
npm run test:e2e:android

# ESLint
npm run lint

# 生产构建
npm run build
```

## 主要目录

```text
android/          Capacitor Android 原生工程
contracts/        Solidity 智能合约
electron/         Electron 主进程
mock-server/      Express API、支付模拟与数据库服务
scripts/          合约部署、演示数据和密钥辅助脚本
src/              React 前端源码
test/             智能合约与端到端测试
```

## 免责声明

本项目用于毕业设计、软件工程实践和本地演示，不构成真实金融服务。仓库中的测试账户、测试私钥及模拟数据不得用于生产环境或存放真实资产。

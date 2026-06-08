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
DEEPSEEK_API_KEY=sk-af43a7d96ebe46ddaf4b4b15a125b11d
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
| **超级管理员** | `admin` | `admin123` | 平台最高管理者。拥有全局安全视图，对全网交易流水进行数据大屏展示及 AI 系统风控审计。 |

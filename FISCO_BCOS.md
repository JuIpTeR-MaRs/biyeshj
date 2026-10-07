# 本地 FISCO BCOS 测试链

本项目的 Solidity 合约可部署到 FISCO BCOS 3.9+ 的 Web3 JSON-RPC。当前验证环境为 Ubuntu WSL 中的 FISCO BCOS v3.17.0 Air 单节点、chain ID `20200`、RPC `http://127.0.0.1:8545`。前端与后端仍在 Windows 运行，RPC 通过 WSL localhost 转发访问。

## 建链（首次）

在 Ubuntu WSL 里运行：

```bash
cd /mnt/d/biyesheji
mkdir -p .fisco-local && cd .fisco-local
curl -fL -o build_chain.sh https://github.com/FISCO-BCOS/FISCO-BCOS/releases/download/v3.17.0/build_chain.sh
bash build_chain.sh -l 127.0.0.1:1 -p 30300,20200 -v v3.17.0 -o nodes
```

启动前在 `.fisco-local/nodes/127.0.0.1/node0/config.ini` 的 `[web3_rpc]` 段设置 `enable=true` 和 `listen_ip=127.0.0.1`。新链的 `config.genesis` 已包含 `[web3] chain_id=20200`。这个配置只能在首次启动前确定；不要修改已运行链的 genesis。执行：

```bash
cd /mnt/d/biyesheji/.fisco-local/nodes/127.0.0.1
bash start_all.sh
```

检查 Windows 侧 RPC：

```powershell
Invoke-RestMethod http://127.0.0.1:8545 -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

应返回 `0x4ee8`（20200）。节点目录位于被 Git 忽略的 `.fisco-local/`；其中包含链数据与证书，不要提交。

## 部署合约

从项目根目录运行：

```powershell
npm run compile
$env:FISCO_DEPLOYER_PRIVATE_KEY='<本地测试账户私钥>'
node scripts/deploy-fisco.cjs
```

部署脚本从交易收据读取实际合约地址，验证链上代码和 oracle，并将结果写入 `.fisco-local/deployment.json`。请仅使用本地测试账户私钥；正式链应使用独立管理的部署密钥。

前端 `.env` 设置 `VITE_RPC_URL=http://127.0.0.1:8545`、`VITE_CHAIN_BACKEND=fisco`；后端 `mock-server/.env` 设置同一 `RPC_URL`、部署结果中的 `CONTRACT_ADDRESS` 和对应的 `ORACLE_PRIVATE_KEY`，并设置 `CHAIN_BACKEND=fisco`。该设置让事件监听使用轮询，兼容 FISCO BCOS 的日志 RPC。前端会从 `/api/contract/info` 同步合约地址。当前项目的零 gas 交易设置适用于此本地测试链；切换到启用 Balance 的联盟链时，需要按链的 gas 和账户配置调整。

已有链数据时，在 Windows 命令提示符中启动测试环境和桌面软件：

```cmd
wsl -d Ubuntu -- bash -lc "cd /mnt/d/biyesheji/.fisco-local/nodes/127.0.0.1 && bash start_all.sh"
npm run dev:all
```

在另一个命令提示符窗口运行 `npm run app`，或分别运行 `npm run app:ward`、`npm run app:guardian`。开发版 Electron 需要 `npm run dev:all` 保持运行。

## 停止或重启

```bash
cd /mnt/d/biyesheji/.fisco-local/nodes/127.0.0.1
bash stop_all.sh  # 或 bash start_all.sh
```

本地单节点只用于功能验证。实际联盟链还需要多节点、证书分发、权限、端口访问控制、数据备份，以及独立的部署密钥和 Oracle 密钥。

参考：[FISCO BCOS 建链文档](https://fisco-bcos-doc.readthedocs.io/zh-cn/latest/docs/tutorial/air/build_chain.html)、[Web3/Hardhat 接入文档](https://fisco-bcos-doc.readthedocs.io/zh-cn/latest/docs/develop/web3_usage.html)。

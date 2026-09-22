// Docker 仅运行节点和部署脚本，只加载所需的 ethers 插件，避免 toolbox 的测试插件依赖。
require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: { gasPrice: 0, initialBaseFeePerGas: 0 },
    // Compose 中通过服务名 chain 连接；本机直接使用时回退到 localhost。
    localhost: { url: process.env.RPC_URL || "http://127.0.0.1:8545", gasPrice: 0 }
  }
};

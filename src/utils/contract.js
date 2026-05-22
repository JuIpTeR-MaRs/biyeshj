import { ethers } from "ethers";

export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const RPC_URL = "http://127.0.0.1:8545";

export const CONTRACT_ABI = [
  "function wardToGuardian(address) view returns (address)",
  "function pendingWardToGuardian(address) view returns (address)",
  "function threshold(address) view returns (uint256)",
  "function transactions(uint256) view returns (uint256 id, address ward, uint256 amount, uint256 timestamp, string merchantType, bool isPending, bool isApproved)",
  "function txCounter() view returns (uint256)",
  "function confirmTransaction(uint256 _txId, bool _approve) external",
  "function requestGuardian(address _guardian) external",
  "function acceptGuardianship(address _ward) external",
  "function rejectGuardianship(address _ward) external",
  "function getPendingTransactions(address _guardian) view returns (uint256[] memory)",
  "event PaymentPendingApproval(uint256 indexed txId, address indexed ward, uint256 amount)"
];

/**
 * 包装合约，使得所有的写交易自动携带 gasPrice: 0 从而实现免 Gas
 */
const wrapContractWithZeroGas = (contract) => {
  return new Proxy(contract, {
    get(target, prop, receiver) {
      const origMethod = target[prop];
      if (typeof origMethod === 'function' && typeof prop === 'string') {
        let isWrite = false;
        try {
          if (target.interface) {
            const fragment = target.interface.getFunction(prop);
            if (fragment && fragment.stateMutability !== "view" && fragment.stateMutability !== "pure") {
              isWrite = true;
            }
          }
        } catch (e) {
          // 忽略非合约方法的解析错误
        }

        if (isWrite) {
          return async function (...args) {
            const fragment = target.interface.getFunction(prop);
            const expectedParamCount = fragment ? fragment.inputs.length : 0;
            const lastArg = args[args.length - 1];

            if (args.length > expectedParamCount && typeof lastArg === "object" && lastArg !== null) {
              args[args.length - 1] = { ...lastArg, gasPrice: 0 };
            } else {
              args.push({ gasPrice: 0 });
            }
            return origMethod.apply(target, args);
          };
        }
      }
      return Reflect.get(target, prop, receiver);
    }
  });
};

export const getContract = async (specifiedPrivateKey = null) => {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // 优先使用传入的私钥，其次尝试从本地存储获取
  const privateKey = specifiedPrivateKey || (() => {
    const userData = localStorage.getItem('bank_current_user');
    return userData ? JSON.parse(userData).privateKey : null;
  })();

  if (privateKey) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
    return wrapContractWithZeroGas(contract);
  }
  
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  return wrapContractWithZeroGas(contract);
};

/**
 * 自动充值 Gas 费
 * 如果本地测试账户余额低于 1 ETH，自动从 Hardhat 默认的 Account #0 (Oracle 账户) 充值 10 ETH
 */
export const fundAccount = async (targetAddress) => {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const balance = await provider.getBalance(targetAddress);
    
    // 如果余额小于 1 ETH，充值 10 ETH
    if (balance < ethers.parseEther("1.0")) {
      const oraclePrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const oracleWallet = new ethers.Wallet(oraclePrivateKey, provider);
      const tx = await oracleWallet.sendTransaction({
        to: targetAddress,
        value: ethers.parseEther("10.0")
      });
      await tx.wait();
      console.log(`Successfully funded 10 ETH to ${targetAddress}`);
    }
  } catch (err) {
    console.error("Failed to fund account:", err);
  }
};

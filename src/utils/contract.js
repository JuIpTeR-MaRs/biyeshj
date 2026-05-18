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

export const getContract = async (specifiedPrivateKey = null) => {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // 优先使用传入的私钥，其次尝试从本地存储获取
  const privateKey = specifiedPrivateKey || (() => {
    const userData = localStorage.getItem('bank_current_user');
    return userData ? JSON.parse(userData).privateKey : null;
  })();

  if (privateKey) {
    const wallet = new ethers.Wallet(privateKey, provider);
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  }
  
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
};

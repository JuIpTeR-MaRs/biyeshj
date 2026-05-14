import { ethers } from "ethers";

export const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
export const RPC_URL = "http://127.0.0.1:8545";

export const CONTRACT_ABI = [
  "function wardToGuardian(address) view returns (address)",
  "function threshold(address) view returns (uint256)",
  "function transactions(uint256) view returns (uint256 id, address ward, uint256 amount, uint256 timestamp, string merchantType, bool isPending, bool isApproved)",
  "function txCounter() view returns (uint256)",
  "function confirmTransaction(uint256 _txId, bool _approve) external",
  "function getPendingTransactions(address _guardian) view returns (uint256[] memory)",
  "event PaymentPendingApproval(uint256 indexed txId, address indexed ward, uint256 amount)"
];

export const getContract = async () => {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // 从本地存储获取当前银行账户
  const userData = localStorage.getItem('bank_current_user');
  if (userData) {
    const { privateKey } = JSON.parse(userData);
    const wallet = new ethers.Wallet(privateKey, provider);
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);
  }
  
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
};

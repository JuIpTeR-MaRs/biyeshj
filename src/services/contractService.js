import { ethers } from "ethers";
import { getContract, CONTRACT_ADDRESS, CONTRACT_ABI, RPC_URL } from "../utils/contract";

/**
 * 前端以太坊智能合约交互服务单例 (ethers.js v6)
 */
class ContractService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(RPC_URL);
    this.contractAddress = CONTRACT_ADDRESS;
    this.abi = CONTRACT_ABI;
  }

  /**
   * 获取合约实例
   * @param {string|null} privateKey 可选的用户私钥。如果不传，则尝试从 localStorage 获取当前登录用户的私钥。
   * @returns {Promise<ethers.Contract>} 具备 gasPrice: 0 包装的合约实例
   */
  async getContractInstance(privateKey = null) {
    return await getContract(privateKey);
  }

  /**
   * 示例查询方法：获取某监护人关联的所有待审批交易 ID
   * @param {string} guardianAddress 监护人钱包地址
   * @returns {Promise<bigint[]>} 待审批交易的 ID 数组
   */
  async getPendingTransactions(guardianAddress) {
    const contract = await this.getContractInstance();
    const pendingIds = await contract.getPendingTransactions(guardianAddress);
    return pendingIds;
  }

  /**
   * 示例写入方法：记录支付流水 (通常由 Oracle 或被监护人调用)
   * @param {string} wardAddress 被监护人地址
   * @param {number|bigint} amount 交易金额
   * @param {string} merchantType 商户类型/交易类型
   * @param {string|null} callerPrivateKey 调用者的私钥
   * @returns {Promise<ethers.TransactionReceipt>} 交易收据
   */
  async recordPayment(wardAddress, amount, merchantType, callerPrivateKey = null) {
    const contract = await this.getContractInstance(callerPrivateKey);
    const tx = await contract.recordPayment(wardAddress, BigInt(amount), merchantType);
    return await tx.wait();
  }

  /**
   * 获取当前区块链最新区块高度
   * @returns {Promise<number>} 区块高度
   */
  async getBlockNumber() {
    return await this.provider.getBlockNumber();
  }

  /**
   * 获取指定区块的详细数据
   * @param {number} blockNumber 区块号
   * @returns {Promise<ethers.Block>} 区块详情
   */
  async getBlock(blockNumber) {
    return await this.provider.getBlock(blockNumber);
  }

  /**
   * 读取链上 AI 诊断报告存证哈希
   * @param {string} wardAddress 被监护人钱包地址
   * @param {string} month 月份，例如 "2026-06"
   * @returns {Promise<string>} bytes32 报告哈希
   */
  async getAiReportHash(wardAddress, month) {
    const contract = await this.getContractInstance();
    const hash = await contract.aiReportHashes(wardAddress, month);
    return hash;
  }
}

export const contractService = new ContractService();
export default contractService;

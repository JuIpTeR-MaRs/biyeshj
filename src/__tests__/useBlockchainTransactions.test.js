import { describe, it, expect } from 'vitest';
import {
  calculateTotalSpent,
  checkOverThreshold,
  formatBlockchainBlock,
  formatContractTransaction
} from '../hooks/useBlockchainTransactions';

describe('src/hooks/useBlockchainTransactions.js - 纯函数单元测试 (Mock 数据隔离)', () => {
  describe('1. calculateTotalSpent 消费总计计算 (纯函数)', () => {
    it('正确累加多笔已解包的消费交易金额，并保留两位小数', () => {
      // 模拟多笔解包后的 Mock 交易数据
      const mockTransactions = [
        { id: '1', amount: 50.5 },
        { id: '2', amount: 149.25 },
        { id: '3', amount: 100.0 }
      ];

      const total = calculateTotalSpent(mockTransactions);
      expect(total).toBe('299.75');
    });

    it('当交易列表为空或包含零金额/缺失字段时，应安全返回 "0.00"', () => {
      expect(calculateTotalSpent([])).toBe('0.00');
      expect(calculateTotalSpent(null)).toBe('0.00');
      expect(calculateTotalSpent([{ id: '1' }, { id: '2', amount: 0 }])).toBe('0.00');
    });
  });

  describe('2. checkOverThreshold 预警阈值判定 (纯函数)', () => {
    it('当总消费金额严格大于阈值时，应返回 true 判定为超额', () => {
      expect(checkOverThreshold('500.01', 500)).toBe(true);
      expect(checkOverThreshold(1000, 500)).toBe(true);
    });

    it('当总消费金额小于或等于阈值时，应返回 false 判定为合规', () => {
      expect(checkOverThreshold('500.00', 500)).toBe(false);
      expect(checkOverThreshold('350.50', 500)).toBe(false);
      expect(checkOverThreshold(0, 500)).toBe(false);
    });
  });

  describe('3. formatBlockchainBlock 区块数据转换 (纯函数)', () => {
    it('将底层以太坊节点返回的原始区块对象精准映射为前端 UI 展示结构', () => {
      // 模拟以太坊 RPC 节点返回的 Mock 区块数据 (秒级时间戳、十六进制哈希等)
      const mockRawBlock = {
        number: 128,
        timestamp: 1718000000, // 2024-06-10 06:13:20 GMT
        hash: '0x3c7e098a72661d90d8a57e3f6db7c6c48d423985',
        parentHash: '0x999a098a72661d90d8a57e3f6db7c6c48d423985'
      };

      const formatted = formatBlockchainBlock(mockRawBlock);

      expect(formatted).toEqual({
        index: 128,
        timestamp: 1718000000000, // 转换为前端需要的毫秒级时间戳
        hash: '0x3c7e098a72661d90d8a57e3f6db7c6c48d423985',
        previousHash: '0x999a098a72661d90d8a57e3f6db7c6c48d423985'
      });
    });

    it('输入空对象或 null 时应返回 null，避免 UI 渲染报错', () => {
      expect(formatBlockchainBlock(null)).toBeNull();
      expect(formatBlockchainBlock(undefined)).toBeNull();
    });
  });

  describe('4. formatContractTransaction 合约元组转换 (纯函数)', () => {
    it('将智能合约 transactions(id) 返回的原始元组映射为前端消费记录对象', () => {
      // 模拟 ethers.js 从智能合约读取返回的原始数据元组 [id, ward, amount, timestamp, merchantType, isPending, isApproved, isPaid]
      const mockContractTuple = [
        1n,
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        250n,
        1718000500n,
        '餐饮美食',
        false,
        true,
        true
      ];

      const tx = formatContractTransaction(mockContractTuple);

      expect(tx).toEqual({
        id: '1',
        ward: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: 250,
        timestamp: 1718000500000,
        category: '餐饮美食',
        isPending: false,
        isApproved: true,
        isPaid: true
      });
    });

    it('正确解析处于 Pending 待审批状态的超额/黑名单交易元组', () => {
      const mockPendingTuple = [
        2n,
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        1800n,
        1718001000n,
        '数码电子',
        true,  // isPending = true
        false, // isApproved = false
        false  // isPaid = false
      ];

      const tx = formatContractTransaction(mockPendingTuple);

      expect(tx.id).toBe('2');
      expect(tx.amount).toBe(1800);
      expect(tx.isPending).toBe(true);
      expect(tx.isApproved).toBe(false);
      expect(tx.isPaid).toBe(false);
    });

    it('当原始元组为空或无效时，应安全返回 null', () => {
      expect(formatContractTransaction(null)).toBeNull();
      expect(formatContractTransaction([])).toBeNull();
    });
  });
});

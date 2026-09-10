import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  calculateTotalSpent,
  checkOverThreshold,
  formatBlockchainBlock,
  formatContractTransaction,
  useBlockchainTransactions
} from '../hooks/useBlockchainTransactions';
import { contractService } from '../services/contractService';

// Mock contractService 避免真实连接外部以太坊/Hardhat 节点
vi.mock('../services/contractService', () => ({
  contractService: {
    getBlockNumber: vi.fn(),
    getBlock: vi.fn(),
    getContractInstance: vi.fn()
  }
}));

describe('src/hooks/useBlockchainTransactions.js - 单元测试 (Mock 隔离外部以太坊节点)', () => {
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

  // =========================================================================
  // 5. useBlockchainTransactions Hook 生命周期与交易加载/出块切换验证
  // =========================================================================
  describe('5. useBlockchainTransactions Hook (加载状态与交易成功切换)', () => {
    const mockWardUser = {
      username: 'ward_user',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      role: 'ward',
      privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
    };

    // 辅助函数：创建受控 Promise
    const createDeferred = () => {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    beforeEach(() => {
      vi.restoreAllMocks();
      localStorage.setItem('bank_current_user', JSON.stringify(mockWardUser));
    });

    afterEach(() => {
      localStorage.clear();
      vi.useRealTimers();
    });

    it('初始挂载时进入 loading (isMining=true)，链上异步数据返回后切为 success (isMining=false) 并呈现交易数据', async () => {
      const deferredBlockNumber = createDeferred();
      contractService.getBlockNumber.mockReturnValue(deferredBlockNumber.promise);

      const mockContract = {
        getWardTransactionIds: vi.fn().mockResolvedValue([1]),
        transactions: vi.fn().mockResolvedValue([
          1n,
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          160n,
          1718000000n,
          '餐饮美食',
          false,
          true,
          true
        ])
      };
      contractService.getContractInstance.mockResolvedValue(mockContract);
      contractService.getBlock.mockResolvedValue({
        number: 5,
        timestamp: 1718000000,
        hash: '0xblockhash5',
        parentHash: '0xblockhash4'
      });

      // 挂载 Hook
      const { result, unmount } = renderHook(() => useBlockchainTransactions());

      // 1. 验证正在拉取/打包链上数据时的 loading 状态
      expect(result.current.isMining).toBe(true);
      expect(result.current.transactions).toEqual([]);

      // 2. 模拟以太坊节点响应出块数据
      deferredBlockNumber.resolve(5);

      // 3. 等待 Hook 完成状态更新并验证 isMining 切回 false (加载完成)
      await waitFor(() => {
        expect(result.current.isMining).toBe(false);
      });

      // 4. 验证交易列表及衍生统计数据成功呈现
      expect(result.current.transactions).toHaveLength(1);
      expect(result.current.transactions[0]).toEqual({
        id: '1',
        ward: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: 160,
        timestamp: 1718000000000,
        category: '餐饮美食',
        isPending: false,
        isApproved: true,
        isPaid: true
      });
      expect(result.current.totalSpent).toBe('160.00');
      expect(result.current.overThreshold).toBe(false);

      unmount();
    });

    it('模拟发起一笔新交易并上链出块，验证加载状态重新触发、成功完成及超额预警触发', async () => {
      let currentTxIds = [1];
      const deferredSecondFetch = createDeferred();

      // 初始第 1 笔交易
      contractService.getBlockNumber
        .mockResolvedValueOnce(1)
        .mockImplementationOnce(() => deferredSecondFetch.promise);

      contractService.getBlock.mockResolvedValue({
        number: 1,
        timestamp: 1718000000,
        hash: '0xhash1',
        parentHash: '0xhash0'
      });

      const mockContract = {
        getWardTransactionIds: vi.fn().mockImplementation(async () => currentTxIds),
        transactions: vi.fn().mockImplementation(async (id) => {
          if (Number(id) === 1) {
            return [
              1n,
              '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
              200n,
              1718000000n,
              '生活缴费',
              false,
              true,
              true
            ];
          }
          if (Number(id) === 2) {
            return [
              2n,
              '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
              950n,
              1718000200n,
              '数码科技',
              false,
              true,
              true
            ];
          }
          return null;
        })
      };
      contractService.getContractInstance.mockResolvedValue(mockContract);

      vi.useFakeTimers({ shouldAdvanceTime: true });

      const { result, unmount } = renderHook(() => useBlockchainTransactions());

      // 初始数据加载完成
      await waitFor(() => {
        expect(result.current.isMining).toBe(false);
      });
      expect(result.current.transactions).toHaveLength(1);
      expect(result.current.totalSpent).toBe('200.00');
      expect(result.current.overThreshold).toBe(false);

      // 模拟发起第二笔 950 元交易并已写入合约
      currentTxIds = [1, 2];

      // 推进轮询时钟 (8000ms) 触发下一次 fetchBlockchainData
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      // 验证重新进入 loading (isMining: true)
      expect(result.current.isMining).toBe(true);

      // 模拟第二笔交易打包出块完成
      deferredSecondFetch.resolve(2);

      // 验证加载状态切回 success (isMining: false)
      await waitFor(() => {
        expect(result.current.isMining).toBe(false);
      });

      // 验证交易更新成功，总消费 1150 超过默认阈值 1000
      expect(result.current.transactions).toHaveLength(2);
      expect(result.current.totalSpent).toBe('1150.00');
      expect(result.current.overThreshold).toBe(true);

      unmount();
    });

    it('当区块链 RPC 节点调用失败时，应在 finally 中重置 isMining 为 false，保证应用健壮性', async () => {
      contractService.getBlockNumber.mockRejectedValue(new Error('RPC Provider Connection Refused'));

      const { result, unmount } = renderHook(() => useBlockchainTransactions());

      await waitFor(() => {
        expect(result.current.isMining).toBe(false);
      });

      expect(result.current.transactions).toEqual([]);
      expect(result.current.totalSpent).toBe('0.00');

      unmount();
    });
  });
});

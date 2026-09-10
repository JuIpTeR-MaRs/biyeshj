import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  wrapContractWithZeroGas,
  syncLatestContractAddress,
  getContract,
  getProvider,
  CONTRACT_ADDRESS,
  CONTRACT_ABI
} from '../utils/contract';

// Mock ethers.js 模块，拦截 JsonRpcProvider, Wallet, Contract 调用
const { mockJsonRpcProvider, mockWallet, mockContract } = vi.hoisted(() => {
  const mockJsonRpcProvider = vi.fn(function (url) {
    this.url = url;
  });
  const mockWallet = vi.fn(function (pk, provider) {
    this.privateKey = pk;
    this.provider = provider;
  });
  const mockContract = vi.fn(function (address, abi, runner) {
    this.target = address;
    this.address = address;
    this.abi = abi;
    this.runner = runner;
    this.interface = {
      getFunction: vi.fn()
    };
  });

  return { mockJsonRpcProvider, mockWallet, mockContract };
});

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: mockJsonRpcProvider,
      Wallet: mockWallet,
      Contract: mockContract
    }
  };
});

// Mock api.js 模块，隔离原生网络探测与平台环境差异
vi.mock('../utils/api', () => ({
  getApiUrl: vi.fn((path) => `http://127.0.0.1:3000${path}`),
  getRpcUrl: vi.fn(() => 'http://127.0.0.1:8545')
}));

describe('src/utils/contract.js - 单元测试 (Mock 隔离外部以太坊节点)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // 1. wrapContractWithZeroGas 纯代理包装器测试 (零 Gas 拦截与入参注入)
  // =========================================================================
  describe('1. wrapContractWithZeroGas 纯函数代理 (无需以太坊节点)', () => {
    it('调用写操作方法时，应自动在参数末尾追加 { gasPrice: 0 } 实现免 Gas 交易', async () => {
      // 模拟未经包装的底层 ethers.Contract 实例与方法
      const mockRawMethod = vi.fn().mockResolvedValue({ hash: '0xmocktxhash' });
      const mockRawContract = {
        interface: {
          getFunction: vi.fn((name) => {
            if (name === 'confirmTransaction') {
              return { inputs: [{}, {}], stateMutability: 'nonpayable' };
            }
            return null;
          })
        },
        confirmTransaction: mockRawMethod
      };

      // 纯函数包装
      const wrapped = wrapContractWithZeroGas(mockRawContract);

      // 调用合约写方法：传入 (txId=1, approve=true)
      await wrapped.confirmTransaction(1, true);

      // 验证：成功拦截并在末尾自动注入 { gasPrice: 0 }
      expect(mockRawMethod).toHaveBeenCalledTimes(1);
      const callArgs = mockRawMethod.mock.calls[0];
      expect(callArgs.length).toBe(3);
      expect(callArgs[0]).toBe(1);
      expect(callArgs[1]).toBe(true);
      expect(callArgs[2]).toEqual({ gasPrice: 0 });
    });

    it('当调用方已有 overrides 配置对象时，应将 gasPrice: 0 合并至现有配置中', async () => {
      const mockRawMethod = vi.fn().mockResolvedValue({ hash: '0xmocktxhash' });
      const mockRawContract = {
        interface: {
          getFunction: vi.fn(() => ({ inputs: [{}], stateMutability: 'payable' }))
        },
        deposit: mockRawMethod
      };

      const wrapped = wrapContractWithZeroGas(mockRawContract);

      // 传入已有配置对象，例如 { value: 1000n }
      await wrapped.deposit(100, { value: 1000n });

      expect(mockRawMethod).toHaveBeenCalledTimes(1);
      const callArgs = mockRawMethod.mock.calls[0];
      expect(callArgs.length).toBe(2);
      expect(callArgs[0]).toBe(100);
      expect(callArgs[1]).toEqual({ value: 1000n, gasPrice: 0 });
    });

    it('调用只读 (view / pure) 查询方法时，不应追加 gasPrice 覆盖项', async () => {
      const mockViewMethod = vi.fn().mockResolvedValue(500n);
      const mockRawContract = {
        interface: {
          getFunction: vi.fn((name) => {
            if (name === 'threshold') {
              return { inputs: [{}], stateMutability: 'view' };
            }
            return null;
          })
        },
        threshold: mockViewMethod
      };

      const wrapped = wrapContractWithZeroGas(mockRawContract);

      // 调用只读查询
      const res = await wrapped.threshold('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

      expect(res).toBe(500n);
      expect(mockViewMethod).toHaveBeenCalledTimes(1);
      const callArgs = mockViewMethod.mock.calls[0];
      expect(callArgs.length).toBe(1);
      expect(callArgs[0]).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    });

    it('访问普通属性或非函数字段时，应通过 Proxy 正常透传', () => {
      const mockRawContract = {
        address: '0x1234567890123456789012345678901234567890',
        customFlag: true
      };

      const wrapped = wrapContractWithZeroGas(mockRawContract);
      expect(wrapped.address).toBe('0x1234567890123456789012345678901234567890');
      expect(wrapped.customFlag).toBe(true);
    });
  });

  // =========================================================================
  // 2. syncLatestContractAddress 接口动态同步测试 (Mock HTTP 隔离)
  // =========================================================================
  describe('2. syncLatestContractAddress 动态同步 (Mock fetch)', () => {
    it('成功从后端获取新部署地址时，应更新本地存储并返回最新地址', async () => {
      const mockNewAddress = '0x9999888877776666555544443333222211110000';
      const mockLocalStorage = {
        setItem: vi.fn(),
        getItem: vi.fn()
      };
      vi.stubGlobal('localStorage', mockLocalStorage);
      vi.stubGlobal('window', { localStorage: mockLocalStorage });

      // Mock fetch 请求返回
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ contractAddress: mockNewAddress })
      }));

      const result = await syncLatestContractAddress();

      expect(result).toBe(mockNewAddress);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'CACHED_CONTRACT_ADDRESS',
        mockNewAddress
      );
    });

    it('网络超时或接口异常时，应安全降级回退，不抛出异常并返回原地址', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));

      const fallbackAddress = await syncLatestContractAddress();

      expect(typeof fallbackAddress).toBe('string');
      expect(fallbackAddress.startsWith('0x')).toBe(true);
    });
  });

  // =========================================================================
  // 3. CONTRACT_ABI 接口规范纯数据校验
  // =========================================================================
  describe('3. CONTRACT_ABI 接口完整性纯数据校验', () => {
    it('应完整包含被监护人、监护人、交易审批以及风控所需的核心方法与事件', () => {
      const abiString = CONTRACT_ABI.join(' ');
      expect(abiString).toContain('function wardToGuardian');
      expect(abiString).toContain('function pendingWardToGuardian');
      expect(abiString).toContain('function confirmTransaction');
      expect(abiString).toContain('function threshold');
      expect(abiString).toContain('function isFrozen');
      expect(abiString).toContain('event PaymentPendingApproval');
      expect(abiString).toContain('event PaymentAutoApproved');
      expect(abiString).toContain('event TransactionConfirmed');
    });
  });

  // =========================================================================
  // 4. getContract 与 getProvider 实例初始化测试 (vi.mock 深度拦截 ethers.js)
  // =========================================================================
  describe('4. getContract 实例初始化与 ethers.js 调用拦截 (vi.mock 深度拦截)', () => {
    it('getProvider 应使用当前 RPC 地址正确实例化 ethers.JsonRpcProvider', () => {
      const provider = getProvider();
      expect(mockJsonRpcProvider).toHaveBeenCalledWith('http://127.0.0.1:8545');
      expect(provider).toBeInstanceOf(mockJsonRpcProvider);
    });

    it('未提供私钥且无本地登录信息时，应使用 Provider 实例化只读合约并包装 ZeroGas 代理', async () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn()
      };
      vi.stubGlobal('localStorage', mockLocalStorage);
      vi.stubGlobal('window', { localStorage: mockLocalStorage });

      const contract = await getContract();

      // 验证未调用 Wallet
      expect(mockWallet).not.toHaveBeenCalled();
      // 验证 Contract 实例化时的参数：合约地址、ABI、Provider 实例
      expect(mockContract).toHaveBeenCalledWith(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        expect.any(mockJsonRpcProvider)
      );
      // 验证返回的是包装后的合约对象（可访问 address 属性）
      expect(contract.address).toBe(CONTRACT_ADDRESS);
    });

    it('显式传入 specifiedPrivateKey 时，应使用 Wallet 签名器实例化合约', async () => {
      const customKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const contract = await getContract(customKey);

      expect(mockWallet).toHaveBeenCalledWith(customKey, expect.any(mockJsonRpcProvider));
      expect(mockContract).toHaveBeenCalledWith(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        expect.any(mockWallet)
      );
      expect(contract.address).toBe(CONTRACT_ADDRESS);
    });

    it('未显式传入私钥但 localStorage 存储了当前用户私钥时，应自动读取并注入 Wallet 签名器', async () => {
      const storedPrivateKey = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const mockUserData = JSON.stringify({
        username: 'ward_user',
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        role: 'ward',
        privateKey: storedPrivateKey
      });

      const mockLocalStorage = {
        getItem: vi.fn((key) => (key === 'bank_current_user' ? mockUserData : null)),
        setItem: vi.fn()
      };
      vi.stubGlobal('localStorage', mockLocalStorage);
      vi.stubGlobal('window', { localStorage: mockLocalStorage });

      const contract = await getContract();

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('bank_current_user');
      expect(mockWallet).toHaveBeenCalledWith(storedPrivateKey, expect.any(mockJsonRpcProvider));
      expect(mockContract).toHaveBeenCalledWith(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        expect.any(mockWallet)
      );
      expect(contract.address).toBe(CONTRACT_ADDRESS);
    });

    it('初始化返回的合约实例应具备 wrapContractWithZeroGas 免 Gas 代理特性', async () => {
      // 模拟底层 contract 实例的接口及方法
      const mockSendMethod = vi.fn().mockResolvedValue({ hash: '0xhash' });
      mockContract.mockImplementationOnce(function (address, abi, runner) {
        this.address = address;
        this.abi = abi;
        this.runner = runner;
        this.interface = {
          getFunction: vi.fn((name) => {
            if (name === 'requestGuardian') {
              return { inputs: [{}], stateMutability: 'nonpayable' };
            }
            return null;
          })
        };
        this.requestGuardian = mockSendMethod;
      });

      const contract = await getContract();
      await contract.requestGuardian('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

      // 验证自动拦截并注入了 { gasPrice: 0 }
      expect(mockSendMethod).toHaveBeenCalledWith(
        '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        { gasPrice: 0 }
      );
    });
  });
});

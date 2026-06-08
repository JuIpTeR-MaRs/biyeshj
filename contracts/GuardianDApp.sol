// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GuardianDApp
 * @author Solidity Senior Engineer
 * @notice 智能监护消费预警核心合约
 * @dev 实现了基于阈值的消费预警、监护人审批机制以及预言机数据同步。
 */
contract GuardianDApp is Ownable, ReentrancyGuard {
    // --- 状态变量 ---

    /// @notice 可信的预言机地址，负责记录消费流水
    address public oracle;
    
    /// @notice 交易流水计数器
    uint256 public txCounter;

    /**
     * @dev 交易结构体，记录消费详情
     */
    struct Transaction {
        uint256 id;
        address ward;
        uint256 amount;
        uint256 timestamp;
        string merchantType;
        bool isPending;
        bool isApproved;
    }

    /// @notice 被监护人地址 => 监护人地址
    mapping(address => address) public wardToGuardian;
    
    /// @notice 被监护人地址 => 申请中的监护人地址
    mapping(address => address) public pendingWardToGuardian;

    /// @notice 被监护人地址 => 消费预警阈值
    mapping(address => uint256) public threshold;
    
    /// @notice 交易 ID => 交易详情
    mapping(uint256 => Transaction) public transactions;

    /// @notice 商户黑名单映射
    mapping(string => bool) public bannedMerchants;

    /// @notice 活跃监护人映射 (用于权限校验)
    mapping(address => bool) public isGuardian;

    /// @notice 被监护人地址 => 月份 => AI报告哈希
    mapping(address => mapping(string => bytes32)) public aiReportHashes;

    // --- 事件 ---

    event PaymentAutoApproved(uint256 indexed txId, address indexed ward, uint256 amount);
    event PaymentPendingApproval(uint256 indexed txId, address indexed ward, uint256 amount);
    event TransactionConfirmed(uint256 indexed txId, address indexed guardian);
    event TransactionRejected(uint256 indexed txId, address indexed guardian);
    event GuardianBound(address indexed ward, address indexed guardian);
    event ThresholdSet(address indexed ward, uint256 amount);
    event GuardianshipRequested(address indexed ward, address indexed guardian);
    event GuardianshipAccepted(address indexed ward, address indexed guardian);
    event GuardianshipRejected(address indexed ward, address indexed guardian);
    event BannedMerchantSet(string merchantType, bool banned);
    event AiReportHashStored(address indexed ward, string month, bytes32 reportHash);

    // --- 修饰符 ---

    /**
     * @dev 校验调用者是否为授权预言机
     */
    modifier onlyOracle() {
        require(msg.sender == oracle, "GuardianDApp: Caller is not the oracle");
        _;
    }

    // --- 核心函数 ---

    /**
     * @dev 构造函数
     * @param _oracle 初始预言机地址
     */
    constructor(address _oracle) Ownable(msg.sender) {
        require(_oracle != address(0), "GuardianDApp: Invalid oracle address");
        oracle = _oracle;
    }

    /**
     * @notice 被监护人发起绑定监护人申请
     * @param _guardian 监护人地址
     */
    function requestGuardian(address _guardian) external {
        require(_guardian != address(0), "GuardianDApp: Invalid address");
        require(msg.sender != _guardian, "GuardianDApp: Cannot be your own guardian");
        
        pendingWardToGuardian[msg.sender] = _guardian;
        emit GuardianshipRequested(msg.sender, _guardian);
    }

    /**
     * @notice 监护人同意绑定申请
     * @param _ward 发起申请的被监护人地址
     */
    function acceptGuardianship(address _ward) external {
        require(pendingWardToGuardian[_ward] == msg.sender, "GuardianDApp: No pending request for you");
        
        wardToGuardian[_ward] = msg.sender;
        isGuardian[msg.sender] = true;
        delete pendingWardToGuardian[_ward];
        
        emit GuardianshipAccepted(_ward, msg.sender);
        emit GuardianBound(_ward, msg.sender);
    }

    /**
     * @notice 监护人拒绝绑定申请
     * @param _ward 发起申请的被监护人地址
     */
    function rejectGuardianship(address _ward) external {
        require(pendingWardToGuardian[_ward] == msg.sender, "GuardianDApp: No pending request for you");
        
        delete pendingWardToGuardian[_ward];
        emit GuardianshipRejected(_ward, msg.sender);
    }

    /**
     * @notice 管理员手动绑定（保留用于初始化）
     */
    function bindGuardian(address _ward, address _guardian) external onlyOwner {
        wardToGuardian[_ward] = _guardian;
        isGuardian[_guardian] = true;
        emit GuardianBound(_ward, _guardian);
    }

    /**
     * @notice 设置消费阈值（调用者为被监护人）
     * @param _amount 阈值金额
     */
    function setThreshold(uint256 _amount) external {
        threshold[msg.sender] = _amount;
        emit ThresholdSet(msg.sender, _amount);
    }

    /**
     * @notice 监护人设置被监护人的消费阈值
     * @param _ward 被监护人地址
     * @param _amount 阈值金额
     */
    function setGuardianThreshold(address _ward, uint256 _amount) external {
        require(wardToGuardian[_ward] == msg.sender, "GuardianDApp: Not the authorized guardian");
        threshold[_ward] = _amount;
        emit ThresholdSet(_ward, _amount);
    }

    /**
     * @notice 管理员设置被监护人的消费阈值 (用于系统重启后恢复状态)
     * @param _ward 被监护人地址
     * @param _amount 阈值金额
     */
    function adminSetThreshold(address _ward, uint256 _amount) external onlyOwner {
        threshold[_ward] = _amount;
        emit ThresholdSet(_ward, _amount);
    }

    /**
     * @notice 记录支付记录（仅预言机调用）
     * @dev 若金额 <= 阈值直接标记完成，否则标记为 pending 并触发预警
     * @param _ward 被监护人地址
     * @param _amount 消费金额
     * @param _merchantType 商户类型
     */
    function recordPayment(
        address _ward, 
        uint256 _amount, 
        string calldata _merchantType
    ) external onlyOracle nonReentrant {
        require(_ward != address(0), "GuardianDApp: Ward address required");
        
        txCounter++;
        uint256 currentThreshold = threshold[_ward];
        
        // 核心逻辑：商户黑名单拦截，或者金额超过阈值，并且已经绑定了监护人，则进入 Pending
        bool isBanned = bannedMerchants[_merchantType];
        bool isPending = (isBanned || (_amount > currentThreshold)) && (wardToGuardian[_ward] != address(0));

        transactions[txCounter] = Transaction({
            id: txCounter,
            ward: _ward,
            amount: _amount,
            timestamp: block.timestamp,
            merchantType: _merchantType,
            isPending: isPending,
            isApproved: !isPending
        });

        if (isPending) {
            emit PaymentPendingApproval(txCounter, _ward, _amount);
        } else {
            emit PaymentAutoApproved(txCounter, _ward, _amount);
        }
    }

    /**
     * @notice 设置商户黑名单
     * @param _merchantType 商户类型
     * @param _banned 是否加入黑名单
     */
    function setBannedMerchant(string calldata _merchantType, bool _banned) external {
        require(msg.sender == owner() || isGuardian[msg.sender], "GuardianDApp: Only owner or guardian can set banned merchants");
        bannedMerchants[_merchantType] = _banned;
        emit BannedMerchantSet(_merchantType, _banned);
    }

    /**
     * @notice 存储 AI 报告的 SHA-256 哈希值
     * @param _ward 被监护人地址
     * @param _month 月份，例如 "2026-06"
     * @param _reportHash 报告内容的 SHA-256 哈希值
     */
    function storeAiReportHash(address _ward, string calldata _month, bytes32 _reportHash) external onlyOwner {
        require(_ward != address(0), "GuardianDApp: Invalid ward address");
        require(bytes(_month).length > 0, "GuardianDApp: Month required");
        require(_reportHash != bytes32(0), "GuardianDApp: Hash required");

        aiReportHashes[_ward][_month] = _reportHash;
        emit AiReportHashStored(_ward, _month, _reportHash);
    }

    /**
     * @notice 监护人审批待处理交易
     * @param _txId 交易 ID
     * @param _approve 是否批准
     */
    function confirmTransaction(uint256 _txId, bool _approve) external {
        Transaction storage txn = transactions[_txId];
        
        require(txn.id != 0, "GuardianDApp: Tx not found");
        require(txn.isPending, "GuardianDApp: Not a pending transaction");
        require(wardToGuardian[txn.ward] == msg.sender, "GuardianDApp: Not the authorized guardian");

        txn.isPending = false;
        txn.isApproved = _approve;

        if (_approve) {
            emit TransactionConfirmed(_txId, msg.sender);
        } else {
            emit TransactionRejected(_txId, msg.sender);
        }
    }

    /**
     * @notice 获取监护人名下的所有待处理交易
     * @param _guardian 监护人地址
     * @return 待处理交易 ID 数组
     */
    function getPendingTransactions(address _guardian) external view returns (uint256[] memory) {
        uint256 count = 0;
        // 统计数量以分配内存空间
        for (uint256 i = 1; i <= txCounter; i++) {
            if (transactions[i].isPending && wardToGuardian[transactions[i].ward] == _guardian) {
                count++;
            }
        }

        uint256[] memory pendingIds = new uint256[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 1; i <= txCounter; i++) {
            if (transactions[i].isPending && wardToGuardian[transactions[i].ward] == _guardian) {
                pendingIds[currentIndex] = i;
                currentIndex++;
            }
        }
        return pendingIds;
    }

    /**
     * @notice 更新预言机地址
     * @param _newOracle 新预言机地址
     */
    function updateOracle(address _newOracle) external onlyOwner {
        require(_newOracle != address(0), "GuardianDApp: Zero address");
        oracle = _newOracle;
    }
}

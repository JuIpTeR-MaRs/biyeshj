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
    // --- 自定义错误 (Custom Errors) ---
    /// @dev 预言机权限验证失败时抛出
    error CallerIsNotOracle();
    /// @dev 地址无效（如零地址）时抛出
    error InvalidAddress();
    /// @dev 被监护人试图自己做自己的监护人时抛出
    error CannotBeOwnGuardian();
    /// @dev 监护人操作时找不到对应的待处理申请时抛出
    error NoPendingRequestForYou();
    /// @dev 非绑定监护人执行越权操作时抛出
    error NotAuthorizedGuardian();
    /// @dev 操作的必须提供有效地址
    error AddressRequired();
    /// @dev 仅允许 Owner 或监护人操作时抛出
    error OnlyOwnerOrGuardian();
    /// @dev 月份字符串为空时抛出
    error MonthRequired();
    /// @dev 哈希值无效（零值）时抛出
    error HashRequired();
    /// @dev 找不到指定交易时抛出
    error TransactionNotFound();
    /// @dev 交易不处于待处理（Pending）状态时抛出
    error NotPendingTransaction();
    /// @dev 账户已被冻结时抛出
    error AccountIsFrozen();

    // --- 状态变量 ---

    /// @notice 可信的预言机地址，负责记录消费流水
    /// @dev 由管理员设置，有权写入支付记录
    address public oracle;
    
    /// @notice 交易流水计数器
    /// @dev 自增变量，用于生成唯一的交易 ID
    uint256 public txCounter;

    /**
     * @dev 交易结构体，记录消费详情
     * @param id 交易全局唯一标识符
     * @param ward 发起消费的被监护人地址
     * @param amount 消费金额
     * @param timestamp 交易时间戳
     * @param merchantType 商户类型标识（用于黑名单校验）
     * @param isPending 是否处于待审批状态
     * @param isApproved 是否已获批准
     */
    struct Transaction {
        uint256 id;
        address ward;
        uint256 amount;
        uint256 timestamp;
        string merchantType;
        bool isPending;
        bool isApproved;
        bool isPaid;
    }

    /// @notice 被监护人地址 => 监护人地址列表
    /// @dev 记录被监护人绑定的所有监护人数组
    mapping(address => address[]) public wardGuardiansList;
    
    /// @notice 被监护人地址 => 监护人地址 => 是否是其监护人
    /// @dev O(1) 复杂度检查监护关系是否存在
    mapping(address => mapping(address => bool)) public isWardGuardian;
    
    /// @notice 被监护人地址 => 申请中的监护人地址
    /// @dev 记录当前未决的监护人绑定请求
    mapping(address => address) public pendingWardToGuardian;

    /// @notice 被监护人地址 => 消费预警阈值
    /// @dev 单笔消费超过此阈值将触发审批流
    mapping(address => uint256) public threshold;
    
    /// @notice 交易 ID => 交易详情
    /// @dev 交易注册表，记录全网所有交易状态
    mapping(uint256 => Transaction) public transactions;

    /// @notice 商户黑名单映射
    /// @dev 属于黑名单的商户类型消费无论金额大小强制进入待审批
    mapping(string => bool) public bannedMerchants;

    /// @notice 活跃监护人映射 (用于权限校验)
    /// @dev 标记某个地址是否至少是一个被监护人的监护人
    mapping(address => bool) public isGuardian;

    /// @notice 被监护人地址 => 月份 => AI报告哈希
    /// @dev 用于在链上固定 AI 每月生成报告的摘要，防止篡改
    mapping(address => mapping(string => bytes32)) public aiReportHashes;

    /// @notice 账户地址 => 是否被冻结
    mapping(address => bool) public isFrozen;

    // --- 事件 ---

    /// @notice 消费低于阈值或无监护人自动批准时触发
    event PaymentAutoApproved(uint256 indexed txId, address indexed ward, uint256 amount);
    /// @notice 消费触发预警进入待审批时触发
    event PaymentPendingApproval(uint256 indexed txId, address indexed ward, uint256 amount);
    /// @notice 监护人确认批准交易时触发
    event TransactionConfirmed(uint256 indexed txId, address indexed guardian);
    /// @notice 监护人拒绝交易时触发
    event TransactionRejected(uint256 indexed txId, address indexed guardian);
    /// @notice 新的监护关系成功绑定时触发
    event GuardianBound(address indexed ward, address indexed guardian);
    /// @notice 被监护人消费阈值更新时触发
    event ThresholdSet(address indexed ward, uint256 amount);
    /// @notice 发起监护人绑定请求时触发
    event GuardianshipRequested(address indexed ward, address indexed guardian);
    /// @notice 监护人接受绑定请求时触发
    event GuardianshipAccepted(address indexed ward, address indexed guardian);
    /// @notice 监护人拒绝绑定请求时触发
    event GuardianshipRejected(address indexed ward, address indexed guardian);
    /// @notice 商户黑名单状态改变时触发
    event BannedMerchantSet(string merchantType, bool banned);
    /// @notice AI 审计报告哈希存证成功时触发
    event AiReportHashStored(address indexed ward, string month, bytes32 reportHash);
    /// @notice 账户被冻结/解冻时触发
    event AccountFrozen(address indexed account, bool frozen, address indexed operator);

    // --- 修饰符 ---

    /**
     * @dev 校验调用者是否为授权预言机，否则抛出 CallerIsNotOracle
     */
    modifier onlyOracle() {
        if (msg.sender != oracle) revert CallerIsNotOracle();
        _;
    }

    // --- 核心函数 ---

    /**
     * @dev 构造函数，初始化合约拥有者及预言机地址
     * @param _oracle 初始预言机地址
     */
    constructor(address _oracle) Ownable(msg.sender) {
        if (_oracle == address(0)) revert InvalidAddress();
        oracle = _oracle;
    }

    /**
     * @notice 被监护人发起绑定监护人申请
     * @param _guardian 监护人地址
     */
    function requestGuardian(address _guardian) external nonReentrant {
        if (_guardian == address(0)) revert InvalidAddress();
        if (msg.sender == _guardian) revert CannotBeOwnGuardian();
        
        pendingWardToGuardian[msg.sender] = _guardian;
        emit GuardianshipRequested(msg.sender, _guardian);
    }

    /**
     * @notice 获取第一个监护人地址（为向后兼容保留的旧方法）
     * @param _ward 被监护人地址
     * @return 首个监护人的地址，如无则返回零地址
     */
    function wardToGuardian(address _ward) external view returns (address) {
        if (wardGuardiansList[_ward].length > 0) {
            return wardGuardiansList[_ward][0];
        }
        return address(0);
    }

    /**
     * @notice 获取被监护人绑定的所有监护人列表
     * @param _ward 被监护人地址
     * @return 绑定的监护人地址数组
     */
    function getWardGuardians(address _ward) external view returns (address[] memory) {
        return wardGuardiansList[_ward];
    }

    /**
     * @notice 监护人同意绑定申请
     * @param _ward 发起申请的被监护人地址
     */
    function acceptGuardianship(address _ward) external nonReentrant {
        if (pendingWardToGuardian[_ward] != msg.sender) revert NoPendingRequestForYou();
        
        if (!isWardGuardian[_ward][msg.sender]) {
            wardGuardiansList[_ward].push(msg.sender);
            isWardGuardian[_ward][msg.sender] = true;
        }
        isGuardian[msg.sender] = true;
        delete pendingWardToGuardian[_ward];
        
        emit GuardianshipAccepted(_ward, msg.sender);
        emit GuardianBound(_ward, msg.sender);
    }

    /**
     * @notice 监护人拒绝绑定申请
     * @param _ward 发起申请的被监护人地址
     */
    function rejectGuardianship(address _ward) external nonReentrant {
        if (pendingWardToGuardian[_ward] != msg.sender) revert NoPendingRequestForYou();
        
        delete pendingWardToGuardian[_ward];
        emit GuardianshipRejected(_ward, msg.sender);
    }

    /**
     * @notice 管理员手动绑定（保留用于初始化）
     * @param _ward 被监护人地址
     * @param _guardian 监护人地址
     */
    function bindGuardian(address _ward, address _guardian) external onlyOwner nonReentrant {
        if (!isWardGuardian[_ward][_guardian]) {
            wardGuardiansList[_ward].push(_guardian);
            isWardGuardian[_ward][_guardian] = true;
        }
        isGuardian[_guardian] = true;
        emit GuardianBound(_ward, _guardian);
    }

    /**
     * @notice 被监护人自己设置消费阈值
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
        if (!isWardGuardian[_ward][msg.sender]) revert NotAuthorizedGuardian();
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
     * @notice 冻结/解冻某个账户
     * @param _account 被操作账户地址
     * @param _freeze 是否冻结
     */
    function setFreezeAccount(address _account, bool _freeze) external {
        if (msg.sender == owner()) {
            isFrozen[_account] = _freeze;
            emit AccountFrozen(_account, _freeze, msg.sender);
        } else if (isWardGuardian[_account][msg.sender]) {
            isFrozen[_account] = _freeze;
            emit AccountFrozen(_account, _freeze, msg.sender);
        } else {
            revert NotAuthorizedGuardian();
        }
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
        if (_ward == address(0)) revert AddressRequired();
        if (isFrozen[_ward]) revert AccountIsFrozen();
        
        txCounter++;
        uint256 currentThreshold = threshold[_ward];
        
        // 核心逻辑：商户黑名单拦截，或者金额超过阈值，并且已经绑定了监护人，则进入 Pending
        bool isBanned = bannedMerchants[_merchantType];
        bool isPending = (isBanned || (_amount > currentThreshold)) && (wardGuardiansList[_ward].length > 0);

        transactions[txCounter] = Transaction({
            id: txCounter,
            ward: _ward,
            amount: _amount,
            timestamp: block.timestamp,
            merchantType: _merchantType,
            isPending: isPending,
            isApproved: !isPending,
            isPaid: !isPending
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
        if (msg.sender != owner() && !isGuardian[msg.sender]) revert OnlyOwnerOrGuardian();
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
        if (_ward == address(0)) revert InvalidAddress();
        if (bytes(_month).length == 0) revert MonthRequired();
        if (_reportHash == bytes32(0)) revert HashRequired();

        aiReportHashes[_ward][_month] = _reportHash;
        emit AiReportHashStored(_ward, _month, _reportHash);
    }

    /**
     * @notice 监护人审批待处理交易
     * @param _txId 交易 ID
     * @param _approve 是否批准
     */
    function confirmTransaction(uint256 _txId, bool _approve) external nonReentrant {
        Transaction storage txn = transactions[_txId];
        
        if (txn.id == 0) revert TransactionNotFound();
        if (!txn.isPending) revert NotPendingTransaction();
        if (!isWardGuardian[txn.ward][msg.sender]) revert NotAuthorizedGuardian();

        txn.isPending = false;
        txn.isApproved = _approve;

        if (_approve) {
            emit TransactionConfirmed(_txId, msg.sender);
        } else {
            emit TransactionRejected(_txId, msg.sender);
        }
    }

    /**
     * @notice 管理员强行审批历史交易 (仅用于数据重放恢复)
     * @param _txId 交易 ID
     * @param _approve 是否批准
     */
    function adminConfirmTransaction(uint256 _txId, bool _approve) external onlyOwner nonReentrant {
        Transaction storage txn = transactions[_txId];
        if (txn.id == 0) revert TransactionNotFound();
        
        txn.isPending = false;
        txn.isApproved = _approve;
        
        // 恢复时不再重新发送事件，以免打扰前端
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
            if (transactions[i].isPending && isWardGuardian[transactions[i].ward][_guardian]) {
                count++;
            }
        }

        uint256[] memory pendingIds = new uint256[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 1; i <= txCounter; i++) {
            if (transactions[i].isPending && isWardGuardian[transactions[i].ward][_guardian]) {
                pendingIds[currentIndex] = i;
                currentIndex++;
            }
        }
        return pendingIds;
    }

    /**
     * @notice 预言机标记历史审批订单已支付成功
     * @param _txId 交易 ID
     */
    function markPaymentSuccess(uint256 _txId) external onlyOracle nonReentrant {
        Transaction storage txn = transactions[_txId];
        if (txn.id == 0) revert TransactionNotFound();
        if (!txn.isApproved) revert NotPendingTransaction(); // 复用异常或新增
        txn.isPaid = true;
    }

    /**
     * @notice 更新预言机地址
     * @param _newOracle 新预言机地址
     */
    function updateOracle(address _newOracle) external onlyOwner {
        if (_newOracle == address(0)) revert InvalidAddress();
        oracle = _newOracle;
    }
}

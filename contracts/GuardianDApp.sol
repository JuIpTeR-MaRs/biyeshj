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
    /// @dev 重复申请绑定同一监护人或已被绑定时抛出
    error AlreadyRequested();
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
    /// @dev 审批人数必须介于 1 和当前监护人数之间
    error InvalidApprovalRequirement();
    /// @dev 同一监护人不能对同一笔交易重复投赞成票
    error GuardianAlreadyApproved();

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

    /// @notice 被监护人地址 => 发出邀请的监护人地址
    /// @dev 监护人主动添加成员时创建，由被监护人确认或拒绝
    mapping(address => address) public pendingGuardianInvites;

    /// @notice 被监护人地址 => 消费预警阈值
    /// @dev 单笔消费超过此阈值将触发审批流
    mapping(address => uint256) public threshold;

    /// @notice 被监护人地址 => 消费通过所需的监护人赞成票数量（未设置时默认为 1）
    mapping(address => uint256) public approvalRequirement;
    
    /// @notice 交易 ID => 交易详情
    /// @dev 交易注册表，记录全网所有交易状态
    mapping(uint256 => Transaction) public transactions;

    /// @notice 商户黑名单映射
    /// @dev 属于黑名单的商户类型消费无论金额大小强制进入待审批
    /// @dev 被监护人地址 => 商户类别 => 是否限制；每个家庭独立配置。
    mapping(address => mapping(string => bool)) public bannedMerchants;

    /// @notice 活跃监护人映射 (用于权限校验)
    /// @dev 标记某个地址是否至少是一个被监护人的监护人
    mapping(address => bool) public isGuardian;

    /// @notice 被监护人地址 => 月份 => AI报告哈希
    /// @dev 用于在链上固定 AI 每月生成报告的摘要，防止篡改
    mapping(address => mapping(string => bytes32)) public aiReportHashes;

    /// @notice 账户地址 => 是否被冻结
    mapping(address => bool) public isFrozen;

    /// @notice 被监护人地址 => 交易 ID 列表
    mapping(address => uint256[]) public wardTransactions;

    /// @notice 交易创建时冻结的所需赞成票数量，避免后续改配置影响在途订单
    mapping(uint256 => uint256) public transactionRequiredApprovals;
    /// @notice 交易当前已获得的赞成票数量
    mapping(uint256 => uint256) public transactionApprovalCounts;
    /// @notice 交易 ID => 监护人 => 是否已经投过赞成票
    mapping(uint256 => mapping(address => bool)) public transactionGuardianApproved;

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
    event GuardianInvitationRequested(address indexed ward, address indexed guardian);
    event GuardianInvitationAccepted(address indexed ward, address indexed guardian);
    event GuardianInvitationRejected(address indexed ward, address indexed guardian);
    /// @notice 商户黑名单状态改变时触发
    event BannedMerchantSet(address indexed ward, string merchantType, bool banned);
    /// @notice AI 审计报告哈希存证成功时触发
    event AiReportHashStored(address indexed ward, string month, bytes32 reportHash);
    /// @notice 账户被冻结/解冻时触发
    event AccountFrozen(address indexed account, bool frozen, address indexed operator);
    /// @notice 多监护人审批所需赞成票数量更新
    event ApprovalRequirementSet(address indexed ward, uint256 requiredApprovals, address indexed operator);
    /// @notice 某位监护人的赞成票已被记录，但订单尚未达到通过门槛
    event TransactionApprovalRecorded(uint256 indexed txId, address indexed guardian, uint256 approvals, uint256 requiredApprovals);

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
        if (pendingWardToGuardian[msg.sender] == _guardian || isWardGuardian[msg.sender][_guardian]) revert AlreadyRequested();
        
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
     * @notice 监护人主动邀请被监护人建立绑定关系
     * @param _ward 待邀请的被监护人地址
     */
    function requestGuardianshipInvite(address _ward) external nonReentrant {
        if (_ward == address(0)) revert InvalidAddress();
        if (msg.sender == _ward) revert CannotBeOwnGuardian();
        if (pendingGuardianInvites[_ward] == msg.sender || isWardGuardian[_ward][msg.sender]) revert AlreadyRequested();

        pendingGuardianInvites[_ward] = msg.sender;
        emit GuardianInvitationRequested(_ward, msg.sender);
    }

    /**
     * @notice 被监护人接受监护人主动发出的绑定邀请
     */
    function acceptGuardianInvitation() external nonReentrant {
        address guardian = pendingGuardianInvites[msg.sender];
        if (guardian == address(0)) revert NoPendingRequestForYou();

        if (!isWardGuardian[msg.sender][guardian]) {
            wardGuardiansList[msg.sender].push(guardian);
            isWardGuardian[msg.sender][guardian] = true;
        }
        isGuardian[guardian] = true;
        delete pendingGuardianInvites[msg.sender];

        emit GuardianInvitationAccepted(msg.sender, guardian);
        emit GuardianBound(msg.sender, guardian);
    }

    /**
     * @notice 被监护人拒绝监护人主动发出的绑定邀请
     */
    function rejectGuardianInvitation() external nonReentrant {
        address guardian = pendingGuardianInvites[msg.sender];
        if (guardian == address(0)) revert NoPendingRequestForYou();

        delete pendingGuardianInvites[msg.sender];
        emit GuardianInvitationRejected(msg.sender, guardian);
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
     * @notice 设置该被监护人单笔受限消费所需的监护人赞成票数量
     * @dev 被监护人本人或其任一已绑定监护人可设置；数量不能超过已绑定监护人数
     */
    function setApprovalRequirement(address _ward, uint256 _requiredApprovals) external {
        if (msg.sender != _ward && !isWardGuardian[_ward][msg.sender]) revert NotAuthorizedGuardian();
        if (_requiredApprovals == 0 || _requiredApprovals > wardGuardiansList[_ward].length) {
            revert InvalidApprovalRequirement();
        }
        approvalRequirement[_ward] = _requiredApprovals;
        emit ApprovalRequirementSet(_ward, _requiredApprovals, msg.sender);
    }

    /**
     * @notice 获取生效中的审批门槛；兼容历史数据，未配置时默认为一人通过
     */
    function getApprovalRequirement(address _ward) external view returns (uint256) {
        uint256 configured = approvalRequirement[_ward];
        return configured == 0 ? 1 : configured;
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
        bool isBanned = bannedMerchants[_ward][_merchantType];
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
        uint256 configuredRequirement = approvalRequirement[_ward];
        transactionRequiredApprovals[txCounter] = configuredRequirement == 0 ? 1 : configuredRequirement;

        // 记录被监护人的交易 ID
        wardTransactions[_ward].push(txCounter);

        if (isPending) {
            emit PaymentPendingApproval(txCounter, _ward, _amount);
        } else {
            emit PaymentAutoApproved(txCounter, _ward, _amount);
        }
    }

    /**
     * @notice 设置指定被监护人的商户黑名单
     * @param _ward 被监护人地址
     * @param _merchantType 商户类型
     * @param _banned 是否加入黑名单
     */
    function setBannedMerchant(address _ward, string calldata _merchantType, bool _banned) external {
        if (_ward == address(0)) revert InvalidAddress();
        if (msg.sender != owner() && !isWardGuardian[_ward][msg.sender]) revert NotAuthorizedGuardian();
        bannedMerchants[_ward][_merchantType] = _banned;
        emit BannedMerchantSet(_ward, _merchantType, _banned);
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

        if (_approve) {
            if (transactionGuardianApproved[_txId][msg.sender]) revert GuardianAlreadyApproved();
            transactionGuardianApproved[_txId][msg.sender] = true;
            uint256 approvals = ++transactionApprovalCounts[_txId];
            uint256 requiredApprovals = transactionRequiredApprovals[_txId];
            if (approvals >= requiredApprovals) {
                txn.isPending = false;
                txn.isApproved = true;
                emit TransactionConfirmed(_txId, msg.sender);
            } else {
                emit TransactionApprovalRecorded(_txId, msg.sender, approvals, requiredApprovals);
            }
        } else {
            // 拒绝维持现有语义：任一监护人可一票否决。
            txn.isPending = false;
            txn.isApproved = false;
            emit TransactionRejected(_txId, msg.sender);
        }
    }

    /**
     * @notice 获取订单的多监护人审批进度
     */
    function getTransactionApprovalStatus(uint256 _txId) external view returns (uint256 requiredApprovals, uint256 approvals) {
        if (transactions[_txId].id == 0) revert TransactionNotFound();
        requiredApprovals = transactionRequiredApprovals[_txId];
        approvals = transactionApprovalCounts[_txId];
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

    /**
     * @notice 获取被监护人的所有交易 ID
     * @param _ward 被监护人地址
     * @return 交易 ID 数组
     */
    function getWardTransactionIds(address _ward) external view returns (uint256[] memory) {
        return wardTransactions[_ward];
    }
}

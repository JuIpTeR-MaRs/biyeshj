const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GuardianDApp 智能合约综合测试套件", function () {
  let dapp;
  let owner, oracle, ward, guardian, guardian2, stranger;
  const MONTH = "2026-06";
  const DUMMY_HASH = ethers.keccak256(ethers.toUtf8Bytes("AI 消费健康报告"));

  beforeEach(async function () {
    // 获取测试账户签名者
    [owner, oracle, ward, guardian, guardian2, stranger] = await ethers.getSigners();

    // 部署 GuardianDApp 合约，传入 oracle 地址
    const Factory = await ethers.getContractFactory("GuardianDApp");
    dapp = await Factory.deploy(oracle.address);
  });

  // =========================================================================
  // 1. 合约部署与初始化测试 (Deployment & Initialization)
  // =========================================================================
  describe("1. 合约部署与初始状态验证", function () {
    it("部署成功时应正确设置拥有者 (Owner) 与预言机 (Oracle) 地址", async function () {
      expect(await dapp.owner()).to.equal(owner.address);
      expect(await dapp.oracle()).to.equal(oracle.address);
    });

    it("初始状态计数器 txCounter 应为 0", async function () {
      expect(await dapp.txCounter()).to.equal(0n);
    });

    it("部署时若传入零地址预言机，应触发 require/revert 拦截并回滚 (InvalidAddress)", async function () {
      const Factory = await ethers.getContractFactory("GuardianDApp");
      await expect(
        Factory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(Factory, "InvalidAddress");
    });
  });

  // =========================================================================
  // 2. 监护关系绑定与权限校验 (Guardianship Binding & Role Permissions)
  // =========================================================================
  describe("2. 监护关系绑定流程与权限校验", function () {
    it("被监护人可发起绑定申请，状态正确记录并触发 GuardianshipRequested 事件", async function () {
      await expect(dapp.connect(ward).requestGuardian(guardian.address))
        .to.emit(dapp, "GuardianshipRequested")
        .withArgs(ward.address, guardian.address);

      expect(await dapp.pendingWardToGuardian(ward.address)).to.equal(guardian.address);
    });

    it("申请绑定时：被监护人不能将自己设为监护人 (CannotBeOwnGuardian)", async function () {
      await expect(
        dapp.connect(ward).requestGuardian(ward.address)
      ).to.be.revertedWithCustomError(dapp, "CannotBeOwnGuardian");
    });

    it("申请绑定时：监护人地址不能为零地址 (InvalidAddress)", async function () {
      await expect(
        dapp.connect(ward).requestGuardian(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(dapp, "InvalidAddress");
    });

    it("目标监护人同意申请：更新监护列表、映射状态与 isGuardian 标记，触发相应事件", async function () {
      await dapp.connect(ward).requestGuardian(guardian.address);

      await expect(dapp.connect(guardian).acceptGuardianship(ward.address))
        .to.emit(dapp, "GuardianshipAccepted")
        .withArgs(ward.address, guardian.address)
        .and.to.emit(dapp, "GuardianBound")
        .withArgs(ward.address, guardian.address);

      // 状态变量变更验证
      expect(await dapp.pendingWardToGuardian(ward.address)).to.equal(ethers.ZeroAddress);
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.true;
      expect(await dapp.isGuardian(guardian.address)).to.be.true;
      expect(await dapp.wardToGuardian(ward.address)).to.equal(guardian.address);

      const guardiansList = await dapp.getWardGuardians(ward.address);
      expect(guardiansList).to.deep.equal([guardian.address]);
    });

    it("目标监护人拒绝申请：清除待确认状态并触发 GuardianshipRejected 事件", async function () {
      await dapp.connect(ward).requestGuardian(guardian.address);

      await expect(dapp.connect(guardian).rejectGuardianship(ward.address))
        .to.emit(dapp, "GuardianshipRejected")
        .withArgs(ward.address, guardian.address);

      expect(await dapp.pendingWardToGuardian(ward.address)).to.equal(ethers.ZeroAddress);
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.false;
    });

    it("非指定监护人调用 accept/reject 应回滚 (NoPendingRequestForYou)", async function () {
      await dapp.connect(ward).requestGuardian(guardian.address);

      await expect(
        dapp.connect(stranger).acceptGuardianship(ward.address)
      ).to.be.revertedWithCustomError(dapp, "NoPendingRequestForYou");

      await expect(
        dapp.connect(stranger).rejectGuardianship(ward.address)
      ).to.be.revertedWithCustomError(dapp, "NoPendingRequestForYou");
    });

    it("管理员直接绑定：Owner 可通过 bindGuardian 绑定，非 Owner 调用回滚", async function () {
      // Owner 调用成功
      await expect(dapp.connect(owner).bindGuardian(ward.address, guardian.address))
        .to.emit(dapp, "GuardianBound")
        .withArgs(ward.address, guardian.address);

      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.true;
      expect(await dapp.isGuardian(guardian.address)).to.be.true;

      // 非 Owner (stranger) 越权调用应回滚
      await expect(
        dapp.connect(stranger).bindGuardian(ward.address, guardian2.address)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================================================
  // 3. 消费阈值管理与核心状态变更 (Threshold Management & State Updates)
  // =========================================================================
  describe("3. 消费阈值设置与角色权限控制", function () {
    it("被监护人可自主修改个人单笔消费阈值", async function () {
      await expect(dapp.connect(ward).setThreshold(500))
        .to.emit(dapp, "ThresholdSet")
        .withArgs(ward.address, 500n);

      expect(await dapp.threshold(ward.address)).to.equal(500n);
    });

    it("授权监护人可设置被监护人的阈值", async function () {
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);

      await expect(dapp.connect(guardian).setGuardianThreshold(ward.address, 800))
        .to.emit(dapp, "ThresholdSet")
        .withArgs(ward.address, 800n);

      expect(await dapp.threshold(ward.address)).to.equal(800n);
    });

    it("非授权监护人尝试设置被监护人阈值时回滚 (NotAuthorizedGuardian)", async function () {
      await expect(
        dapp.connect(stranger).setGuardianThreshold(ward.address, 800)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("管理员可通过 adminSetThreshold 设置阈值，非管理员调用回滚", async function () {
      await expect(dapp.connect(owner).adminSetThreshold(ward.address, 1200))
        .to.emit(dapp, "ThresholdSet")
        .withArgs(ward.address, 1200n);

      expect(await dapp.threshold(ward.address)).to.equal(1200n);

      await expect(
        dapp.connect(stranger).adminSetThreshold(ward.address, 1500)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================================================
  // 4. 账户冻结与商户黑名单权限管理 (Freezing & Risk Blacklist)
  // =========================================================================
  describe("4. 账户冻结与商户风控权限管理", function () {
    it("Owner 与绑定监护人均有权冻结及解冻账户", async function () {
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);

      // 1. 监护人冻结
      await expect(dapp.connect(guardian).setFreezeAccount(ward.address, true))
        .to.emit(dapp, "AccountFrozen")
        .withArgs(ward.address, true, guardian.address);
      expect(await dapp.isFrozen(ward.address)).to.be.true;

      // 2. Owner 解冻
      await expect(dapp.connect(owner).setFreezeAccount(ward.address, false))
        .to.emit(dapp, "AccountFrozen")
        .withArgs(ward.address, false, owner.address);
      expect(await dapp.isFrozen(ward.address)).to.be.false;
    });

    it("非关联第三方调用 setFreezeAccount 回滚 (NotAuthorizedGuardian)", async function () {
      await expect(
        dapp.connect(stranger).setFreezeAccount(ward.address, true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("Owner 与监护人可管理黑名单商户 (setBannedMerchant)", async function () {
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);

      // Owner 标记黑名单
      await expect(dapp.connect(owner).setBannedMerchant("Casino", true))
        .to.emit(dapp, "BannedMerchantSet")
        .withArgs("Casino", true);
      expect(await dapp.bannedMerchants("Casino")).to.be.true;

      // 监护人标记黑名单
      await expect(dapp.connect(guardian).setBannedMerchant("Nightclub", true))
        .to.emit(dapp, "BannedMerchantSet")
        .withArgs("Nightclub", true);
      expect(await dapp.bannedMerchants("Nightclub")).to.be.true;
    });

    it("普通用户/第三方设置黑名单商户应被拦截回滚 (OnlyOwnerOrGuardian)", async function () {
      await expect(
        dapp.connect(ward).setBannedMerchant("GameStore", true)
      ).to.be.revertedWithCustomError(dapp, "OnlyOwnerOrGuardian");

      await expect(
        dapp.connect(stranger).setBannedMerchant("GameStore", true)
      ).to.be.revertedWithCustomError(dapp, "OnlyOwnerOrGuardian");
    });
  });

  // =========================================================================
  // 5. 消费流水记录与预警风控核心逻辑 (Payment Recording & Risk Detection)
  // =========================================================================
  describe("5. 消费流水上链、自动审批与超额拦截", function () {
    beforeEach(async function () {
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(ward).setThreshold(100);
    });

    it("仅授权预言机可以调用 recordPayment，非预言机调用回滚 (CallerIsNotOracle)", async function () {
      await expect(
        dapp.connect(stranger).recordPayment(ward.address, 50, "Catering")
      ).to.be.revertedWithCustomError(dapp, "CallerIsNotOracle");
    });

    it("被监护人地址为零地址时回滚 (AddressRequired)", async function () {
      await expect(
        dapp.connect(oracle).recordPayment(ethers.ZeroAddress, 50, "Catering")
      ).to.be.revertedWithCustomError(dapp, "AddressRequired");
    });

    it("被冻结账户发起消费时回滚拦截 (AccountIsFrozen)", async function () {
      await dapp.connect(owner).setFreezeAccount(ward.address, true);

      await expect(
        dapp.connect(oracle).recordPayment(ward.address, 50, "Catering")
      ).to.be.revertedWithCustomError(dapp, "AccountIsFrozen");
    });

    it("未超过消费阈值：自动批准交易 (PaymentAutoApproved)，并写入流水", async function () {
      await expect(dapp.connect(oracle).recordPayment(ward.address, 60, "Supermarket"))
        .to.emit(dapp, "PaymentAutoApproved")
        .withArgs(1n, ward.address, 60n);

      expect(await dapp.txCounter()).to.equal(1n);

      const txn = await dapp.transactions(1);
      expect(txn.id).to.equal(1n);
      expect(txn.ward).to.equal(ward.address);
      expect(txn.amount).to.equal(60n);
      expect(txn.merchantType).to.equal("Supermarket");
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
      expect(txn.isPaid).to.be.true;

      // 验证被监护人交易列表
      const txIds = await dapp.getWardTransactionIds(ward.address);
      expect(txIds).to.deep.equal([1n]);
    });

    it("超过消费阈值且已绑定监护人：进入待审批状态 (PaymentPendingApproval)", async function () {
      await expect(dapp.connect(oracle).recordPayment(ward.address, 200, "Digital"))
        .to.emit(dapp, "PaymentPendingApproval")
        .withArgs(1n, ward.address, 200n);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.true;
      expect(txn.isApproved).to.be.false;
      expect(txn.isPaid).to.be.false;
    });

    it("商户处于黑名单中：即使未超阈值也强制进入待审批", async function () {
      await dapp.connect(owner).setBannedMerchant("Gambling", true);

      // 金额 30 低于阈值 100，但属于黑名单商户
      await expect(dapp.connect(oracle).recordPayment(ward.address, 30, "Gambling"))
        .to.emit(dapp, "PaymentPendingApproval")
        .withArgs(1n, ward.address, 30n);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.true;
      expect(txn.isApproved).to.be.false;
    });

    it("被监护人未绑定任何监护人时：即使超额也自动批准 (因为无监护人可审批)", async function () {
      // 使用未绑定监护人的 stranger 作为 ward2
      const ward2 = stranger;
      await expect(dapp.connect(oracle).recordPayment(ward2.address, 99999, "Luxury"))
        .to.emit(dapp, "PaymentAutoApproved")
        .withArgs(1n, ward2.address, 99999n);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
    });
  });

  // =========================================================================
  // 6. 交易审批流程与越权校验 (Transaction Approval & Reverts)
  // =========================================================================
  describe("6. 交易审批流与异常回滚", function () {
    beforeEach(async function () {
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(ward).setThreshold(100);
      // 产生一笔待审批交易 (ID: 1)
      await dapp.connect(oracle).recordPayment(ward.address, 300, "Electronics");
    });

    it("合法监护人审批通过：状态更新为已批准 (isApproved = true)，触发 TransactionConfirmed", async function () {
      await expect(dapp.connect(guardian).confirmTransaction(1, true))
        .to.emit(dapp, "TransactionConfirmed")
        .withArgs(1n, guardian.address);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
    });

    it("合法监护人拒绝交易：状态更新为未批准 (isApproved = false)，触发 TransactionRejected", async function () {
      await expect(dapp.connect(guardian).confirmTransaction(1, false))
        .to.emit(dapp, "TransactionRejected")
        .withArgs(1n, guardian.address);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.false;
    });

    it("非关联第三方尝试审批待处理交易回滚 (NotAuthorizedGuardian)", async function () {
      await expect(
        dapp.connect(stranger).confirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("重复审批或对非 Pending 交易审批时回滚 (NotPendingTransaction)", async function () {
      await dapp.connect(guardian).confirmTransaction(1, true);

      // 已审批完成，再次审批应回滚
      await expect(
        dapp.connect(guardian).confirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "NotPendingTransaction");
    });

    it("对不存在的交易 ID 执行审批时回滚 (TransactionNotFound)", async function () {
      await expect(
        dapp.connect(guardian).confirmTransaction(9999, true)
      ).to.be.revertedWithCustomError(dapp, "TransactionNotFound");
    });

    it("管理员可通过 adminConfirmTransaction 强行审批，非管理员回滚", async function () {
      // Owner 强制审批
      await dapp.connect(owner).adminConfirmTransaction(1, true);
      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;

      // 非 Owner 越权调用回滚
      await expect(
        dapp.connect(stranger).adminConfirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");

      // 不存在的交易回滚
      await expect(
        dapp.connect(owner).adminConfirmTransaction(9999, true)
      ).to.be.revertedWithCustomError(dapp, "TransactionNotFound");
    });

    it("getPendingTransactions 应准确返回监护人名下的待处理交易列表", async function () {
      // 再产生一笔待审批交易 (ID: 2)
      await dapp.connect(oracle).recordPayment(ward.address, 500, "Jewelry");

      const pendingIds = await dapp.getPendingTransactions(guardian.address);
      expect(pendingIds.length).to.equal(2);
      expect(pendingIds[0]).to.equal(1n);
      expect(pendingIds[1]).to.equal(2n);

      // stranger 名下无待处理
      const strangerPending = await dapp.getPendingTransactions(stranger.address);
      expect(strangerPending.length).to.equal(0);
    });
  });

  // =========================================================================
  // 7. 预言机支付回执与预言机维护 (Payment Success & Oracle Management)
  // =========================================================================
  describe("7. 支付成功标记与预言机地址维护", function () {
    beforeEach(async function () {
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(ward).setThreshold(100);
      await dapp.connect(oracle).recordPayment(ward.address, 200, "Sports");
    });

    it("预言机成功标记已批准订单为支付成功 (isPaid = true)", async function () {
      // 监护人先审批通过
      await dapp.connect(guardian).confirmTransaction(1, true);

      // 预言机标记支付完成
      await dapp.connect(oracle).markPaymentSuccess(1);
      const txn = await dapp.transactions(1);
      expect(txn.isPaid).to.be.true;
    });

    it("非预言机调用 markPaymentSuccess 回滚 (CallerIsNotOracle)", async function () {
      await dapp.connect(guardian).confirmTransaction(1, true);

      await expect(
        dapp.connect(stranger).markPaymentSuccess(1)
      ).to.be.revertedWithCustomError(dapp, "CallerIsNotOracle");
    });

    it("对未获批准的交易标记支付成功时回滚 (NotPendingTransaction)", async function () {
      // 交易 1 仍在 pending 状态，未经审批
      await expect(
        dapp.connect(oracle).markPaymentSuccess(1)
      ).to.be.revertedWithCustomError(dapp, "NotPendingTransaction");
    });

    it("对不存在的交易标记支付成功时回滚 (TransactionNotFound)", async function () {
      await expect(
        dapp.connect(oracle).markPaymentSuccess(8888)
      ).to.be.revertedWithCustomError(dapp, "TransactionNotFound");
    });

    it("Owner 可更新预言机地址，非 Owner 或零地址更新应回滚", async function () {
      // Owner 成功更新
      await dapp.connect(owner).updateOracle(stranger.address);
      expect(await dapp.oracle()).to.equal(stranger.address);

      // 非 Owner 更新回滚
      await expect(
        dapp.connect(ward).updateOracle(oracle.address)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");

      // 零地址更新回滚
      await expect(
        dapp.connect(owner).updateOracle(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(dapp, "InvalidAddress");
    });
  });

  // =========================================================================
  // 8. AI 诊断报告存证与防篡改验证 (AI Report Hash Storage & Integrity)
  // =========================================================================
  describe("8. AI 报告哈希链上存证与异常校验", function () {
    it("Owner 成功记录 AI 报告哈希并触发 AiReportHashStored 事件", async function () {
      await expect(dapp.connect(owner).storeAiReportHash(ward.address, MONTH, DUMMY_HASH))
        .to.emit(dapp, "AiReportHashStored")
        .withArgs(ward.address, MONTH, DUMMY_HASH);

      expect(await dapp.aiReportHashes(ward.address, MONTH)).to.equal(DUMMY_HASH);
    });

    it("非 Owner 存储 AI 报告哈希时回滚 (OwnableUnauthorizedAccount)", async function () {
      await expect(
        dapp.connect(stranger).storeAiReportHash(ward.address, MONTH, DUMMY_HASH)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");
    });

    it("存储 AI 报告哈希时的参数异常拦截：零地址、空月份或零哈希", async function () {
      // 零地址 ward
      await expect(
        dapp.connect(owner).storeAiReportHash(ethers.ZeroAddress, MONTH, DUMMY_HASH)
      ).to.be.revertedWithCustomError(dapp, "InvalidAddress");

      // 空月份
      await expect(
        dapp.connect(owner).storeAiReportHash(ward.address, "", DUMMY_HASH)
      ).to.be.revertedWithCustomError(dapp, "MonthRequired");

      // 零值哈希
      await expect(
        dapp.connect(owner).storeAiReportHash(ward.address, MONTH, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(dapp, "HashRequired");
    });
  });

  // =========================================================================
  // 9. 多对多监护关系拓扑 (M:N Guardianship Topologies)
  // =========================================================================
  describe("9. 多对多监护人关系拓扑与跨被监护人治理", function () {
    it("支持一个被监护人绑定多个监护人，任一监护人均可独立完成待审批", async function () {
      // 绑定两个监护人
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(owner).bindGuardian(ward.address, guardian2.address);

      const guardians = await dapp.getWardGuardians(ward.address);
      expect(guardians.length).to.equal(2);
      expect(guardians).to.include(guardian.address);
      expect(guardians).to.include(guardian2.address);

      // 产生待审批订单
      await dapp.connect(ward).setThreshold(100);
      await dapp.connect(oracle).recordPayment(ward.address, 300, "Books");

      // 两个监护人均能查到此待审批单
      expect((await dapp.getPendingTransactions(guardian.address)).length).to.equal(1);
      expect((await dapp.getPendingTransactions(guardian2.address)).length).to.equal(1);

      // 由 guardian2 批准该订单
      await dapp.connect(guardian2).confirmTransaction(1, true);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
    });

    it("支持一个监护人跨账户监管多个被监护人", async function () {
      const ward2 = stranger;
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(owner).bindGuardian(ward2.address, guardian.address);

      await dapp.connect(ward).setThreshold(100);
      await dapp.connect(ward2).setThreshold(100);

      // 各自产生一笔超额消费
      await dapp.connect(oracle).recordPayment(ward.address, 200, "Travel");
      await dapp.connect(oracle).recordPayment(ward2.address, 400, "Hotel");

      // 监护人汇总列表应同时包含来自 ward 与 ward2 的交易 ID
      const pendingList = await dapp.getPendingTransactions(guardian.address);
      expect(pendingList.length).to.equal(2);
      expect(pendingList[0]).to.equal(1n);
      expect(pendingList[1]).to.equal(2n);
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("GuardianDApp 智能合约综合测试套件", function () {
  const MONTH = "2026-06";
  const DUMMY_HASH = ethers.keccak256(ethers.toUtf8Bytes("AI 消费健康报告"));

  // =========================================================================
  // 快照部署 Fixtures (loadFixture)
  // =========================================================================
  async function deployGuardianDAppFixture() {
    const [owner, oracle, ward, guardian, guardian2, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GuardianDApp");
    const dapp = await Factory.deploy(oracle.address);
    return { dapp, Factory, owner, oracle, ward, guardian, guardian2, stranger };
  }

  async function boundWardFixture() {
    const fixture = await deployGuardianDAppFixture();
    const { dapp, owner, ward, guardian } = fixture;
    await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
    await dapp.connect(ward).setThreshold(ethers.parseEther("100"));
    return fixture;
  }

  async function pendingTxFixture() {
    const fixture = await boundWardFixture();
    const { dapp, oracle, ward } = fixture;
    // 产生一笔待审批交易 (ID: 1, 金额: 300 ETH)
    await dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("300"), "Electronics");
    return fixture;
  }

  async function paymentSuccessFixture() {
    const fixture = await boundWardFixture();
    const { dapp, oracle, ward } = fixture;
    // 产生一笔待审批交易 (ID: 1, 金额: 200 ETH)
    await dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("200"), "Sports");
    return fixture;
  }

  // =========================================================================
  // 1. 合约部署与初始化测试 (Deployment & Initialization)
  // =========================================================================
  describe("1. 合约部署与初始状态验证", function () {
    it("部署成功时应正确设置拥有者 (Owner) 与预言机 (Oracle) 地址", async function () {
      const { dapp, owner, oracle } = await loadFixture(deployGuardianDAppFixture);
      expect(await dapp.owner()).to.equal(owner.address);
      expect(await dapp.oracle()).to.equal(oracle.address);
    });

    it("初始状态计数器 txCounter 应为 0", async function () {
      const { dapp } = await loadFixture(deployGuardianDAppFixture);
      expect(await dapp.txCounter()).to.equal(0n);
    });

    it("部署时若传入零地址预言机，应触发 require/revert 拦截并回滚 (InvalidAddress)", async function () {
      const { Factory } = await loadFixture(deployGuardianDAppFixture);
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
      const { dapp, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
      await expect(dapp.connect(ward).requestGuardian(guardian.address))
        .to.emit(dapp, "GuardianshipRequested")
        .withArgs(ward.address, guardian.address);

      expect(await dapp.pendingWardToGuardian(ward.address)).to.equal(guardian.address);
    });

    it("重复申请绑定同一监护人时，合约应正确拦截并回滚 (AlreadyRequested)", async function () {
      const { dapp, ward, guardian } = await loadFixture(deployGuardianDAppFixture);

      // 首次申请成功
      await expect(dapp.connect(ward).requestGuardian(guardian.address))
        .to.emit(dapp, "GuardianshipRequested")
        .withArgs(ward.address, guardian.address);

      // 重复申请同一监护人，应触发 AlreadyRequested 回滚
      await expect(
        dapp.connect(ward).requestGuardian(guardian.address)
      ).to.be.revertedWithCustomError(dapp, "AlreadyRequested");
    });

    it("申请绑定时：被监护人不能将自己设为监护人 (CannotBeOwnGuardian)", async function () {
      const { dapp, ward } = await loadFixture(deployGuardianDAppFixture);
      await expect(
        dapp.connect(ward).requestGuardian(ward.address)
      ).to.be.revertedWithCustomError(dapp, "CannotBeOwnGuardian");
    });

    it("申请绑定时：监护人地址不能为零地址 (InvalidAddress)", async function () {
      const { dapp, ward } = await loadFixture(deployGuardianDAppFixture);
      await expect(
        dapp.connect(ward).requestGuardian(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(dapp, "InvalidAddress");
    });

    it("目标监护人同意申请：更新监护列表、映射状态与 isGuardian 标记，触发相应事件", async function () {
      const { dapp, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
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
      const { dapp, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(ward).requestGuardian(guardian.address);

      await expect(dapp.connect(guardian).rejectGuardianship(ward.address))
        .to.emit(dapp, "GuardianshipRejected")
        .withArgs(ward.address, guardian.address);

      expect(await dapp.pendingWardToGuardian(ward.address)).to.equal(ethers.ZeroAddress);
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.false;
    });

    it("非指定监护人调用 accept/reject 应回滚 (NoPendingRequestForYou)", async function () {
      const { dapp, ward, guardian, stranger } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(ward).requestGuardian(guardian.address);

      await expect(
        dapp.connect(stranger).acceptGuardianship(ward.address)
      ).to.be.revertedWithCustomError(dapp, "NoPendingRequestForYou");

      await expect(
        dapp.connect(stranger).rejectGuardianship(ward.address)
      ).to.be.revertedWithCustomError(dapp, "NoPendingRequestForYou");
    });

    it("监护人可主动邀请被监护人，且被监护人接受后才建立绑定关系", async function () {
      const { dapp, ward, guardian } = await loadFixture(deployGuardianDAppFixture);

      await expect(dapp.connect(guardian).requestGuardianshipInvite(ward.address))
        .to.emit(dapp, "GuardianInvitationRequested")
        .withArgs(ward.address, guardian.address);
      expect(await dapp.pendingGuardianInvites(ward.address)).to.equal(guardian.address);
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.false;

      await expect(dapp.connect(ward).acceptGuardianInvitation())
        .to.emit(dapp, "GuardianInvitationAccepted")
        .withArgs(ward.address, guardian.address)
        .and.to.emit(dapp, "GuardianBound")
        .withArgs(ward.address, guardian.address);
      expect(await dapp.pendingGuardianInvites(ward.address)).to.equal(ethers.ZeroAddress);
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.true;
    });

    it("被监护人可拒绝监护人邀请，且不会建立绑定关系", async function () {
      const { dapp, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(guardian).requestGuardianshipInvite(ward.address);

      await expect(dapp.connect(ward).rejectGuardianInvitation())
        .to.emit(dapp, "GuardianInvitationRejected")
        .withArgs(ward.address, guardian.address);
      expect(await dapp.pendingGuardianInvites(ward.address)).to.equal(ethers.ZeroAddress);
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.false;
    });

    it("没有收到监护人邀请时不能确认或拒绝", async function () {
      const { dapp, ward } = await loadFixture(deployGuardianDAppFixture);
      await expect(dapp.connect(ward).acceptGuardianInvitation())
        .to.be.revertedWithCustomError(dapp, "NoPendingRequestForYou");
      await expect(dapp.connect(ward).rejectGuardianInvitation())
        .to.be.revertedWithCustomError(dapp, "NoPendingRequestForYou");
    });

    it("管理员直接绑定：Owner 可通过 bindGuardian 绑定，非 Owner 调用回滚", async function () {
      const { dapp, owner, ward, guardian, guardian2, stranger } = await loadFixture(deployGuardianDAppFixture);
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
      const { dapp, ward } = await loadFixture(deployGuardianDAppFixture);
      const thresholdAmount = ethers.parseEther("500");
      await expect(dapp.connect(ward).setThreshold(thresholdAmount))
        .to.emit(dapp, "ThresholdSet")
        .withArgs(ward.address, thresholdAmount);

      expect(await dapp.threshold(ward.address)).to.equal(thresholdAmount);
    });

    it("授权监护人可设置被监护人的阈值", async function () {
      const { dapp, owner, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);

      const thresholdAmount = ethers.parseEther("800");
      await expect(dapp.connect(guardian).setGuardianThreshold(ward.address, thresholdAmount))
        .to.emit(dapp, "ThresholdSet")
        .withArgs(ward.address, thresholdAmount);

      expect(await dapp.threshold(ward.address)).to.equal(thresholdAmount);
    });

    it("非授权监护人尝试设置被监护人阈值时回滚 (NotAuthorizedGuardian)", async function () {
      const { dapp, ward, stranger } = await loadFixture(deployGuardianDAppFixture);
      const thresholdAmount = ethers.parseEther("800");
      await expect(
        dapp.connect(stranger).setGuardianThreshold(ward.address, thresholdAmount)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("管理员可通过 adminSetThreshold 设置阈值，非管理员调用回滚", async function () {
      const { dapp, owner, ward, stranger } = await loadFixture(deployGuardianDAppFixture);
      const thresholdAmount = ethers.parseEther("1200");
      await expect(dapp.connect(owner).adminSetThreshold(ward.address, thresholdAmount))
        .to.emit(dapp, "ThresholdSet")
        .withArgs(ward.address, thresholdAmount);

      expect(await dapp.threshold(ward.address)).to.equal(thresholdAmount);

      await expect(
        dapp.connect(stranger).adminSetThreshold(ward.address, ethers.parseEther("1500"))
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================================================
  // 4. 账户冻结与商户黑名单权限管理 (Freezing & Risk Blacklist)
  // =========================================================================
  describe("4. 账户冻结与商户风控权限管理", function () {
    it("Owner 与绑定监护人均有权冻结及解冻账户", async function () {
      const { dapp, owner, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
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
      const { dapp, ward, stranger } = await loadFixture(deployGuardianDAppFixture);
      await expect(
        dapp.connect(stranger).setFreezeAccount(ward.address, true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("Owner 与绑定监护人可管理其被监护人的黑名单商户", async function () {
      const { dapp, owner, ward, guardian, guardian2 } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);

      // Owner 标记黑名单
      await expect(dapp.connect(owner).setBannedMerchant(ward.address, "Casino", true))
        .to.emit(dapp, "BannedMerchantSet")
        .withArgs(ward.address, "Casino", true);
      expect(await dapp.bannedMerchants(ward.address, "Casino")).to.be.true;

      // 监护人标记黑名单
      await expect(dapp.connect(guardian).setBannedMerchant(ward.address, "Nightclub", true))
        .to.emit(dapp, "BannedMerchantSet")
        .withArgs(ward.address, "Nightclub", true);
      expect(await dapp.bannedMerchants(ward.address, "Nightclub")).to.be.true;
      expect(await dapp.bannedMerchants(guardian2.address, "Nightclub")).to.be.false;
    });

    it("普通用户/第三方设置黑名单商户应被拦截回滚 (OnlyOwnerOrGuardian)", async function () {
      const { dapp, ward, stranger } = await loadFixture(deployGuardianDAppFixture);
      await expect(
        dapp.connect(ward).setBannedMerchant(ward.address, "GameStore", true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");

      await expect(
        dapp.connect(stranger).setBannedMerchant(ward.address, "GameStore", true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });
  });

  // =========================================================================
  // 5. 消费流水记录与预警风控核心逻辑 (Payment Recording & Risk Detection)
  // =========================================================================
  describe("5. 消费流水上链、自动审批与超额拦截", function () {
    it("仅授权预言机可以调用 recordPayment，非预言机调用回滚 (CallerIsNotOracle)", async function () {
      const { dapp, ward, stranger } = await loadFixture(boundWardFixture);
      await expect(
        dapp.connect(stranger).recordPayment(ward.address, ethers.parseEther("50"), "Catering")
      ).to.be.revertedWithCustomError(dapp, "CallerIsNotOracle");
    });

    it("被监护人地址为零地址时回滚 (AddressRequired)", async function () {
      const { dapp, oracle } = await loadFixture(boundWardFixture);
      await expect(
        dapp.connect(oracle).recordPayment(ethers.ZeroAddress, ethers.parseEther("50"), "Catering")
      ).to.be.revertedWithCustomError(dapp, "AddressRequired");
    });

    it("被冻结账户发起消费时回滚拦截 (AccountIsFrozen)", async function () {
      const { dapp, owner, oracle, ward } = await loadFixture(boundWardFixture);
      await dapp.connect(owner).setFreezeAccount(ward.address, true);

      await expect(
        dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("50"), "Catering")
      ).to.be.revertedWithCustomError(dapp, "AccountIsFrozen");
    });

    it("如果 ward 的 threshold 设为 0，消费应被正确拦截进入待审批 (PaymentPendingApproval)", async function () {
      const { dapp, oracle, ward } = await loadFixture(boundWardFixture);
      // 将 threshold 设为 0
      await dapp.connect(ward).setThreshold(0n);
      expect(await dapp.threshold(ward.address)).to.equal(0n);

      const amount = ethers.parseEther("50");
      await expect(dapp.connect(oracle).recordPayment(ward.address, amount, "DailyExpense"))
        .to.emit(dapp, "PaymentPendingApproval")
        .withArgs(1n, ward.address, amount);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.true;
      expect(txn.isApproved).to.be.false;
      expect(txn.isPaid).to.be.false;
    });

    it("未超过消费阈值：自动批准交易 (PaymentAutoApproved)，并写入流水", async function () {
      const { dapp, oracle, ward } = await loadFixture(boundWardFixture);
      const amount = ethers.parseEther("60");
      await expect(dapp.connect(oracle).recordPayment(ward.address, amount, "Supermarket"))
        .to.emit(dapp, "PaymentAutoApproved")
        .withArgs(1n, ward.address, amount);

      expect(await dapp.txCounter()).to.equal(1n);

      const txn = await dapp.transactions(1);
      expect(txn.id).to.equal(1n);
      expect(txn.ward).to.equal(ward.address);
      expect(txn.amount).to.equal(amount);
      expect(txn.merchantType).to.equal("Supermarket");
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
      expect(txn.isPaid).to.be.true;

      // 验证被监护人交易列表
      const txIds = await dapp.getWardTransactionIds(ward.address);
      expect(txIds).to.deep.equal([1n]);
    });

    it("超过消费阈值且已绑定监护人：进入待审批状态 (PaymentPendingApproval)", async function () {
      const { dapp, oracle, ward } = await loadFixture(boundWardFixture);
      const amount = ethers.parseEther("200");
      await expect(dapp.connect(oracle).recordPayment(ward.address, amount, "Digital"))
        .to.emit(dapp, "PaymentPendingApproval")
        .withArgs(1n, ward.address, amount);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.true;
      expect(txn.isApproved).to.be.false;
      expect(txn.isPaid).to.be.false;
    });

    it("商户处于黑名单中：即使未超阈值也强制进入待审批", async function () {
      const { dapp, owner, oracle, ward } = await loadFixture(boundWardFixture);
      await dapp.connect(owner).setBannedMerchant(ward.address, "Gambling", true);

      // 金额 30 ETH 低于阈值 100 ETH，但属于黑名单商户
      const amount = ethers.parseEther("30");
      await expect(dapp.connect(oracle).recordPayment(ward.address, amount, "Gambling"))
        .to.emit(dapp, "PaymentPendingApproval")
        .withArgs(1n, ward.address, amount);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.true;
      expect(txn.isApproved).to.be.false;
    });

    it("被监护人未绑定任何监护人时：即使超额也自动批准 (因为无监护人可审批)", async function () {
      const { dapp, oracle, stranger } = await loadFixture(deployGuardianDAppFixture);
      // 使用未绑定监护人的 stranger 作为 ward2，测试超大额 (99999 ETH)
      const ward2 = stranger;
      const largeAmount = ethers.parseEther("99999");
      await expect(dapp.connect(oracle).recordPayment(ward2.address, largeAmount, "Luxury"))
        .to.emit(dapp, "PaymentAutoApproved")
        .withArgs(1n, ward2.address, largeAmount);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
      expect(txn.amount).to.equal(largeAmount);
    });
  });

  // =========================================================================
  // 6. 交易审批流程与越权校验 (Transaction Approval & Reverts)
  // =========================================================================
  describe("6. 交易审批流与异常回滚", function () {
    it("合法监护人审批通过：状态更新为已批准 (isApproved = true)，触发 TransactionConfirmed", async function () {
      const { dapp, guardian } = await loadFixture(pendingTxFixture);
      await expect(dapp.connect(guardian).confirmTransaction(1, true))
        .to.emit(dapp, "TransactionConfirmed")
        .withArgs(1n, guardian.address);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
    });

    it("合法监护人拒绝交易：状态更新为未批准 (isApproved = false)，触发 TransactionRejected", async function () {
      const { dapp, guardian } = await loadFixture(pendingTxFixture);
      await expect(dapp.connect(guardian).confirmTransaction(1, false))
        .to.emit(dapp, "TransactionRejected")
        .withArgs(1n, guardian.address);

      const txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.false;
    });

    it("非关联第三方尝试审批待处理交易回滚 (NotAuthorizedGuardian)", async function () {
      const { dapp, stranger } = await loadFixture(pendingTxFixture);
      await expect(
        dapp.connect(stranger).confirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("重复审批或对非 Pending 交易审批时回滚 (NotPendingTransaction)", async function () {
      const { dapp, guardian } = await loadFixture(pendingTxFixture);
      await dapp.connect(guardian).confirmTransaction(1, true);

      // 已审批完成，再次审批应回滚
      await expect(
        dapp.connect(guardian).confirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "NotPendingTransaction");
    });

    it("对不存在的交易 ID 执行审批时回滚 (TransactionNotFound)", async function () {
      const { dapp, guardian } = await loadFixture(pendingTxFixture);
      await expect(
        dapp.connect(guardian).confirmTransaction(9999, true)
      ).to.be.revertedWithCustomError(dapp, "TransactionNotFound");
    });

    it("管理员可通过 adminConfirmTransaction 强行审批，非管理员回滚", async function () {
      const { dapp, owner, stranger } = await loadFixture(pendingTxFixture);
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
      const { dapp, oracle, ward, guardian, stranger } = await loadFixture(pendingTxFixture);
      // 再产生一笔待审批交易 (ID: 2, 金额: 500 ETH)
      await dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("500"), "Jewelry");

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
    it("预言机成功标记已批准订单为支付成功 (isPaid = true)", async function () {
      const { dapp, oracle, guardian } = await loadFixture(paymentSuccessFixture);
      // 监护人先审批通过
      await dapp.connect(guardian).confirmTransaction(1, true);

      // 预言机标记支付完成
      await dapp.connect(oracle).markPaymentSuccess(1);
      const txn = await dapp.transactions(1);
      expect(txn.isPaid).to.be.true;
    });

    it("非预言机调用 markPaymentSuccess 回滚 (CallerIsNotOracle)", async function () {
      const { dapp, guardian, stranger } = await loadFixture(paymentSuccessFixture);
      await dapp.connect(guardian).confirmTransaction(1, true);

      await expect(
        dapp.connect(stranger).markPaymentSuccess(1)
      ).to.be.revertedWithCustomError(dapp, "CallerIsNotOracle");
    });

    it("对未获批准的交易标记支付成功时回滚 (NotPendingTransaction)", async function () {
      const { dapp, oracle } = await loadFixture(paymentSuccessFixture);
      // 交易 1 仍在 pending 状态，未经审批
      await expect(
        dapp.connect(oracle).markPaymentSuccess(1)
      ).to.be.revertedWithCustomError(dapp, "NotPendingTransaction");
    });

    it("对不存在的交易标记支付成功时回滚 (TransactionNotFound)", async function () {
      const { dapp, oracle } = await loadFixture(paymentSuccessFixture);
      await expect(
        dapp.connect(oracle).markPaymentSuccess(8888)
      ).to.be.revertedWithCustomError(dapp, "TransactionNotFound");
    });

    it("Owner 可更新预言机地址，非 Owner 或零地址更新应回滚", async function () {
      const { dapp, owner, oracle, ward, stranger } = await loadFixture(paymentSuccessFixture);
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
      const { dapp, owner, ward } = await loadFixture(deployGuardianDAppFixture);
      await expect(dapp.connect(owner).storeAiReportHash(ward.address, MONTH, DUMMY_HASH))
        .to.emit(dapp, "AiReportHashStored")
        .withArgs(ward.address, MONTH, DUMMY_HASH);

      expect(await dapp.aiReportHashes(ward.address, MONTH)).to.equal(DUMMY_HASH);
    });

    it("非 Owner 存储 AI 报告哈希时回滚 (OwnableUnauthorizedAccount)", async function () {
      const { dapp, ward, stranger } = await loadFixture(deployGuardianDAppFixture);
      await expect(
        dapp.connect(stranger).storeAiReportHash(ward.address, MONTH, DUMMY_HASH)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");
    });

    it("存储 AI 报告哈希时的参数异常拦截：零地址、空月份或零哈希", async function () {
      const { dapp, owner, ward } = await loadFixture(deployGuardianDAppFixture);
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
    it("可设置两人通过门槛，并在两名不同监护人同意后才批准消费", async function () {
      const { dapp, owner, oracle, ward, guardian, guardian2 } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(owner).bindGuardian(ward.address, guardian2.address);
      await dapp.connect(guardian).setApprovalRequirement(ward.address, 2);
      await dapp.connect(ward).setThreshold(ethers.parseEther("100"));
      await dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("300"), "Books");

      await expect(dapp.connect(guardian).confirmTransaction(1, true))
        .to.emit(dapp, "TransactionApprovalRecorded")
        .withArgs(1n, guardian.address, 1n, 2n);
      let txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.true;
      expect(txn.isApproved).to.be.false;
      expect(await dapp.getTransactionApprovalStatus(1)).to.deep.equal([2n, 1n]);

      await expect(dapp.connect(guardian).confirmTransaction(1, true))
        .to.be.revertedWithCustomError(dapp, "GuardianAlreadyApproved");
      await dapp.connect(guardian2).confirmTransaction(1, true);
      txn = await dapp.transactions(1);
      expect(txn.isPending).to.be.false;
      expect(txn.isApproved).to.be.true;
    });

    it("审批门槛不能为零或超过已绑定监护人数", async function () {
      const { dapp, owner, ward, guardian } = await loadFixture(deployGuardianDAppFixture);
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await expect(dapp.connect(guardian).setApprovalRequirement(ward.address, 0))
        .to.be.revertedWithCustomError(dapp, "InvalidApprovalRequirement");
      await expect(dapp.connect(guardian).setApprovalRequirement(ward.address, 2))
        .to.be.revertedWithCustomError(dapp, "InvalidApprovalRequirement");
    });

    it("支持一个被监护人绑定多个监护人，任一监护人均可独立完成待审批", async function () {
      const { dapp, owner, oracle, ward, guardian, guardian2 } = await loadFixture(deployGuardianDAppFixture);
      // 绑定两个监护人
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(owner).bindGuardian(ward.address, guardian2.address);

      const guardians = await dapp.getWardGuardians(ward.address);
      expect(guardians.length).to.equal(2);
      expect(guardians).to.include(guardian.address);
      expect(guardians).to.include(guardian2.address);

      // 产生待审批订单 (阈值 100 ETH, 消费 300 ETH)
      await dapp.connect(ward).setThreshold(ethers.parseEther("100"));
      await dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("300"), "Books");

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
      const { dapp, owner, oracle, ward, guardian, stranger } = await loadFixture(deployGuardianDAppFixture);
      const ward2 = stranger;
      await dapp.connect(owner).bindGuardian(ward.address, guardian.address);
      await dapp.connect(owner).bindGuardian(ward2.address, guardian.address);

      await dapp.connect(ward).setThreshold(ethers.parseEther("100"));
      await dapp.connect(ward2).setThreshold(ethers.parseEther("100"));

      // 各自产生一笔超额消费 (200 ETH, 400 ETH)
      await dapp.connect(oracle).recordPayment(ward.address, ethers.parseEther("200"), "Travel");
      await dapp.connect(oracle).recordPayment(ward2.address, ethers.parseEther("400"), "Hotel");

      // 监护人汇总列表应同时包含来自 ward 与 ward2 的交易 ID
      const pendingList = await dapp.getPendingTransactions(guardian.address);
      expect(pendingList.length).to.equal(2);
      expect(pendingList[0]).to.equal(1n);
      expect(pendingList[1]).to.equal(2n);
    });
  });
});

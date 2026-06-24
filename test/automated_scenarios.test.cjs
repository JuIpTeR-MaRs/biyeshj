const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("智能监护系统 - 核心业务流程自动化测试", function () {
  let dapp;
  let owner, oracle, ward, guardian, merchant;
  const MONTH = "2026-06";

  before(async function () {
    [owner, ward, guardian, merchant] = await ethers.getSigners();
    oracle = owner; // 合约拥有者兼任预言机角色
    const Factory = await ethers.getContractFactory("GuardianDApp");
    dapp = await Factory.deploy(oracle.address);
  });

  describe("4.2.1 测试用例一：用户注册与登录 (模拟)", function () {
    it("被监护人与监护人账户应成功初始化并在链上具备有效地址", async function () {
      // 对应测试步骤 (1)-(4)：系统注册并登录，获取各自钱包地址
      // 预期结果：被监护人（张三）和监护人（李四）具备独立的区块链钱包地址
      expect(ward.address).to.not.equal(ethers.ZeroAddress);
      expect(guardian.address).to.not.equal(ethers.ZeroAddress);
      console.log(`      [步骤 (2)] 被监护人（张三）账户地址: ${ward.address}`);
      console.log(`      [步骤 (2)] 监护人（李四）账户地址: ${guardian.address}`);
    });
  });

  describe("4.2.2 测试用例二：监护关系绑定", function () {
    it("被监护人申请绑定，监护人同意，绑定状态在链上正确更新", async function () {
      // 对应测试步骤 (1)-(3)：被监护人张三向监护人李四发起绑定申请
      console.log("      [步骤 (1)-(3)] 被监护人张三发起向监护人李四的绑定申请...");
      const requestTx = await dapp.connect(ward).requestGuardian(guardian.address);
      await requestTx.wait();
      
      // 验证步骤 (4)：系统成功生成待确认关系
      const pendingG = await dapp.pendingWardToGuardian(ward.address);
      expect(pendingG).to.equal(guardian.address);
      console.log(`      [验证步骤 (4)] 链上记录的待确认监护人: ${pendingG}`);

      // 对应测试步骤 (5)-(6)：监护人李四确认并同意绑定申请
      console.log("      [步骤 (5)-(6)] 监护人李四确认并同意绑定申请...");
      const acceptTx = await dapp.connect(guardian).acceptGuardianship(ward.address);
      await acceptTx.wait();

      // 预期结果验证：绑定成功，张三的监护人更新为李四
      const boundG = await dapp.wardToGuardian(ward.address);
      expect(boundG).to.equal(guardian.address);
      console.log(`      [预期结果验证] 被监护人张三当前绑定的监护人: ${boundG}`);

      const isBound = await dapp.isWardGuardian(ward.address, guardian.address);
      expect(isBound).to.be.true;
      console.log("      [预期结果验证] 链上监护关系(isWardGuardian)判定验证成功！");
    });
  });

  describe("4.2.3 测试用例三：设置消费阈值", function () {
    it("监护人应能成功设定被监护人的单笔消费预警阈值", async function () {
      // 对应测试步骤 (1)-(3)：监护人李四修改张三的阈值为 100 元 (100 Wei)
      console.log("      [步骤 (1)-(3)] 监护人李四设置张三的单笔消费阈值为 100 元...");
      const thresholdTx = await dapp.connect(guardian).setGuardianThreshold(ward.address, 100);
      await thresholdTx.wait();

      // 预期结果验证：张三的链上消费阈值更新为 100
      const currentThreshold = await dapp.threshold(ward.address);
      expect(currentThreshold).to.equal(100n);
      console.log(`      [预期结果验证] 链上查询张三的当前消费阈值: ${currentThreshold} 元`);
    });
  });

  describe("4.2.4 测试用例四：正常消费（未超阈值）", function () {
    it("额度低于阈值的消费应通过风控，直接完成付款并自动上链记录", async function () {
      // 对应测试步骤 (1)-(3)：被监护人发起正常消费金额 50 元 (低于阈值 100)
      console.log("      [步骤 (1)-(3)] 被监护人发起餐饮美食消费: 50 元 (低于阈值 100)...");
      
      // 模拟支付宝支付回调后的预言机入账，触发 recordPayment
      const recordTx = await dapp.connect(oracle).recordPayment(ward.address, 50, "餐饮美食");
      const receipt = await recordTx.wait();
      
      // 预期结果验证：交易自动通过风控，直接完成支付并上链记录。isPending = false, isApproved = true
      const txDetails = await dapp.transactions(1); // 第一笔交易
      expect(txDetails.isPending).to.be.false;
      expect(txDetails.isApproved).to.be.true;
      expect(txDetails.isPaid).to.be.true;
      console.log(`      [预期结果验证] 链上第1笔交易详情 - 金额: ${txDetails.amount}, 是否Pending: ${txDetails.isPending}, 是否已审批: ${txDetails.isApproved}, 是否已支付: ${txDetails.isPaid}`);
      
      // 验证链上事件触发 PaymentAutoApproved
      let eventFound = false;
      for (const log of receipt.logs) {
        try {
          const parsedLog = dapp.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "PaymentAutoApproved") {
            eventFound = true;
            expect(parsedLog.args.ward).to.equal(ward.address);
            expect(parsedLog.args.amount).to.equal(50n);
            console.log(`      [链上事件验证] 成功拦截到 PaymentAutoApproved 事件! 交易ID: ${parsedLog.args.txId}, 被监护人: ${parsedLog.args.ward}, 金额: ${parsedLog.args.amount}`);
          }
        } catch (e) {}
      }
      expect(eventFound).to.be.true;
    });
  });

  describe("4.2.5 测试用例五：超额消费触发预警", function () {
    it("超额消费应触发前置风控拦截，链上交易记录为 Pending 待审批状态", async function () {
      // 对应测试步骤 (1)-(3)：被监护人输入消费金额 150 元 (超限) 并发起支付
      console.log("      [步骤 (1)-(3)] 被监护人发起娱乐购物消费: 150 元 (高于阈值 100)...");
      
      // 模拟预言机拦截，录入超限交易
      const recordTx = await dapp.connect(oracle).recordPayment(ward.address, 150, "娱乐购物");
      const receipt = await recordTx.wait();

      // 预期结果验证：交易进入待审批状态，isPending = true, isApproved = false
      const txDetails = await dapp.transactions(2); // 第二笔交易
      expect(txDetails.isPending).to.be.true;
      expect(txDetails.isApproved).to.be.false;
      expect(txDetails.isPaid).to.be.false;
      console.log(`      [预期结果验证] 链上第2笔交易详情 - 金额: ${txDetails.amount}, 是否Pending: ${txDetails.isPending}, 是否已审批: ${txDetails.isApproved}`);

      // 验证链上事件触发 PaymentPendingApproval
      let eventFound = false;
      for (const log of receipt.logs) {
        try {
          const parsedLog = dapp.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "PaymentPendingApproval") {
            eventFound = true;
            expect(parsedLog.args.ward).to.equal(ward.address);
            expect(parsedLog.args.amount).to.equal(150n);
            console.log(`      [链上事件验证] 成功拦截到 PaymentPendingApproval 事件! 交易ID: ${parsedLog.args.txId}, 被监护人: ${parsedLog.args.ward}, 金额: ${parsedLog.args.amount}`);
          }
        } catch (e) {}
      }
      expect(eventFound).to.be.true;
    });
  });

  describe("4.2.6 测试用例六：监护人审批超额交易", function () {
    it("监护人有权审批确认待定交易，通过后被监护人能成功触发完成付款", async function () {
      // 对应测试步骤 (1)-(3)：监护人李四对超限交易进行批准审批
      console.log("      [步骤 (1)-(3)] 监护人李四对第2笔超额交易 (150元) 进行批准审批...");
      const approveTx = await dapp.connect(guardian).confirmTransaction(2, true); // 交易ID为2
      const receipt = await approveTx.wait();

      // 预期结果验证：链上交易状态更新为已批准，isPending = false, isApproved = true
      const txDetails = await dapp.transactions(2);
      expect(txDetails.isPending).to.be.false;
      expect(txDetails.isApproved).to.be.true;
      console.log(`      [预期结果验证] 审批完成后第2笔交易详情 - 是否Pending: ${txDetails.isPending}, 是否已审批: ${txDetails.isApproved}`);

      // 验证链上事件触发 TransactionConfirmed
      let eventFound = false;
      for (const log of receipt.logs) {
        try {
          const parsedLog = dapp.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "TransactionConfirmed") {
            eventFound = true;
            expect(parsedLog.args.txId).to.equal(2n);
            expect(parsedLog.args.guardian).to.equal(guardian.address);
            console.log(`      [链上事件验证] 成功拦截到 TransactionConfirmed 事件! 交易ID: ${parsedLog.args.txId}, 审批人(监护人): ${parsedLog.args.guardian}`);
          }
        } catch (e) {}
      }
      expect(eventFound).to.be.true;

      // 对应测试步骤 (4)-(5)：被监护人完成支付后，预言机调用 markPaymentSuccess
      console.log("      [步骤 (4)-(5)] 被监护人继续付款成功，预言机调用 markPaymentSuccess 标记已完成支付...");
      const paySuccessTx = await dapp.connect(oracle).markPaymentSuccess(2);
      await paySuccessTx.wait();

      const updatedTx = await dapp.transactions(2);
      expect(updatedTx.isPaid).to.be.true;
      console.log(`      [验证步骤 (5)] 第2笔交易最终状态：已支付(isPaid) = ${updatedTx.isPaid}`);
    });
  });

  describe("4.2.7 测试用例七：AI消费诊断报告", function () {
    it("被监护人请求生成诊断报告，计算哈希并在链上完成存证校验", async function () {
      // 对应测试步骤 (1)-(3)：系统获取消费诊断内容并计算 SHA-256 哈希值
      console.log("      [步骤 (1)-(3)] 被监护人请求生成报告，系统生成摘要哈希值...");
      const reportText = "AI诊断报告正文：张三本月消费情况良好，娱乐开销占比有待降低，建议下月控制预算。";
      const reportHashBytes = ethers.keccak256(ethers.toUtf8Bytes(reportText));
      console.log(`      [步骤 (3)] 生成的报告 SHA-256 哈希值: ${reportHashBytes}`);

      // 对应测试步骤 (4)：管理员调用 storeAiReportHash 进行存证
      console.log("      [步骤 (4)] 管理员将哈希值在链上进行存证...");
      const storeTx = await dapp.connect(oracle).storeAiReportHash(ward.address, MONTH, reportHashBytes);
      await storeTx.wait();

      // 预期结果验证：报告哈希存证成功，能够从链上完美读回
      const storedHash = await dapp.aiReportHashes(ward.address, MONTH);
      expect(storedHash).to.equal(reportHashBytes);
      console.log(`      [预期结果验证] 链上成功查询并比对存证哈希: ${storedHash}`);
    });
  });

  describe("测试用例八：账户冻结与消费拦截 (特设校验)", function () {
    it("账户被冻结后，发起消费交易应直接被智能合约 revert 拒绝", async function () {
      console.log("      [步骤 1] 监护人李四发起冻结被监护人张三账户的链上操作...");
      const freezeTx = await dapp.connect(guardian).setFreezeAccount(ward.address, true);
      await freezeTx.wait();

      // 验证冻结状态为 true
      const isFrozen = await dapp.isFrozen(ward.address);
      expect(isFrozen).to.be.true;
      console.log(`      [步骤 2] 链上查询张三的冻结状态(isFrozen): ${isFrozen}`);

      // 验证预期结果：账户已被冻结，被监护人再次发起消费时，智能合约直接 revert 并抛出 AccountIsFrozen 错误
      console.log("      [步骤 3] 被监护人张三尝试再次消费，预言机调用 recordPayment...");
      await expect(
        dapp.connect(oracle).recordPayment(ward.address, 30, "餐饮美食")
      ).to.be.revertedWithCustomError(dapp, "AccountIsFrozen");
      console.log("      [预期结果验证] 交易被智能合约成功拦截，并精准抛出 AccountIsFrozen 错误！");

      // 解冻恢复
      console.log("      [步骤 4] 监护人解冻账户以恢复系统正常使用...");
      const unfreezeTx = await dapp.connect(guardian).setFreezeAccount(ward.address, false);
      await unfreezeTx.wait();
      expect(await dapp.isFrozen(ward.address)).to.be.false;
      console.log("      [步骤 5] 账户已成功解冻。");
    });
  });
});

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GuardianDApp Contract", function () {
  let dapp, oracle, ward, guardian, other;

  beforeEach(async function () {
    [oracle, ward, guardian, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GuardianDApp");
    dapp = await Factory.deploy(oracle.address);
  });

  describe("Binding", function () {
    it("Should allow a ward to request and a guardian to accept", async function () {
      await dapp.connect(ward).requestGuardian(guardian.address);
      expect(await dapp.pendingWardToGuardian(ward.address)).to.equal(guardian.address);
      
      await dapp.connect(guardian).acceptGuardianship(ward.address);
      expect(await dapp.wardToGuardian(ward.address)).to.equal(guardian.address);
    });

    it("Should fail if ward is same as guardian", async function () {
      await expect(
        dapp.connect(ward).requestGuardian(ward.address)
      ).to.be.revertedWithCustomError(dapp, "CannotBeOwnGuardian");
    });
  });

  describe("Payments", function () {
    beforeEach(async function () {
      // bindGuardian is onlyOwner, so we call it with oracle (owner)
      await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
      await dapp.connect(ward).setThreshold(1000);
    });

    it("Should auto-approve payments under threshold", async function () {
      await dapp.connect(oracle).recordPayment(ward.address, 500, "Coffee");
      const tx = await dapp.transactions(1);
      expect(tx.isPending).to.be.false;
      expect(tx.isApproved).to.be.true;
    });

    it("Should mark payments over threshold as pending", async function () {
      await dapp.connect(oracle).recordPayment(ward.address, 1500, "Laptop");
      const tx = await dapp.transactions(1);
      expect(tx.isPending).to.be.true;
      expect(tx.isApproved).to.be.false;
    });

    it("Should fail if non-oracle calls recordPayment", async function () {
      await expect(
        dapp.connect(ward).recordPayment(ward.address, 500, "Coffee")
      ).to.be.revertedWithCustomError(dapp, "CallerIsNotOracle");
    });
  });

  describe("Approval", function () {
    beforeEach(async function () {
      // bindGuardian is onlyOwner, so we call it with oracle (owner)
      await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
      await dapp.connect(ward).setThreshold(1000);
      await dapp.connect(oracle).recordPayment(ward.address, 1500, "Laptop");
    });

    it("Should allow guardian to approve", async function () {
      await dapp.connect(guardian).confirmTransaction(1, true);
      const tx = await dapp.transactions(1);
      expect(tx.isPending).to.be.false;
      expect(tx.isApproved).to.be.true;
    });

    it("Should fail if non-guardian tries to approve", async function () {
      await expect(
        dapp.connect(other).confirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });

    it("Should fail if guardian tries to approve a non-pending or non-existent transaction", async function () {
      await dapp.connect(guardian).confirmTransaction(1, true); // First confirm
      // Try to confirm again
      await expect(
        dapp.connect(guardian).confirmTransaction(1, true)
      ).to.be.revertedWithCustomError(dapp, "NotPendingTransaction");

      await expect(
        dapp.connect(guardian).confirmTransaction(999, true)
      ).to.be.revertedWithCustomError(dapp, "TransactionNotFound");
    });
  });

  describe("Threshold Management", function () {
    beforeEach(async function () {
      await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
    });

    it("Should allow ward to set their own threshold", async function () {
      await dapp.connect(ward).setThreshold(2000);
      expect(await dapp.threshold(ward.address)).to.equal(2000n);
    });

    it("Should allow guardian to set ward's threshold", async function () {
      await dapp.connect(guardian).setGuardianThreshold(ward.address, 3000);
      expect(await dapp.threshold(ward.address)).to.equal(3000n);
    });

    it("Should fail if non-guardian tries to set ward's threshold", async function () {
      await expect(
        dapp.connect(other).setGuardianThreshold(ward.address, 3000)
      ).to.be.revertedWithCustomError(dapp, "NotAuthorizedGuardian");
    });
  });

  describe("Blacklist & Risk Control", function () {
    beforeEach(async function () {
      await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
      await dapp.connect(ward).setThreshold(1000);
    });

    it("Should allow guardian or owner to set blacklisted merchant", async function () {
      // Owner (oracle) sets it
      await dapp.connect(oracle).setBannedMerchant("Gambling", true);
      expect(await dapp.bannedMerchants("Gambling")).to.be.true;

      // Guardian sets it
      await dapp.connect(guardian).setBannedMerchant("Alcohol", true);
      expect(await dapp.bannedMerchants("Alcohol")).to.be.true;
    });

    it("Should fail if normal ward sets blacklisted merchant", async function () {
      await expect(
        dapp.connect(ward).setBannedMerchant("Gambling", true)
      ).to.be.revertedWithCustomError(dapp, "OnlyOwnerOrGuardian");
    });

    it("Should intercept blacklisted merchant payment even if under threshold", async function () {
      await dapp.connect(oracle).setBannedMerchant("Gaming", true);
      // 500 is under 1000 threshold, but "Gaming" is blacklisted
      await dapp.connect(oracle).recordPayment(ward.address, 500, "Gaming");
      const tx = await dapp.transactions(1);
      expect(tx.isPending).to.be.true;
      expect(tx.isApproved).to.be.false;
    });
  });

  describe("AI Report Integrity Storage", function () {
    it("Should allow owner to store report hash and read it back", async function () {
      const reportHash = ethers.keccak256(ethers.toUtf8Bytes("AI diagnosis report text content"));
      const month = "2026-06";

      await dapp.connect(oracle).storeAiReportHash(ward.address, month, reportHash);
      const storedHash = await dapp.aiReportHashes(ward.address, month);
      expect(storedHash).to.equal(reportHash);
    });

    it("Should fail if non-owner tries to store report hash", async function () {
      const reportHash = ethers.keccak256(ethers.toUtf8Bytes("AI diagnosis report text content"));
      const month = "2026-06";

      await expect(
        dapp.connect(ward).storeAiReportHash(ward.address, month, reportHash)
      ).to.be.revertedWithCustomError(dapp, "OwnableUnauthorizedAccount");
    });
  });

  describe("Multiple Guardians & M:N Relationships", function () {
    let guardian2;
    beforeEach(async function () {
      [,, guardian, other, guardian2] = await ethers.getSigners();
    });

    it("Should allow a ward to request and bind multiple guardians", async function () {
      // First guardian request and accept
      await dapp.connect(ward).requestGuardian(guardian.address);
      await dapp.connect(guardian).acceptGuardianship(ward.address);

      // Second guardian request and accept
      await dapp.connect(ward).requestGuardian(guardian2.address);
      await dapp.connect(guardian2).acceptGuardianship(ward.address);

      // Verify list of guardians
      const list = await dapp.getWardGuardians(ward.address);
      expect(list.length).to.equal(2);
      expect(list[0]).to.equal(guardian.address);
      expect(list[1]).to.equal(guardian2.address);

      // Verify isWardGuardian mapping
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.true;
      expect(await dapp.isWardGuardian(ward.address, guardian2.address)).to.be.true;
      expect(await dapp.isWardGuardian(ward.address, other.address)).to.be.false;
    });

    it("Should allow any of the bound guardians to approve pending transaction", async function () {
      // Bind both guardians
      await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
      await dapp.connect(oracle).bindGuardian(ward.address, guardian2.address);
      await dapp.connect(ward).setThreshold(1000);

      // Record a transaction that goes over threshold
      await dapp.connect(oracle).recordPayment(ward.address, 1500, "Laptop");

      // Verify transaction is pending
      let tx = await dapp.transactions(1);
      expect(tx.isPending).to.be.true;

      // Both guardians see this transaction as pending
      const pendingG1 = await dapp.getPendingTransactions(guardian.address);
      const pendingG2 = await dapp.getPendingTransactions(guardian2.address);
      expect(pendingG1.length).to.equal(1);
      expect(pendingG2.length).to.equal(1);
      expect(pendingG1[0]).to.equal(1n);
      expect(pendingG2[0]).to.equal(1n);

      // Guardian 2 confirms the transaction
      await dapp.connect(guardian2).confirmTransaction(1, true);

      // Verify transaction is approved and no longer pending
      tx = await dapp.transactions(1);
      expect(tx.isPending).to.be.false;
      expect(tx.isApproved).to.be.true;
    });

    it("Should allow one guardian to manage multiple wards (1:N or M:N)", async function () {
      const ward2 = other; // use other as second ward
      // Bind guardian to ward 1
      await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
      // Bind guardian to ward 2
      await dapp.connect(oracle).bindGuardian(ward2.address, guardian.address);

      // Verify mappings
      expect(await dapp.isWardGuardian(ward.address, guardian.address)).to.be.true;
      expect(await dapp.isWardGuardian(ward2.address, guardian.address)).to.be.true;

      // Set threshold and record pending transactions for both wards
      await dapp.connect(ward).setThreshold(1000);
      await dapp.connect(ward2).setThreshold(500);

      await dapp.connect(oracle).recordPayment(ward.address, 1500, "Laptop");
      await dapp.connect(oracle).recordPayment(ward2.address, 600, "Phone");

      // Guardian should see pending transactions from both wards
      const pending = await dapp.getPendingTransactions(guardian.address);
      expect(pending.length).to.equal(2);
      expect(pending[0]).to.equal(1n);
      expect(pending[1]).to.equal(2n);
    });
  });
});

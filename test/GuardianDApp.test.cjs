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
      ).to.be.revertedWith("GuardianDApp: Cannot be your own guardian");
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
      ).to.be.revertedWith("GuardianDApp: Not the authorized guardian");
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
      ).to.be.revertedWith("GuardianDApp: Only owner or guardian can set banned merchants");
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
});

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
    it("Should allow a ward to bind a guardian", async function () {
      await dapp.connect(ward).bindGuardian(ward.address, guardian.address);
      expect(await dapp.wardToGuardian(ward.address)).to.equal(guardian.address);
    });

    it("Should fail if ward is same as guardian", async function () {
      await expect(
        dapp.connect(ward).bindGuardian(ward.address, ward.address)
      ).to.be.revertedWith("GuardianDApp: Ward cannot be guardian");
    });
  });

  describe("Payments", function () {
    beforeEach(async function () {
      await dapp.connect(ward).bindGuardian(ward.address, guardian.address);
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
      await dapp.connect(ward).bindGuardian(ward.address, guardian.address);
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
});

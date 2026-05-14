const hre = require("hardhat");

async function main() {
  const [oracle, ward, guardian] = await hre.ethers.getSigners();
  
  // Read contract address from mock-server/.env
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(__dirname, "../mock-server/.env");
  let dappAddress;
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, "utf8");
    dappAddress = env.match(/CONTRACT_ADDRESS=(.*)/)[1];
  }

  if (!dappAddress) {
    console.error("❌ Contract address not found in mock-server/.env. Please deploy first.");
    return;
  }

  const dapp = await hre.ethers.getContractAt("GuardianDApp", dappAddress);

  console.log("🚀 Initializing Demo Data...");
  
  // 1. Bind relationship
  console.log(`🔗 Binding ward ${ward.address} to guardian ${guardian.address}`);
  await dapp.connect(ward).bindGuardian(ward.address, guardian.address);
  
  // 2. Set threshold to 800 Wei
  console.log("💰 Setting threshold to 800 Wei for ward");
  await dapp.connect(ward).setThreshold(800);

  // 3. Record small payments (Auto Approved)
  console.log("✅ Recording 5 small payments (Auto Approved)...");
  for(let i=1; i<=5; i++) {
    await dapp.connect(oracle).recordPayment(ward.address, 100 + i*100, `早餐 #${i}`);
  }

  // 4. Record large payments (Pending)
  console.log("⚠️ Recording 5 large payments (Pending Approval)...");
  for(let i=1; i<=5; i++) {
    await dapp.connect(oracle).recordPayment(ward.address, 1500 + i*100, `数码产品 #${i}`);
  }

  console.log("✨ Demo data seeded successfully!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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
  
  // 1. Bind relationship on-chain
  console.log(`🔗 Binding ward ${ward.address} to guardian ${guardian.address}`);
  let tx = await dapp.connect(oracle).bindGuardian(ward.address, guardian.address);
  await tx.wait();
  
  // 2. Set threshold to 800 Wei on-chain
  console.log("💰 Setting threshold to 800 Wei for ward");
  tx = await dapp.connect(ward).setThreshold(800);
  await tx.wait();

  // 3. Sync to MySQL database
  const mysql = require("mysql2/promise");
  const dotenv = require("dotenv");
  dotenv.config({ path: envPath });
  
  let db;
  if (process.env.DB_HOST) {
    try {
      db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });
      console.log("💾 Cleaning and seeding MySQL tables for ward...");
      await db.execute("DELETE FROM guardianship_bindings WHERE ward_address = ?", [ward.address]);
      await db.execute("DELETE FROM user_thresholds WHERE ward_address = ?", [ward.address]);
      await db.execute("DELETE FROM transactions WHERE ward_address = ?", [ward.address]);

      await db.execute(
        "INSERT INTO guardianship_bindings (ward_address, guardian_address) VALUES (?, ?)",
        [ward.address, guardian.address]
      );
      await db.execute(
        "INSERT INTO user_thresholds (ward_address, threshold_amount) VALUES (?, ?)",
        [ward.address, 800]
      );
    } catch (dbErr) {
      console.warn("⚠️ MySQL connection failed during seeding, continuing with blockchain only:", dbErr.message);
    }
  }

  // 4. Record small payments (Auto Approved)
  console.log("✅ Recording 5 small payments (Auto Approved)...");
  for(let i=1; i<=5; i++) {
    const amount = 100 + i*100;
    const category = `早餐 #${i}`;
    const payTx = await dapp.connect(oracle).recordPayment(ward.address, amount, category);
    const receipt = await payTx.wait();
    if (db) {
      await db.execute(
        "INSERT INTO transactions (ward_address, amount, merchant_type, tx_hash) VALUES (?, ?, ?, ?)",
        [ward.address, amount, category, receipt.hash]
      );
    }
  }

  // 5. Record large payments (Pending)
  console.log("⚠️ Recording 5 large payments (Pending Approval)...");
  for(let i=1; i<=5; i++) {
    const amount = 1500 + i*100;
    const category = `数码产品 #${i}`;
    const payTx = await dapp.connect(oracle).recordPayment(ward.address, amount, category);
    const receipt = await payTx.wait();
    if (db) {
      await db.execute(
        "INSERT INTO transactions (ward_address, amount, merchant_type, tx_hash) VALUES (?, ?, ?, ?)",
        [ward.address, amount, category, receipt.hash]
      );
    }
  }

  if (db) {
    await db.end();
  }

  console.log("✨ Demo data seeded successfully to blockchain and MySQL!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

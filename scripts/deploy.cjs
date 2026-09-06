const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

async function main() {
  const [oracle] = await hre.ethers.getSigners();
  console.log("🚀 Deploying GuardianDApp with oracle:", oracle.address);

  const GuardianDApp = await hre.ethers.getContractFactory("GuardianDApp");
  const dapp = await GuardianDApp.deploy(oracle.address);

  await dapp.waitForDeployment();
  const address = await dapp.getAddress();
  
  console.log(`✅ GuardianDApp deployed to: ${address}`);

  // Create mock-server folder if not exists
  const mockServerDir = path.join(__dirname, "../mock-server");
  if (!fs.existsSync(mockServerDir)) {
    fs.mkdirSync(mockServerDir);
  }

  // Update or Create .env in mock-server (preserving ALIPAY_ and DB_ variables)
  const envPath = path.join(mockServerDir, ".env");
  let preserveContent = "";
  if (fs.existsSync(envPath)) {
    const existingContent = fs.readFileSync(envPath, "utf8");
    const preservedLines = existingContent.split("\n").filter(line => 
      line.trim().startsWith("ALIPAY_") || line.trim().startsWith("DB_") || line.trim().startsWith("DEEPSEEK_")
    );
    if (preservedLines.length > 0) {
      preserveContent = "\n\n" + preservedLines.join("\n");
    }
  }
  const envContent = `RPC_URL=http://127.0.0.1:8545\nORACLE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80\nCONTRACT_ADDRESS=${address}\nPORT=3000${preserveContent}`;
  fs.writeFileSync(envPath, envContent);
  console.log("📝 Updated mock-server/.env (preserved configs)");

  // Also update frontend constant if needed
  const contractUtilPath = path.join(__dirname, "../src/utils/contract.js");
  if (fs.existsSync(contractUtilPath)) {
    let content = fs.readFileSync(contractUtilPath, "utf8");
    content = content.replace(/CONTRACT_ADDRESS = ".*"/, `CONTRACT_ADDRESS = "${address}"`);
    fs.writeFileSync(contractUtilPath, content);
    console.log("📝 Updated src/utils/contract.js");
  }
  
  // Recover guardianship bindings, thresholds, and transactions from MySQL
  try {
    dotenv.config({ path: envPath });
    if (process.env.DB_HOST) {
      const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });
      const [rows] = await db.execute("SELECT ward_address, guardian_address FROM guardianship_bindings");
      if (rows.length > 0) {
        console.log(`🔄 Recovering ${rows.length} guardianship bindings from database...`);
        for (const row of rows) {
          const tx = await dapp.bindGuardian(row.ward_address, row.guardian_address);
          await tx.wait();
          // console.log(`   ✅ Restored binding: ${row.ward_address} -> ${row.guardian_address}`);
        }
      }

      const [thresholdRows] = await db.execute("SELECT ward_address, threshold_amount FROM user_thresholds");
      if (thresholdRows.length > 0) {
        console.log(`🔄 Recovering ${thresholdRows.length} user thresholds from database...`);
        for (const row of thresholdRows) {
          const tx = await dapp.adminSetThreshold(row.ward_address, Math.floor(row.threshold_amount));
          await tx.wait();
          // console.log(`   ✅ Restored threshold: ${row.ward_address} -> ${row.threshold_amount}`);
        }
      }

      // 确保默认演示账户的监护关系与阈值存在
      const defaultWard = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const defaultGuardian = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
      const isBound = await dapp.isWardGuardian(defaultWard, defaultGuardian);
      if (!isBound) {
        console.log("🔗 Pre-binding default demo relationship on-chain (Zhang San -> Li Si)...");
        await (await dapp.bindGuardian(defaultWard, defaultGuardian)).wait();
        await (await dapp.adminSetThreshold(defaultWard, 800)).wait();
        await db.execute(
          "INSERT INTO guardianship_bindings (ward_address, guardian_address) VALUES (?, ?) ON DUPLICATE KEY UPDATE ward_address = ward_address",
          [defaultWard, defaultGuardian]
        );
        await db.execute(
          "INSERT INTO user_thresholds (ward_address, threshold_amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE threshold_amount = ?",
          [defaultWard, 800, 800]
        );
        console.log("   ✅ Default demo relationship & threshold (800 Wei) ensured on chain & MySQL!");
      }

      const [txRows] = await db.execute("SELECT * FROM transactions ORDER BY id ASC");
      if (txRows.length > 0) {
        console.log(`🔄 Recovering ${txRows.length} transactions from database...`);
        let contractTxId = 0;
        for (const row of txRows) {
          const tx = await dapp.recordPayment(row.ward_address, Math.floor(row.amount), row.merchant_type);
          const receipt = await tx.wait();
          contractTxId++;
          // console.log(`   ✅ Restored transaction: ${row.ward_address} -> ${row.amount} Wei (New Tx Hash: ${receipt.hash}, Contract Tx ID: ${contractTxId})`);
          
          // Restore approval status if column exists
          if (row.is_approved !== undefined && row.is_pending !== undefined) {
              if (row.is_approved == 1 && row.is_pending == 0) {
                  await (await dapp.adminConfirmTransaction(contractTxId, true)).wait();
                  // console.log(`      ↳ Restored status: Approved`);
              } else if (row.is_pending == 0 && row.is_approved == 0) {
                  await (await dapp.adminConfirmTransaction(contractTxId, false)).wait();
                  // console.log(`      ↳ Restored status: Rejected`);
              }
          }

          // Restore paid status if column exists and row is paid
          if (row.is_paid == 1) {
              try {
                  await (await dapp.markPaymentSuccess(contractTxId)).wait();
                  // console.log(`      ↳ Restored status: Paid`);
              } catch (paidErr) {
                  console.warn(`      ↳ ⚠️ Could not mark restored transaction ${contractTxId} as paid on chain:`, paidErr.message);
              }
          }

          // Update the transaction ID and hash in MySQL so they match the blockchain sequence
          await db.execute("UPDATE transactions SET id = ?, tx_hash = ? WHERE id = ?", [contractTxId, receipt.hash, row.id]);
        }
        
        // Reset MySQL AUTO_INCREMENT to prevent gaps/key collisions on subsequent transactions
        await db.execute("ALTER TABLE transactions AUTO_INCREMENT = 1");
        console.log("   ✅ MySQL transactions table IDs and AUTO_INCREMENT aligned with contract txCounter.");
      }
      
      await db.end();
    }
  } catch (dbError) {
    console.warn("⚠️ Could not recover bindings/thresholds/transactions from DB:", dbError.message);
    try {
      const defaultWard = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      const defaultGuardian = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
      const isBound = await dapp.isWardGuardian(defaultWard, defaultGuardian);
      if (!isBound) {
        console.log("🔗 Fallback: Pre-binding default demo relationship on-chain directly...");
        await (await dapp.bindGuardian(defaultWard, defaultGuardian)).wait();
        await (await dapp.adminSetThreshold(defaultWard, 800)).wait();
        console.log("   ✅ Fallback: Default demo relationship & threshold (800 Wei) ensured on chain!");
      }
    } catch (fallbackErr) {
      console.warn("⚠️ Fallback binding failed:", fallbackErr.message);
    }
  }

  // Force clean exit to prevent libuv native assertion crash on Windows
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

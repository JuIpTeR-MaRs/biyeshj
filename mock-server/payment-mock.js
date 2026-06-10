const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const CONTRACT_ABI = [
    "function recordPayment(address _ward, uint256 _amount, string calldata _merchantType) external",
    "function txCounter() view returns (uint256)",
    "function bannedMerchants(string) view returns (bool)",
    "function threshold(address) view returns (uint256)",
    "function wardToGuardian(address) view returns (address)",
    "function storeAiReportHash(address _ward, string _month, bytes32 _reportHash) external"
];

class PaymentMockService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, this.wallet);
        
        // 初始化 MySQL 连接池
        this.dbPool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // 异步初始化数据库表
        this.initDatabase();
    }

    async initDatabase() {
        try {
            await this.dbPool.execute(`
                CREATE TABLE IF NOT EXISTS \`ai_reports\` (
                  \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
                  \`ward_address\` varchar(42) NOT NULL COMMENT '被监护人地址',
                  \`month\` varchar(7) NOT NULL COMMENT '月份 YYYY-MM',
                  \`report_content\` longtext NOT NULL COMMENT '报告正文 Markdown',
                  \`report_hash\` varchar(66) NOT NULL COMMENT '报告 SHA-256 哈希值',
                  \`tx_hash\` varchar(66) DEFAULT NULL COMMENT '存证链上交易哈希',
                  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (\`id\`),
                  UNIQUE KEY \`uk_ward_month\` (\`ward_address\`, \`month\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI诊断报告本地存储与哈希对照表';
            `);
            console.log("📁 [MySQL] ai_reports table verified/created successfully.");
            
            // Migrate guardianship_bindings index to support multiple guardians
            try {
                // Check if uk_ward exists
                const [indexes] = await this.dbPool.execute(
                    "SHOW INDEX FROM guardianship_bindings WHERE Key_name = 'uk_ward'"
                );
                if (Array.isArray(indexes) && indexes.length > 0) {
                    console.log("🔄 Found legacy unique key 'uk_ward', converting to multiple guardians constraint...");
                    await this.dbPool.execute("ALTER TABLE guardianship_bindings DROP INDEX uk_ward");
                }
                // Check if uk_ward_guardian exists
                const [newIndexes] = await this.dbPool.execute(
                    "SHOW INDEX FROM guardianship_bindings WHERE Key_name = 'uk_ward_guardian'"
                );
                if (Array.isArray(newIndexes) && newIndexes.length === 0) {
                    await this.dbPool.execute(
                        "ALTER TABLE guardianship_bindings ADD UNIQUE KEY uk_ward_guardian (ward_address, guardian_address)"
                    );
                    console.log("✅ Added multiple guardians unique key 'uk_ward_guardian'.");
                }
            } catch (indexError) {
                // If table doesn't exist yet, it will fail gracefully here
                console.log("ℹ️ guardianship_bindings table index check skipped or table does not exist yet.");
            }

            // Migrate transactions table to add merchant_address column
            try {
                const [columns] = await this.dbPool.execute(
                    "SHOW COLUMNS FROM transactions LIKE 'merchant_address'"
                );
                if (Array.isArray(columns) && columns.length === 0) {
                    await this.dbPool.execute(
                        "ALTER TABLE transactions ADD COLUMN merchant_address varchar(42) DEFAULT NULL COMMENT '收款商户钱包地址'"
                    );
                    console.log("✅ Added 'merchant_address' column to 'transactions' table.");
                }
            } catch (columnError) {
                console.log("ℹ️ transactions column check skipped or table does not exist yet.");
            }
        } catch (dbError) {
            console.error("❌ [MySQL] Failed to initialize ai_reports table:", dbError.message);
        }
    }

    async recordOnChain(wardAddress, amount, merchantType, merchantAddress = null) {
        try {
            console.log(`[Oracle] Recording: ${wardAddress} - ${amount} Wei`);
            const tx = await this.contract.recordPayment(
                wardAddress, 
                ethers.toBigInt(amount), 
                merchantType,
                { gasPrice: 0 }
            );
            const receipt = await tx.wait();
            const txHash = receipt.hash;
            
            // 记录到本地 MySQL 数据库 (双重记账)
            try {
                const [result] = await this.dbPool.execute(
                    `INSERT INTO transactions (ward_address, amount, merchant_type, tx_hash, merchant_address) VALUES (?, ?, ?, ?, ?)`,
                    [wardAddress, amount, merchantType, txHash, merchantAddress]
                );
                console.log(`[MySQL] 成功写入本地数据库, ID: ${result.insertId}`);
            } catch (dbError) {
                console.error(`[MySQL] 写入本地数据库失败:`, dbError.message);
                // 这里可以选择不阻塞主流程，就算本地数据库出错，区块链上已经成功了
            }

            return { success: true, txHash };
        } catch (error) {
            console.error("[Oracle] Error:", error.message);
            return { success: false, error: error.message };
        }
    }

    async recordGuardianshipBinding(wardAddress, guardianAddress) {
        try {
            const [result] = await this.dbPool.execute(
                `INSERT INTO guardianship_bindings (ward_address, guardian_address) VALUES (?, ?) ON DUPLICATE KEY UPDATE ward_address = ward_address`,
                [wardAddress, guardianAddress]
            );
            console.log(`[MySQL] 成功写入监护关系绑定, 影响行数: ${result.affectedRows}`);
            return { success: true };
        } catch (dbError) {
            console.error(`[MySQL] 写入监护关系绑定失败:`, dbError.message);
            return { success: false, error: dbError.message };
        }
    }

    async saveThreshold(wardAddress, amount) {
        try {
            const [result] = await this.dbPool.execute(
                `INSERT INTO user_thresholds (ward_address, threshold_amount) VALUES (?, ?) ON DUPLICATE KEY UPDATE threshold_amount = ?`,
                [wardAddress, amount, amount]
            );
            console.log(`[MySQL] 成功写入消费阈值 ${amount}, 影响行数: ${result.affectedRows}`);
            return { success: true };
        } catch (dbError) {
            console.error(`[MySQL] 写入消费阈值失败:`, dbError.message);
            return { success: false, error: dbError.message };
        }
    }

    async getAllAdminData() {
        try {
            const [transactions] = await this.dbPool.execute('SELECT * FROM transactions ORDER BY created_at DESC');
            const [bindings] = await this.dbPool.execute('SELECT * FROM guardianship_bindings ORDER BY created_at DESC');
            const [thresholds] = await this.dbPool.execute('SELECT * FROM user_thresholds');
            
            return {
                success: true,
                transactions,
                bindings,
                thresholds
            };
        } catch (error) {
            console.error(`[MySQL] 获取管理员数据失败:`, error.message);
            return { success: false, error: error.message };
        }
    }

    generateSeedData() {
        const merchantTypes = ["餐饮美食", "医疗健康", "娱乐购物", "交通出行"];
        const wards = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"];
        const count = 10;
        const seeds = Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            wardAddress: wards[i % 2],
            amount: Math.floor(Math.random() * 2000) + 100,
            merchantType: merchantTypes[Math.floor(Math.random() * merchantTypes.length)],
            timestamp: new Date().toISOString()
        }));
        fs.writeFileSync(path.join(__dirname, "seed-data.json"), JSON.stringify(seeds, null, 2));
        return seeds;
    }
}

module.exports = new PaymentMockService();

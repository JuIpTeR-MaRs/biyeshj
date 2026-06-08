const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const CONTRACT_ABI = [
    "function recordPayment(address _ward, uint256 _amount, string calldata _merchantType) external",
    "function txCounter() view returns (uint256)"
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
    }

    async recordOnChain(wardAddress, amount, merchantType) {
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
                    `INSERT INTO transactions (ward_address, amount, merchant_type, tx_hash) VALUES (?, ?, ?, ?)`,
                    [wardAddress, amount, merchantType, txHash]
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
                `INSERT INTO guardianship_bindings (ward_address, guardian_address) VALUES (?, ?) ON DUPLICATE KEY UPDATE guardian_address = ?`,
                [wardAddress, guardianAddress, guardianAddress]
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

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const CONTRACT_ABI = [
    "function recordPayment(address _ward, uint256 _amount, string calldata _merchantType) external",
    "function txCounter() view returns (uint256)"
];

class PaymentMockService {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, this.wallet);
    }

    async recordOnChain(wardAddress, amount, merchantType) {
        try {
            console.log(`[Oracle] Recording: ${wardAddress} - ${amount} Wei`);
            const tx = await this.contract.recordPayment(
                wardAddress, 
                ethers.toBigInt(amount), 
                merchantType
            );
            const receipt = await tx.wait();
            return { success: true, txHash: receipt.hash };
        } catch (error) {
            console.error("[Oracle] Error:", error.message);
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

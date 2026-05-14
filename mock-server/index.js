const express = require("express");
const paymentService = require("./payment-mock");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 1. 本地银行支付接口 (包装了区块链交易)
app.post("/api/bank/transfer", async (req, res) => {
    const { cardNumber, wardAddress, amount, note } = req.body;
    console.log(`🏦 [Bank Core] Processing transfer from ${cardNumber} to ${wardAddress}`);
    
    // 模拟银行限额检查
    if (amount > 10000) {
        return res.status(403).json({ success: false, error: "超过单笔银行限额，需监护人授权" });
    }

    const result = await paymentService.recordOnChain(wardAddress, amount, note || "银行转账");
    res.status(result.success ? 200 : 500).json({
        ...result,
        bankRef: `BNK${Date.now()}`
    });
});

// 2. 本地银行账户验证接口
app.get("/api/bank/account/:card", (req, res) => {
    const { card } = req.params;
    res.json({
        cardNumber: card,
        status: "Active",
        accountType: "Debit Card",
        bank: "Local Simulation Bank"
    });
});

paymentService.generateSeedData();
app.listen(PORT, () => {
    console.log(`🏦 Local Bank Core running on http://localhost:${PORT}`);
});

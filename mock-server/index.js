const express = require("express");
const { ethers } = require("ethers");
const paymentService = require("./payment-mock");
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

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

// 2.5 监护关系绑定入库接口
app.post("/api/guardian/bind", async (req, res) => {
    const { wardAddress, guardianAddress } = req.body;
    if (!wardAddress || !guardianAddress) {
        return res.status(400).json({ success: false, error: "Missing parameters" });
    }
    const result = await paymentService.recordGuardianshipBinding(wardAddress, guardianAddress);
    res.status(result.success ? 200 : 500).json(result);
});

// 2.6 保存消费阈值接口
app.post("/api/guardian/threshold", async (req, res) => {
    const { wardAddress, amount } = req.body;
    if (!wardAddress || amount === undefined) {
        return res.status(400).json({ success: false, error: "Missing parameters" });
    }
    const result = await paymentService.saveThreshold(wardAddress, amount);
    res.status(result.success ? 200 : 500).json(result);
});

// 支付宝 SDK 初始化
const { AlipaySdk } = require("alipay-sdk");
const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    gateway: process.env.ALIPAY_GATEWAY,
    keyType: 'PKCS8',
    timeout: 15000
});

const categoryCodes = {
    "餐饮美食": "FOOD",
    "医疗健康": "HLTH",
    "娱乐购物": "SHOP",
    "交通出行": "TRAV"
};

const categoryNames = {
    "FOOD": "餐饮美食",
    "HLTH": "医疗健康",
    "SHOP": "娱乐购物",
    "TRAV": "交通出行"
};

const mockTrades = new Map();
const realTradesBackup = new Map(); // Backup amounts for query fallback

// 3. 发起支付宝沙箱支付 (预创建订单以获取二维码)
app.post("/api/alipay/pay", async (req, res) => {
    const { amount, subject, wardAddress, merchantAddress, approvedTxId } = req.body;
    console.log(`💳 [Alipay] Precreating order for ward ${wardAddress}, amount: ${amount} Wei, category: ${subject}, merchant: ${merchantAddress}`);
    
    try {
        // --- 智能合约风控规则引擎前置校验 ---
        const contract = paymentService.contract;
        
        let skipRiskControl = false;
        if (approvedTxId) {
            console.log(`🔍 [Risk Control Check] Checking approvedTxId: ${approvedTxId} for ward: ${wardAddress}`);
            try {
                const txDetail = await contract.transactions(approvedTxId);
                console.log(`🔍 [Risk Control Check] Chain Tx Details - ID: ${txDetail[0]}, Ward: ${txDetail[1]}, Amount: ${txDetail[2]}, isPending: ${txDetail[5]}, isApproved: ${txDetail[6]}`);
                if (txDetail[6] === true && txDetail[1].toLowerCase() === wardAddress.toLowerCase()) {
                    skipRiskControl = true;
                    console.log(`✅ [Risk Control] Bypassing risk control for previously approved tx: ${approvedTxId}`);
                } else {
                    console.log(`❌ [Risk Control Check] Validation failed: isApproved=${txDetail[6]} (expected true), ward match=${txDetail[1].toLowerCase() === wardAddress.toLowerCase()}`);
                }
            } catch (err) {
                console.error("Failed to verify approvedTxId on chain:", err);
            }
        }
        
        const guardian = await contract.wardToGuardian(wardAddress);
        const hasGuardian = guardian !== ethers.ZeroAddress;
        
        // 1. 检查商户是否在黑名单中
        const isBanned = await contract.bannedMerchants(subject);
        
        // 2. 检查交易金额是否超过设定的限额阈值
        const currentThreshold = await contract.threshold(wardAddress);
        const isOverThreshold = BigInt(amount) > currentThreshold;

        // 如果已绑定监护人且（触发黑名单或超额），且不是已经审批通过的订单，则直接前置风控拦截
        if (!skipRiskControl && hasGuardian && (isBanned || isOverThreshold)) {
            console.log(`⚠️ [Risk Control] Intercepted! Merchant: ${subject} (${isBanned ? "Banned" : "Active"}), Amount: ${amount} (Threshold: ${currentThreshold}). Recording on-chain...`);
            
            // 直接在链上记账为 Pending 待审批，无需通过支付宝
            const recordResult = await paymentService.recordOnChain(wardAddress, amount, subject, merchantAddress);
            
            if (recordResult.success) {
                return res.json({ 
                    success: false, 
                    riskIntercepted: true, 
                    message: isBanned 
                        ? `交易已被前置风险控制引擎拦截！商户类别 [${subject}] 属于限支黑名单。已提交至监护人进行链上审批。`
                        : `交易已被前置风险控制引擎拦截！金额 [${amount} 元/Wei] 超过设定的单笔消费预警阈值 [${currentThreshold} 元/Wei]。已提交至监护人进行链上审批。`,
                    txHash: recordResult.txHash
                });
            } else {
                return res.status(500).json({ success: false, error: `风控拦截链上记账失败: ${recordResult.error}` });
            }
        }
        
        const code = categoryCodes[subject] || "SHOP";
        const merchStr = merchantAddress ? merchantAddress.replace(/^0x/, "") : "0";
        const approvedId = approvedTxId || "0";
        const outTradeNo = `${wardAddress.replace(/^0x/, "")}_${code}_${merchStr}_${approvedId}_${Date.now()}`;
        const result = await alipaySdk.exec('alipay.trade.precreate', {
            bizContent: {
                outTradeNo: outTradeNo,
                totalAmount: amount.toString(), // 把 Wei 金额 1:1 作为人民币元传递
                subject: `智能监护支付 - ${subject}`,
            }
        });

        // 提取返回的 qrCode / qr_code
        const qrCode = result.qrCode || result.qr_code || 
            (result.alipay_trade_precreate_response && 
                (result.alipay_trade_precreate_response.qr_code || result.alipay_trade_precreate_response.qrCode));

        if (!qrCode) {
            throw new Error("支付宝未返回二维码链接");
        }

        console.log(`🔗 [Alipay] QR Code generated successfully: ${qrCode}`);
        realTradesBackup.set(outTradeNo, amount); // 备份真实订单数据以防 query 时宕机
        res.json({ success: true, qrCode, outTradeNo });
    } catch (err) {
        console.error("Alipay error:", err.message);
        console.warn("⚠️ 支付宝沙箱宕机，自动切入 Mock Fallback 模式");
        mockTrades.set(outTradeNo, { amount, status: 'WAIT_BUYER_PAY', createdAt: Date.now() });
        // 生成一个包含兜底提示的虚拟二维码数据
        const mockQrData = `MOCK_ALIPAY_FALLBACK_${outTradeNo}`;
        res.json({ success: true, qrCode: mockQrData, outTradeNo, isMock: true });
    }
});

// 3.4 取消支付订单 (前端点击取消支付时触发)
app.post("/api/alipay/cancel", async (req, res) => {
    const { outTradeNo } = req.body;
    if (!outTradeNo) {
        return res.status(400).json({ success: false, error: "缺少订单号 outTradeNo" });
    }

    console.log(`🚫 [Alipay Cancel] Canceling trade ${outTradeNo}...`);
    canceledTrades.add(outTradeNo);

    // 如果是 Mock 订单，直接标记为已关闭
    if (mockTrades.has(outTradeNo)) {
        const trade = mockTrades.get(outTradeNo);
        trade.status = 'TRADE_CLOSED';
        console.log(`🚫 [Mock Alipay] Trade ${outTradeNo} manually canceled. Prevented from auto-success.`);
        return res.json({ success: true, status: 'TRADE_CLOSED' });
    }

    try {
        // 请求真实支付宝关闭订单
        const result = await alipaySdk.exec('alipay.trade.cancel', {
            bizContent: {
                outTradeNo: outTradeNo
            }
        });
        console.log(`🚫 [Alipay] Trade ${outTradeNo} canceled:`, result.msg);
        res.json({ success: true, status: 'TRADE_CLOSED' });
    } catch (err) {
        console.error("Alipay cancel error:", err.message);
        res.json({ success: false, error: err.message });
    }
});

const processingTrades = new Map();
const canceledTrades = new Set();

// 3.5 查询支付宝支付状态并上链
app.get("/api/alipay/query", async (req, res) => {
    const { outTradeNo } = req.query;
    if (!outTradeNo) {
        return res.status(400).json({ success: false, error: "缺少订单号 outTradeNo" });
    }

    if (canceledTrades.has(outTradeNo)) {
        console.log(`🚫 [Alipay Query] Trade ${outTradeNo} was explicitly canceled.`);
        return res.json({ success: true, status: 'TRADE_CLOSED' });
    }

    // 检查是否是 Mock 订单
    if (mockTrades.has(outTradeNo)) {
        const trade = mockTrades.get(outTradeNo);
        // 等待 5 秒后自动判为支付成功
        if (Date.now() - trade.createdAt > 5000) {
            trade.status = 'TRADE_SUCCESS';
        }
        
        console.log(`🔍 [Mock Alipay Query] Trade ${outTradeNo} status: ${trade.status}`);
        
        if (trade.status === 'TRADE_SUCCESS') {
            if (!processingTrades.has(outTradeNo)) {
                const processPromise = (async () => {
                    const parts = outTradeNo.split("_");
                    const addressRaw = parts[0];
                    const code = parts[1];
                    const merchRaw = parts[2];
                    const approvedTxIdRaw = parts[3];
                    const wardAddress = "0x" + addressRaw;
                    const merchantAddress = merchRaw !== "0" ? "0x" + merchRaw : null;
                    const category = categoryNames[code] || "模拟消费";
                    const amount = Math.floor(parseFloat(trade.amount));

                    if (approvedTxIdRaw && approvedTxIdRaw !== "0") {
                        console.log(`✅ [Mock Alipay Query] Verified success for previously approved transaction ID: ${approvedTxIdRaw}. Bypassing duplicate on-chain record.`);
                        return true;
                    } else {
                        console.log(`✅ [Mock Alipay Query] Verified success! Ward: ${wardAddress}, Amount: ${amount}, Category: ${category}, Merchant: ${merchantAddress}`);
                        const recordResult = await paymentService.recordOnChain(wardAddress, amount, category, merchantAddress);
                        if (!recordResult.success) throw new Error(recordResult.error);
                        return true;
                    }
                })();
                processingTrades.set(outTradeNo, processPromise);
            }
            try {
                await processingTrades.get(outTradeNo);
                return res.json({ success: true, status: 'TRADE_SUCCESS' });
            } catch (err) {
                processingTrades.delete(outTradeNo);
                return res.status(500).json({ success: false, error: err.message });
            }
        } else {
            return res.json({ success: true, status: trade.status });
        }
    }

    try {
        const result = await alipaySdk.exec('alipay.trade.query', {
            bizContent: {
                outTradeNo: outTradeNo
            }
        });

        const tradeStatus = result.tradeStatus || result.trade_status || 
            (result.alipay_trade_query_response && 
                (result.alipay_trade_query_response.trade_status || result.alipay_trade_query_response.tradeStatus));

        const totalAmount = result.totalAmount || result.total_amount || 
            (result.alipay_trade_query_response && 
                (result.alipay_trade_query_response.total_amount || result.alipay_trade_query_response.totalAmount));

        console.log(`🔍 [Alipay Query] Trade ${outTradeNo} status: ${tradeStatus || 'NOT_SCAN_YET'}`);

        if (tradeStatus === 'TRADE_SUCCESS') {
            if (!processingTrades.has(outTradeNo)) {
                // 将处理逻辑封装为一个 Promise
                const processPromise = (async () => {
                    const parts = outTradeNo.split("_");
                    const addressRaw = parts[0];
                    const code = parts[1];
                    const merchRaw = parts[2];
                    const approvedTxIdRaw = parts[3];
                    const wardAddress = "0x" + addressRaw;
                    const merchantAddress = merchRaw !== "0" ? "0x" + merchRaw : null;
                    const category = categoryNames[code] || "模拟消费";
                    const amount = Math.floor(parseFloat(totalAmount));

                    if (approvedTxIdRaw && approvedTxIdRaw !== "0") {
                        console.log(`✅ [Alipay Query] Verified success for previously approved transaction ID: ${approvedTxIdRaw}. Bypassing duplicate on-chain record.`);
                        return true;
                    } else {
                        console.log(`✅ [Alipay Query] Verified success! Ward: ${wardAddress}, Amount: ${amount}, Category: ${category}, Merchant: ${merchantAddress}`);
                        const recordResult = await paymentService.recordOnChain(wardAddress, amount, category, merchantAddress);
                        
                        if (!recordResult.success) {
                            throw new Error(recordResult.error);
                        }
                        return true;
                    }
                })();
                processingTrades.set(outTradeNo, processPromise);
            }
            
            try {
                // 等待上链完成（无论是当前请求发起的还是之前的请求发起的）
                await processingTrades.get(outTradeNo);
                return res.json({ success: true, status: 'TRADE_SUCCESS' });
            } catch (err) {
                // 上链失败，移除记录以便后续重试
                processingTrades.delete(outTradeNo);
                return res.status(500).json({ success: false, error: err.message });
            }
        } else if (tradeStatus === 'WAIT_BUYER_PAY') {
            return res.json({ success: true, status: 'WAIT_BUYER_PAY' });
        } else if (tradeStatus === 'TRADE_CLOSED') {
            return res.json({ success: true, status: 'FAILED' });
        } else {
            return res.json({ success: true, status: tradeStatus || 'UNKNOWN' });
        }
    } catch (err) {
        console.error("Alipay query error:", err.message);
        console.warn(`⚠️ 支付宝查询接口宕机，将订单 ${outTradeNo} 强制转入兜底方案`);
        
        // 如果真实的查询挂了，我们将这笔订单转为 Mock 订单，以便下次轮询时自动成功
        const amount = realTradesBackup.get(outTradeNo) || 10;
        mockTrades.set(outTradeNo, { amount, status: 'TRADE_SUCCESS', createdAt: Date.now() - 6000 });
        
        // 返回等待状态，让前端在下次轮询时触发 Mock 成功逻辑
        return res.json({ success: true, status: 'WAIT_BUYER_PAY' });
    }
});

// 4. 接收支付宝支付后的同步重定向并验签上链
app.get("/api/alipay/return", async (req, res) => {
    console.log("🔔 [Alipay Return] Verifying signature...", req.query);
    try {
        const isValid = alipaySdk.checkNotifySign(req.query);
        if (!isValid) {
            console.warn("❌ [Alipay Return] Signature verification failed!");
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>支付校验失败 | 智能监护系统</title>
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                    <style>
                        * {
                            box-sizing: border-box;
                            margin: 0;
                            padding: 0;
                        }
                        body {
                            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            background: linear-gradient(135deg, #fef2f2 0%, #fff7ed 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 24px;
                            color: #1e293b;
                        }
                        .card {
                            background: rgba(255, 255, 255, 0.85);
                            backdrop-filter: blur(20px);
                            -webkit-backdrop-filter: blur(20px);
                            border: 1px solid rgba(255, 255, 255, 0.7);
                            border-radius: 36px;
                            padding: 48px 32px;
                            max-width: 480px;
                            width: 100%;
                            text-align: center;
                            box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.08);
                            animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(20px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                        .icon-wrapper {
                            width: 96px;
                            height: 96px;
                            background: #ffe4e6;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 28px;
                            position: relative;
                            animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
                        }
                        @keyframes shake {
                            10%, 90% { transform: translate3d(-1px, 0, 0); }
                            20%, 80% { transform: translate3d(2px, 0, 0); }
                            30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                            40%, 60% { transform: translate3d(4px, 0, 0); }
                        }
                        .error-svg {
                            width: 48px;
                            height: 48px;
                            stroke: #e11d48;
                            stroke-width: 4;
                            stroke-linecap: round;
                            stroke-linejoin: round;
                            fill: none;
                            z-index: 2;
                        }
                        .cross-path1, .cross-path2 {
                            stroke-dasharray: 100;
                            stroke-dashoffset: 100;
                        }
                        .cross-path1 {
                            animation: drawCross 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.2s forwards;
                        }
                        .cross-path2 {
                            animation: drawCross 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.4s forwards;
                        }
                        @keyframes drawCross {
                            to { stroke-dashoffset: 0; }
                        }
                        h2 {
                            font-size: 28px;
                            font-weight: 800;
                            margin-bottom: 12px;
                            background: linear-gradient(135deg, #e11d48 0%, #ea580c 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        .status-badge {
                            display: inline-block;
                            background: #ffe4e6;
                            color: #b91c1c;
                            font-weight: 600;
                            font-size: 13px;
                            padding: 6px 14px;
                            border-radius: 100px;
                            margin-bottom: 24px;
                        }
                        p {
                            font-size: 15px;
                            line-height: 1.6;
                            color: #64748b;
                            margin-bottom: 32px;
                        }
                        .btn {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            width: 100%;
                            background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
                            color: white;
                            border: none;
                            padding: 16px 28px;
                            border-radius: 18px;
                            font-weight: 600;
                            font-size: 16px;
                            cursor: pointer;
                            box-shadow: 0 10px 15px -3px rgba(244, 63, 94, 0.3);
                            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 12px 20px -3px rgba(244, 63, 94, 0.4);
                            filter: brightness(1.05);
                        }
                        .btn:active {
                            transform: translateY(1px);
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon-wrapper">
                            <svg class="error-svg" viewBox="0 0 24 24">
                                <path class="cross-path1" d="M18 6L6 18" />
                                <path class="cross-path2" d="M6 6l12 12" />
                            </svg>
                        </div>
                        <h2>支付校验失败</h2>
                        <span class="status-badge">Sign Verification Failed</span>
                        <p>数字签名验证失败，交易未能安全记录上链。<br>如果您是在系统浏览器中遇到了此提示，可以关闭当前窗口并返回客户端重试。</p>
                        <button class="btn" onclick="window.close()">关闭当前窗口</button>
                    </div>
                </body>
                </html>
            `);
        }

        const outTradeNo = req.query.out_trade_no;
        const parts = outTradeNo.split("_");
        const addressRaw = parts[0];
        const code = parts[1];
        const merchRaw = parts[2];
        const approvedTxIdRaw = parts[3];
        const wardAddress = "0x" + addressRaw;
        const merchantAddress = merchRaw !== "0" ? "0x" + merchRaw : null;
        const category = categoryNames[code] || "模拟消费";
        const amount = req.query.total_amount;

        let result;
        if (approvedTxIdRaw && approvedTxIdRaw !== "0") {
            console.log(`✅ [Alipay Return] Verified success for previously approved transaction ID: ${approvedTxIdRaw}. Bypassing duplicate on-chain record.`);
            result = { success: true };
        } else {
            console.log(`✅ [Alipay Return] Verified! Ward: ${wardAddress}, Amount: ${amount}, Category: ${category}, Merchant: ${merchantAddress}`);
            result = await paymentService.recordOnChain(wardAddress, Math.floor(parseFloat(amount)), category, merchantAddress);
        }
        
        if (result.success) {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>支付成功 | 智能监护系统</title>
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
                    <style>
                        * {
                            box-sizing: border-box;
                            margin: 0;
                            padding: 0;
                        }
                        body {
                            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                            background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 24px;
                            color: #1e293b;
                        }
                        .card {
                            background: rgba(255, 255, 255, 0.85);
                            backdrop-filter: blur(20px);
                            -webkit-backdrop-filter: blur(20px);
                            border: 1px solid rgba(255, 255, 255, 0.7);
                            border-radius: 36px;
                            padding: 48px 32px;
                            max-width: 480px;
                            width: 100%;
                            text-align: center;
                            box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.08);
                            animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(20px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                        .icon-wrapper {
                            width: 96px;
                            height: 96px;
                            background: #d1fae5;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 28px;
                            position: relative;
                            animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
                        }
                        @keyframes scaleIn {
                            from { transform: scale(0); }
                            to { transform: scale(1); }
                        }
                        .icon-pulse {
                            position: absolute;
                            width: 100%;
                            height: 100%;
                            border-radius: 50%;
                            background: #10b981;
                            opacity: 0.15;
                            animation: pulse 2s infinite;
                        }
                        @keyframes pulse {
                            0% { transform: scale(0.95); opacity: 0.2; }
                            50% { transform: scale(1.2); opacity: 0; }
                            100% { transform: scale(0.95); opacity: 0; }
                        }
                        .success-svg {
                            width: 48px;
                            height: 48px;
                            stroke: #059669;
                            stroke-width: 4;
                            stroke-linecap: round;
                            stroke-linejoin: round;
                            fill: none;
                            z-index: 2;
                        }
                        .checkmark-path {
                            stroke-dasharray: 100;
                            stroke-dashoffset: 100;
                            animation: drawCheck 0.6s cubic-bezier(0.65, 0, 0.45, 1) 0.4s forwards;
                        }
                        @keyframes drawCheck {
                            to { stroke-dashoffset: 0; }
                        }
                        h2 {
                            font-size: 28px;
                            font-weight: 800;
                            margin-bottom: 12px;
                            background: linear-gradient(135deg, #059669 0%, #0284c7 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        .status-badge {
                            display: inline-block;
                            background: #e0f2fe;
                            color: #0369a1;
                            font-weight: 600;
                            font-size: 13px;
                            padding: 6px 14px;
                            border-radius: 100px;
                            margin-bottom: 24px;
                        }
                        p {
                            font-size: 15px;
                            line-height: 1.6;
                            color: #64748b;
                            margin-bottom: 32px;
                        }
                        .highlight {
                            color: #0284c7;
                            font-weight: 600;
                        }
                        .btn {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            width: 100%;
                            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                            color: white;
                            border: none;
                            padding: 16px 28px;
                            border-radius: 18px;
                            font-weight: 600;
                            font-size: 16px;
                            cursor: pointer;
                            box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
                            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 12px 20px -3px rgba(37, 99, 235, 0.4);
                            filter: brightness(1.05);
                        }
                        .btn:active {
                            transform: translateY(1px);
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="icon-wrapper">
                            <div class="icon-pulse"></div>
                            <svg class="success-svg" viewBox="0 0 24 24">
                                <path class="checkmark-path" d="M20 6L9 17L4 12" />
                            </svg>
                        </div>
                        <h2>支付处理成功</h2>
                        <span class="status-badge">Blockchain Verified</span>
                        <p>交易已在区块链上安全归档记账。<br>系统检测到您已在浏览器中完成操作。如果您正在使用 <span class="highlight">智能监护系统客户端</span>，现在可以关闭此浏览器窗口并直接返回客户端查看结果。</p>
                        <button class="btn" onclick="closeWindow()">关闭当前窗口</button>
                    </div>
                    <script>
                        function closeWindow() {
                            if (window.opener) {
                                window.opener.postMessage('alipay-success', '*');
                            }
                            window.close();
                        }
                        setTimeout(closeWindow, 3000);
                    </script>
                </body>
                </html>
            `);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error("Alipay return error:", error);
        res.status(500).send(`<h3>支付处理失败: ${error.message}</h3>`);
    }
});

// 5. 管理员获取后台全部数据
app.get("/api/admin/all-data", async (req, res) => {
    try {
        const data = await paymentService.getAllAdminData();
        if (data.success) {
            res.json(data);
        } else {
            res.status(500).json(data);
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. 消费历史 AI 智能分析接口 (DeepSeek)
app.post("/api/analysis/consumption", async (req, res) => {
    const { txs, role } = req.body;
    if (!txs || !Array.isArray(txs)) {
        return res.status(400).json({ success: false, error: "缺少交易流水数据 txs" });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ success: false, error: "系统未配置 DEEPSEEK_API_KEY，请检查环境配置" });
    }

    // 格式化交易记录，使其更易读
    const normalizeTxs = (list) => {
        return list.map(t => {
            const amount = t.amount || "0";
            const category = t.merchantType || t.merchant_type || "未知";
            const ward = t.ward || t.ward_address || "未知";
            const wardName = t.wardName || "";
            const time = t.timestamp ? new Date(Number(t.timestamp) * 1000).toLocaleString() : (t.created_at ? new Date(t.created_at).toLocaleString() : "未知");
            
            let status = "已完成";
            if (t.isPending !== undefined) {
                status = t.isPending ? "待审批" : (t.isApproved ? "已批准" : "已拒绝");
            }
            
            return {
                id: t.id,
                ward: wardName ? `${wardName} (${ward.slice(0, 6)}...${ward.slice(-4)})` : ward,
                amount: `${amount} 元/Wei`,
                category,
                time,
                status
            };
        });
    };

    const formattedTxs = normalizeTxs(txs);

    let systemPrompt = "";
    if (role === 'admin') {
        systemPrompt = "你是一个平台级的区块链金融审计与数据分析专家。你的任务是分析智能监护平台全网的交易流水，评估全网的运行状况和潜在的系统性风险。分析应该包含：1. 全网整体交易规模与笔数分析；2. 消费商户与类别的全网集中度；3. 异常交易诊断（例如是否有刷单、过度高频交易、异常大额洗钱嫌疑）；4. 给系统管理员的运营与风控建议。使用中文，语气严谨、专业，排版精美。";
    } else if (role === 'guardian') {
        systemPrompt = "你是一个专业的家庭教育与智能监护顾问。你的任务是分析被监护成员的区块链消费行为，协助监护人了解家人的支出状况。分析应该包含：1. 成员支出的主要领域及趋势；2. 大额消费与超额触发预警的情况（哪些需要审批，哪些已自动通过）；3. 从监护人管理角度给出科学合理的干预建议（如调整阈值、沟通理财观念等）。使用中文，语气专业、客观，排版精美。";
    } else if (role === 'merchant') {
        systemPrompt = "你是一个专业的商业经营分析师与数据分析专家。你的任务是分析商户收到的区块链消费流水记录，帮助商户了解其营业和经营状况。分析应该包含：1. 营业额、交易笔数及客单价分析；2. 消费者付款规律与高峰期时段预测；3. 从商户角度给出具体可行的经营改善和营销推广建议（如热门商品促销、主营类目优化等）。使用中文，语气专业、客观，排版精美。";
    } else {
        systemPrompt = "你是一个贴心的家庭智能财务顾问。你的任务是根据被监护人提供的区块链消费记录，分析其消费习惯。分析应该包含：1. 消费总支出与结构占比；2. 是否存在非必要消费、大额异常支出；3. 给出温和的、鼓励性的财务规划建议（如储蓄小目标、规避超支风险）。注意使用中文，语气温和、正面，并且排版精美（使用markdown，适当加粗和列表）。";
    }

    const userPrompt = `以下是格式化后的交易流水记录：\n${JSON.stringify(formattedTxs, null, 2)}\n\n请针对上述数据为角色为 "${role}" 的用户生成详细的消费历史智能分析诊断报告。`;

    try {
        console.log(`[AI Analysis] Requesting DeepSeek for role: ${role}, total transactions: ${txs.length}`);
        const response = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const analysisText = data.choices[0].message.content;
            
            // --- AI 诊断报告“哈希上链防篡改”逻辑 ---
            let wardAddress = "";
            for (const t of txs) {
                const addr = t.ward || t.ward_address;
                if (addr && addr !== "未知") {
                    wardAddress = addr;
                    break;
                }
            }

            let reportHash = "";
            let onChainTxHash = null;
            const month = new Date().toISOString().slice(0, 7); // 格式：YYYY-MM

            if (wardAddress && wardAddress.startsWith("0x")) {
                const crypto = require("crypto");
                // 1. 使用 crypto 计算报告正文的 SHA-256 哈希值
                reportHash = "0x" + crypto.createHash("sha256").update(analysisText).digest("hex");
                console.log(`📝 [AI Proof-of-Integrity] Report SHA-256 hash: ${reportHash} for ward ${wardAddress} (${month})`);

                try {
                    // 2. 调用合约 storeAiReportHash 存证上链
                    const tx = await paymentService.contract.storeAiReportHash(
                        wardAddress,
                        month,
                        reportHash,
                        { gasPrice: 0 }
                    );
                    const receipt = await tx.wait();
                    onChainTxHash = receipt.hash;
                    console.log(`✅ [AI Proof-of-Integrity] Hash stored on-chain. TxHash: ${onChainTxHash}`);
                } catch (contractErr) {
                    console.error("❌ [AI Proof-of-Integrity] Contract call failed:", contractErr.message);
                }

                // 3. 同时存入本地 MySQL 数据库进行本地备份
                try {
                    await paymentService.dbPool.execute(
                        `INSERT INTO ai_reports (ward_address, month, report_content, report_hash, tx_hash) 
                         VALUES (?, ?, ?, ?, ?) 
                         ON DUPLICATE KEY UPDATE report_content = ?, report_hash = ?, tx_hash = ?`,
                        [wardAddress, month, analysisText, reportHash, onChainTxHash, analysisText, reportHash, onChainTxHash]
                    );
                    console.log("💾 [AI Proof-of-Integrity] MySQL backup updated successfully.");
                } catch (dbErr) {
                    console.error("❌ [AI Proof-of-Integrity] MySQL backup failed:", dbErr.message);
                }
            }

            res.json({ 
                success: true, 
                analysis: analysisText,
                month: month,
                reportHash: reportHash,
                txHash: onChainTxHash
            });
        } else {
            console.error("[AI Analysis] DeepSeek Error response:", data);
            res.status(500).json({ success: false, error: data.error?.message || "大模型返回格式错误" });
        }
    } catch (err) {
        console.error("[AI Analysis] API Error:", err.message);
        res.status(500).json({ success: false, error: `调用大模型服务失败: ${err.message}` });
    }
});

paymentService.generateSeedData();
app.listen(PORT, () => {
    console.log(`🏦 Local Bank Core running on http://localhost:${PORT}`);
});

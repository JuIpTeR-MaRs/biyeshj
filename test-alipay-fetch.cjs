const { AlipaySdk } = require("alipay-sdk");
const urllib = require("urllib");
require("dotenv").config({ path: require("path").join(__dirname, "mock-server", ".env") });

const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    gateway: process.env.ALIPAY_GATEWAY,
    keyType: 'PKCS8'
});

async function test() {
    try {
        const payUrl = await alipaySdk.pageExecute('alipay.trade.page.pay', 'GET', {
            bizContent: {
                outTradeNo: "test_" + Date.now(),
                productCode: 'FAST_INSTANT_TRADE_PAY',
                totalAmount: "11",
                subject: `智能监护支付 - 餐饮美食`,
            },
            returnUrl: 'http://localhost:3000/api/alipay/return',
        });
        
        const response = await urllib.request(payUrl, {
            method: 'GET',
            followRedirect: true,
            timeout: 10000,
        });
        
        console.log("Response Status:", response.status);
        console.log("Response URL:", response.url);
        
        const html = response.data.toString();
        console.log("HTML length:", html.length);
        console.log("HTML content:", html);
    } catch (e) {
        console.error("Test Error:", e);
    }
}
test();

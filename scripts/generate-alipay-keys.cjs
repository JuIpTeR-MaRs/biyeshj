const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function generateAlipayKeys() {
  console.log("Generating 2048-bit RSA key pair for Alipay Sandbox...");
  
  // 生成 RSA 2048 密钥对
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    }
  });

  // 格式化公钥：去除头尾标记和换行，这是支付宝网页配置所需的纯文本格式
  const cleanPublicKey = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\r?\n|\r/g, "")
    .trim();

  // 格式化私钥：去除头尾标记和换行，这是写入环境配置 .env 所需的格式
  const cleanPrivateKey = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\r?\n|\r/g, "")
    .trim();

  // 保存到本地文件夹以便备份
  const keysDir = path.join(__dirname, "alipay_keys");
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir);
  }
  
  fs.writeFileSync(path.join(keysDir, "app_public_key.pem"), publicKey);
  fs.writeFileSync(path.join(keysDir, "app_private_key.pem"), privateKey);
  fs.writeFileSync(path.join(keysDir, "alipay_config_helper.txt"), 
    `=== 1. 用于粘贴到支付宝沙箱网页的【应用公钥】 ===\n${cleanPublicKey}\n\n=== 2. 用于写入配置的【应用私钥】 ===\n${cleanPrivateKey}\n`
  );

  console.log("\n==================================================================");
  console.log("✅ 密钥对已成功生成！");
  console.log(`📂 已将备份文件保存在: ${keysDir}`);
  console.log("==================================================================");
  console.log("\n👇 请复制下方内容，粘贴到支付宝沙箱控制台的【应用公钥】输入框中：\n");
  console.log(cleanPublicKey);
  console.log("\n==================================================================");
  console.log("\n👇 下方是您的【应用私钥】（后续写在后台配置中）：\n");
  console.log(cleanPrivateKey);
  console.log("\n==================================================================");
}

generateAlipayKeys();

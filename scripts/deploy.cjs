const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

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

  // Update or Create .env in mock-server (preserving ALIPAY_ variables)
  const envPath = path.join(mockServerDir, ".env");
  let alipayContent = "";
  if (fs.existsSync(envPath)) {
    const existingContent = fs.readFileSync(envPath, "utf8");
    const alipayLines = existingContent.split("\n").filter(line => line.trim().startsWith("ALIPAY_"));
    if (alipayLines.length > 0) {
      alipayContent = "\n\n" + alipayLines.join("\n");
    }
  }
  const envContent = `RPC_URL=http://127.0.0.1:8545\nORACLE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80\nCONTRACT_ADDRESS=${address}\nPORT=3000${alipayContent}`;
  fs.writeFileSync(envPath, envContent);
  console.log("📝 Updated mock-server/.env (preserved Alipay configs)");

  // Also update frontend constant if needed
  const contractUtilPath = path.join(__dirname, "../src/utils/contract.js");
  if (fs.existsSync(contractUtilPath)) {
    let content = fs.readFileSync(contractUtilPath, "utf8");
    content = content.replace(/CONTRACT_ADDRESS = ".*"/, `CONTRACT_ADDRESS = "${address}"`);
    fs.writeFileSync(contractUtilPath, content);
    console.log("📝 Updated src/utils/contract.js");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

async function main() {
  const rpcUrl = process.env.FISCO_RPC_URL || "http://127.0.0.1:8545";
  const privateKey = process.env.FISCO_DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("Set FISCO_DEPLOYER_PRIVATE_KEY before deploying");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== 20200n && process.env.FISCO_CHAIN_ID === undefined) {
    throw new Error(`Unexpected chain ID ${network.chainId}; set FISCO_CHAIN_ID explicitly`);
  }
  if (process.env.FISCO_CHAIN_ID && network.chainId !== BigInt(process.env.FISCO_CHAIN_ID)) {
    throw new Error(`Expected chain ID ${process.env.FISCO_CHAIN_ID}, got ${network.chainId}`);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const artifact = require("../artifacts/contracts/GuardianDApp.sol/GuardianDApp.json");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const transaction = await factory.getDeployTransaction(wallet.address);
  transaction.gasPrice = 0n;
  transaction.gasLimit = 30000000n;
  const sent = await wallet.sendTransaction(transaction);
  const receipt = await sent.wait();
  if (!receipt || receipt.status !== 1 || !receipt.contractAddress) {
    throw new Error(`Deployment failed: ${sent.hash}`);
  }
  const code = await provider.getCode(receipt.contractAddress);
  if (code === "0x") throw new Error(`No code at ${receipt.contractAddress}`);
  const contract = new ethers.Contract(receipt.contractAddress, artifact.abi, provider);
  const oracle = await contract.oracle();
  if (oracle.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Oracle mismatch: ${oracle}`);
  }

  const result = {
    chainId: network.chainId.toString(),
    rpcUrl,
    contractAddress: receipt.contractAddress,
    deployer: wallet.address,
    txHash: sent.hash,
    blockNumber: receipt.blockNumber
  };
  const output = path.join(__dirname, "../.fisco-local/deployment.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(result);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

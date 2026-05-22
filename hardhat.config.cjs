require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      gasPrice: 0,
      initialBaseFeePerGas: 0
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      gasPrice: 0
    }
  }
};

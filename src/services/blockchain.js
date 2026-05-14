
/**
 * Simple Blockchain Simulation
 * Demonstrates immutability and chaining concepts
 */
class Block {
  constructor(index, timestamp, transactions, previousHash = '') {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = '';
    this.nonce = 0;
  }

  async calculateHash() {
    const data = this.index + this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce;
    const msgUint8 = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async mineBlock(difficulty) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")) {
      this.nonce++;
      this.hash = await this.calculateHash();
    }
  }
}

class Blockchain {
  constructor() {
    this.chain = [
      {
        index: 0,
        timestamp: Date.now(),
        transactions: "Genesis Block",
        previousHash: "0",
        hash: "0000000000000000000000000000000000000000000000000000000000000000",
        nonce: 0
      }
    ];
    this.difficulty = 2;
    this.pendingTransactions = [];
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  async addTransaction(transaction) {
    this.pendingTransactions.push(transaction);
    await this.minePendingTransactions();
  }

  async minePendingTransactions() {
    const block = new Block(
      this.chain.length,
      Date.now(),
      this.pendingTransactions,
      this.getLatestBlock().hash
    );
    await block.mineBlock(this.difficulty);
    this.chain.push(block);
    this.pendingTransactions = [];
    return block;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];
      if (currentBlock.previousHash !== previousBlock.hash) return false;
    }
    return true;
  }
}

export const blockchainService = new Blockchain();

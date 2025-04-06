// db.js - Dexie database setup for transactions
import Dexie from 'dexie';

class TransactionDatabase extends Dexie {
  constructor() {
    super('TransactionDatabase');
    
    // Define database schema with version
    this.version(1).stores({
      transactions: '++id, txid, txhash, rawTx, beef',
      boltTxs: '++id, txid, txhash, rawTx',
      // The '++id' creates an auto-incremented primary key
      // txid, txhash, and rawTx are indexed for faster queries
    });
    
    // Define typed table
    this.transactions = this.table('transactions');
  }
  
  // Helper method to add a transaction
  async addTransaction(transaction) {
    try {
      const id = await this.transactions.add(transaction);
      console.log(`Transaction added with id: ${id}`);
      return id;
    } catch (error) {
      console.error(`Failed to add transaction: ${error}`);
      throw error;
    }
  }
  
  // Helper method to get transaction by txid
  async getTransactionByTxid(txid) {
    return await this.transactions.where('txid').equals(txid).first();
  }
  
  // Helper method to get transaction by txhash
  async getTransactionByTxhash(txhash) {
    return await this.transactions.where('txhash').equals(txhash).first();
  }
  
  // Helper method to get all transactions
  async getAllTransactions() {
    return await this.transactions.toArray();
  }
  
  // Helper method to delete a transaction
  async deleteTransaction(id) {
    return await this.transactions.delete(id);
  }
}

// Create and export a singleton instance
const localDb = new TransactionDatabase();

export default localDb;
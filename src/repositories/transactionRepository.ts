import type { Transaction } from '../models/transaction.js';
import type { ITransactionRepository } from './interfaces.js';

/**
 * In-memory implementation of ITransactionRepository.
 * Stores transactions in a Map for O(1) lookups.
 */
export class InMemoryTransactionRepository implements ITransactionRepository {
  private store = new Map<string, Transaction>();

  async findById(id: string): Promise<Transaction | undefined> {
    const transaction = this.store.get(id);
    // Return a deep copy to prevent external mutation
    if (!transaction) return undefined;
    return {
      ...transaction,
      entries: transaction.entries.map((e) => ({ ...e })),
    };
  }

  async save(transaction: Transaction): Promise<Transaction> {
    // Store a deep copy to prevent external mutation
    const copy = {
      ...transaction,
      entries: transaction.entries.map((e) => ({ ...e })),
    };
    this.store.set(transaction.id, copy);
    return {
      ...transaction,
      entries: transaction.entries.map((e) => ({ ...e })),
    };
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

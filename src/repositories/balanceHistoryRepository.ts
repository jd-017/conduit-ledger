import type { BalanceChange } from '../models/balanceHistory.js';

export interface IBalanceHistoryRepository {
  /**
   * Save a balance change record (append-only).
   */
  save(change: BalanceChange): Promise<BalanceChange>;

  /**
   * Get all balance changes for an account, ordered by created_at ascending.
   */
  findByAccountId(accountId: string): Promise<BalanceChange[]>;

  /**
   * Get all balance changes for a transaction.
   */
  findByTransactionId(transactionId: string): Promise<BalanceChange[]>;

  /**
   * Get account balance as of a specific point in time.
   * Returns balance_after of the most recent change at or before asOf.
   * Returns undefined if no changes exist before that time.
   */
  getBalanceAtTime(accountId: string, asOf: Date): Promise<number | undefined>;

  /**
   * Clear all records (for testing).
   */
  clear(): Promise<void>;
}

/**
 * In-memory implementation of IBalanceHistoryRepository.
 * Stores balance changes in an array (append-only log).
 */
export class InMemoryBalanceHistoryRepository implements IBalanceHistoryRepository {
  private store: BalanceChange[] = [];

  async save(change: BalanceChange): Promise<BalanceChange> {
    // Append-only: never modify, only add
    this.store.push({ ...change });
    return { ...change };
  }

  async findByAccountId(accountId: string): Promise<BalanceChange[]> {
    return this.store
      .filter(c => c.account_id === accountId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map(c => ({ ...c }));
  }

  async findByTransactionId(transactionId: string): Promise<BalanceChange[]> {
    return this.store
      .filter(c => c.transaction_id === transactionId)
      .map(c => ({ ...c }));
  }

  async getBalanceAtTime(accountId: string, asOf: Date): Promise<number | undefined> {
    // Find all changes for account with effective_date <= asOf
    const changes = this.store
      .filter(c => c.account_id === accountId && c.effective_date <= asOf)
      .sort((a, b) => b.effective_date.getTime() - a.effective_date.getTime());

    if (changes.length === 0) {
      return undefined;
    }

    // Return the balance_after of the most recent change
    return changes[0].balance_after;
  }

  async clear(): Promise<void> {
    this.store = [];
  }
}

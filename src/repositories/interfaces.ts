import type { Account } from '../models/account.js';
import type { Transaction } from '../models/transaction.js';

/**
 * Repository interface for Account persistence.
 * Implement this interface to swap storage backends.
 */
export interface IAccountRepository {
  findById(id: string): Promise<Account | undefined>;
  save(account: Account): Promise<Account>;
  exists(id: string): Promise<boolean>;
  clear(): Promise<void>; // For testing

  /**
   * Save account only if current version matches expectedVersion.
   * Returns the saved account on success, null on version mismatch.
   * This enables optimistic locking to prevent lost updates.
   */
  saveWithVersion(account: Account, expectedVersion: number): Promise<Account | null>;
}

/**
 * Repository interface for Transaction persistence.
 * Implement this interface to swap storage backends.
 */
export interface ITransactionRepository {
  findById(id: string): Promise<Transaction | undefined>;
  save(transaction: Transaction): Promise<Transaction>;
  exists(id: string): Promise<boolean>;
  clear(): Promise<void>; // For testing
}

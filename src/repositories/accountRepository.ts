import type { Account } from '../models/account.js';
import type { IAccountRepository } from './interfaces.js';

/**
 * In-memory implementation of IAccountRepository.
 * Stores accounts in a Map for O(1) lookups.
 */
export class InMemoryAccountRepository implements IAccountRepository {
  private store = new Map<string, Account>();

  async findById(id: string): Promise<Account | undefined> {
    const account = this.store.get(id);
    // Return a copy to prevent external mutation
    return account ? { ...account } : undefined;
  }

  async save(account: Account): Promise<Account> {
    // Store a copy to prevent external mutation
    this.store.set(account.id, { ...account });
    return { ...account };
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Save account only if version matches expected version.
   * Returns null if version mismatch (optimistic lock failure).
   */
  async saveWithVersion(account: Account, expectedVersion: number): Promise<Account | null> {
    const existing = this.store.get(account.id);

    // For new accounts (not in store), expectedVersion should be 0
    if (!existing) {
      if (expectedVersion !== 0) {
        return null;  // Caller expected existing account
      }
      // New account, save it
      this.store.set(account.id, { ...account });
      return { ...account };
    }

    // For existing accounts, check version matches
    if (existing.version !== expectedVersion) {
      return null;  // Version mismatch, concurrent modification detected
    }

    // Version matches, safe to save
    this.store.set(account.id, { ...account });
    return { ...account };
  }
}

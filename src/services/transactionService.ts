import type { Transaction, CreateTransactionParams } from '../models/transaction.js';
import { createTransaction } from '../models/transaction.js';
import type { CreateEntryParams } from '../models/entry.js';
import type { ITransactionRepository } from '../repositories/interfaces.js';
import { ValidationError, ConflictError } from '../errors/index.js';
import { AccountService, calculateNewBalance } from './accountService.js';

const MAX_RETRIES = 3;

/**
 * Service for transaction operations.
 * Contains business logic for creating transactions and validating balance rules.
 *
 * Note on concurrency: JavaScript's single-threaded event loop combined with
 * synchronous in-memory storage means each request runs to completion without
 * interleaving, so race conditions don't apply here. In a production system
 * with a database, you'd want proper transaction isolation (e.g., SELECT FOR
 * UPDATE, optimistic locking, or serializable isolation level).
 */
export class TransactionService {
  constructor(
    private readonly transactionRepo: ITransactionRepository,
    private readonly accountService: AccountService
  ) {}

  /**
   * Create a new transaction with automatic retry on optimistic lock failures.
   *
   * Validates:
   * 1. Transaction ID is unique (if provided)
   * 2. All referenced accounts exist
   * 3. Total debits equal total credits (balanced)
   * 4. No account would have a negative balance after applying entries
   *
   * @throws ConflictError if transaction ID already exists or max retries exceeded
   * @throws NotFoundError if any referenced account doesn't exist
   * @throws ValidationError if entries don't balance or would cause negative balance
   */
  async createTransaction(params: CreateTransactionParams): Promise<Transaction> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.attemptCreateTransaction(params);
      } catch (error) {
        if (error instanceof ConflictError && attempt < MAX_RETRIES) {
          // Optimistic lock failure, retry with fresh data
          lastError = error;
          continue;
        }
        // Not a lock failure, or max retries exceeded
        throw error;
      }
    }

    // Should not reach here, but satisfy TypeScript
    throw lastError ?? new Error('Transaction failed after retries');
  }

  /**
   * Single attempt to create a transaction.
   *
   * @throws ConflictError if transaction ID already exists or concurrent modification
   * @throws NotFoundError if any referenced account doesn't exist
   * @throws ValidationError if entries don't balance or would cause negative balance
   */
  private async attemptCreateTransaction(params: CreateTransactionParams): Promise<Transaction> {
    // Check for duplicate ID if provided
    if (params.id && (await this.transactionRepo.exists(params.id))) {
      throw new ConflictError(`Transaction with ID ${params.id} already exists`);
    }

    // Validate all accounts exist (throws NotFoundError if not)
    for (const entry of params.entries) {
      await this.accountService.getAccount(entry.account_id);
    }

    // Validate entries balance (debits === credits)
    this.validateEntriesBalance(params.entries);

    // Validate no negative balances would result
    await this.validateNoNegativeBalances(params.entries);

    // Create the transaction entity
    const transaction = createTransaction(params);

    // Apply all entries to accounts with transaction context.
    // With in-memory storage this is inherently atomic. A production database
    // implementation would wrap this in a transaction for atomicity.
    for (const entry of transaction.entries) {
      await this.accountService.applyEntry(
        entry,
        transaction.id,
        transaction.effective_date
      );
    }

    // Persist and return
    return this.transactionRepo.save(transaction);
  }

  /**
   * Validate that total debits equal total credits.
   * @throws ValidationError if entries don't balance
   */
  private validateEntriesBalance(entries: CreateEntryParams[]): void {
    const debits = entries
      .filter((e) => e.direction === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);

    const credits = entries
      .filter((e) => e.direction === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);

    if (debits !== credits) {
      throw new ValidationError(
        `Transaction must balance: total debits (${debits}) must equal total credits (${credits})`
      );
    }
  }

  /**
   * Validate that no account would have a negative balance after applying entries.
   * @throws ValidationError if any account would go negative
   */
  private async validateNoNegativeBalances(entries: CreateEntryParams[]): Promise<void> {
    // Group entries by account to calculate net effect
    const accountEffects = new Map<string, number>();

    for (const entry of entries) {
      const account = await this.accountService.getAccount(entry.account_id);
      const currentEffect = accountEffects.get(entry.account_id) ?? account.balance;

      const newBalance = calculateNewBalance(
        currentEffect,
        account.direction,
        entry.direction,
        entry.amount
      );

      accountEffects.set(entry.account_id, newBalance);
    }

    // Check for any negative balances
    for (const [accountId, balance] of accountEffects) {
      if (balance < 0) {
        throw new ValidationError(
          `Transaction would cause negative balance on account ${accountId}`
        );
      }
    }
  }
}

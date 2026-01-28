import type { Account, CreateAccountParams, Direction } from '../models/account.js';
import { createAccount } from '../models/account.js';
import type { BalanceChange } from '../models/balanceHistory.js';
import { createBalanceChange } from '../models/balanceHistory.js';
import type { Entry } from '../models/entry.js';
import type { IAccountRepository } from '../repositories/interfaces.js';
import type { IBalanceHistoryRepository } from '../repositories/balanceHistoryRepository.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors/index.js';

/**
 * Calculate the new balance when applying an entry to an account.
 *
 * Rules:
 * - If account direction matches entry direction: balance increases
 * - If directions differ: balance decreases
 */
export const calculateNewBalance = (
  currentBalance: number,
  accountDirection: Direction,
  entryDirection: Direction,
  entryAmount: number
): number => {
  if (accountDirection === entryDirection) {
    return currentBalance + entryAmount;
  }
  return currentBalance - entryAmount;
};

/**
 * Service for account operations.
 * Contains business logic for creating accounts and applying entries.
 */
export class AccountService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly balanceHistoryRepo?: IBalanceHistoryRepository
  ) {}

  /**
   * Create a new account.
   * @throws ConflictError if account with same ID already exists
   */
  async createAccount(params: CreateAccountParams): Promise<Account> {
    // Check for duplicate ID if provided
    if (params.id && (await this.accountRepo.exists(params.id))) {
      throw new ConflictError(`Account with ID ${params.id} already exists`);
    }

    const account = createAccount(params);
    return this.accountRepo.save(account);
  }

  /**
   * Get an account by ID.
   * @throws NotFoundError if account doesn't exist
   */
  async getAccount(id: string): Promise<Account> {
    const account = await this.accountRepo.findById(id);
    if (!account) {
      throw new NotFoundError(`Account ${id} not found`);
    }
    return account;
  }

  /**
   * Apply an entry to an account with optimistic locking and audit trail.
   * @param entry The entry to apply
   * @param transactionId The parent transaction ID (for audit trail)
   * @param effectiveDate When the transaction occurred (for audit trail)
   * @throws NotFoundError if account doesn't exist
   * @throws ConflictError if account was modified concurrently
   */
  async applyEntry(
    entry: Entry,
    transactionId: string,
    effectiveDate: Date
  ): Promise<Account> {
    const account = await this.getAccount(entry.account_id);
    const expectedVersion = account.version;  // Capture before modification
    const balanceBefore = account.balance;    // Capture for audit

    // Calculate new balance
    account.balance = calculateNewBalance(
      account.balance,
      account.direction,
      entry.direction,
      entry.amount
    );

    // Increment version and update timestamp
    account.version += 1;
    account.updated_at = new Date();

    // Attempt to save with version check
    const saved = await this.accountRepo.saveWithVersion(account, expectedVersion);

    if (!saved) {
      throw new ConflictError(
        `Account ${entry.account_id} was modified concurrently. Please retry.`
      );
    }

    // Record in audit trail (if repository provided)
    if (this.balanceHistoryRepo) {
      await this.balanceHistoryRepo.save(
        createBalanceChange({
          account_id: entry.account_id,
          transaction_id: transactionId,
          entry_id: entry.id,
          entry_direction: entry.direction,
          amount: entry.amount,
          balance_before: balanceBefore,
          balance_after: saved.balance,
          effective_date: effectiveDate,
        })
      );
    }

    return saved;
  }

  /**
   * Check if an account exists.
   */
  async exists(id: string): Promise<boolean> {
    return this.accountRepo.exists(id);
  }

  /**
   * Get complete balance history for an account.
   * @throws Error if balanceHistoryRepo not provided
   * @throws NotFoundError if account doesn't exist
   */
  async getBalanceHistory(accountId: string): Promise<BalanceChange[]> {
    if (!this.balanceHistoryRepo) {
      throw new Error('Balance history not available');
    }
    await this.getAccount(accountId);  // Verify account exists
    return this.balanceHistoryRepo.findByAccountId(accountId);
  }

  /**
   * Get account balance as of a specific point in time.
   * @throws Error if balanceHistoryRepo not provided
   * @throws NotFoundError if account doesn't exist
   * @throws ValidationError if asOf is before account creation
   */
  async getBalanceAtTime(accountId: string, asOf: Date): Promise<number> {
    if (!this.balanceHistoryRepo) {
      throw new Error('Balance history not available');
    }

    const account = await this.getAccount(accountId);

    // If asking for time before account existed, error
    if (account.created_at > asOf) {
      throw new ValidationError(`Account did not exist at ${asOf.toISOString()}`);
    }

    const balance = await this.balanceHistoryRepo.getBalanceAtTime(accountId, asOf);

    // If no history at that time, return initial balance (0)
    if (balance === undefined) {
      return 0;
    }

    return balance;
  }
}

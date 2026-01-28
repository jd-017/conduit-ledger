import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransactionService } from '../../../src/services/transactionService.js';
import { AccountService } from '../../../src/services/accountService.js';
import { InMemoryAccountRepository } from '../../../src/repositories/accountRepository.js';
import { InMemoryTransactionRepository } from '../../../src/repositories/transactionRepository.js';
import { NotFoundError, ValidationError, ConflictError } from '../../../src/errors/index.js';
import type { Entry } from '../../../src/models/entry.js';

describe('TransactionService', () => {
  let accountRepo: InMemoryAccountRepository;
  let transactionRepo: InMemoryTransactionRepository;
  let accountService: AccountService;
  let transactionService: TransactionService;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    transactionRepo = new InMemoryTransactionRepository();
    accountService = new AccountService(accountRepo);
    transactionService = new TransactionService(transactionRepo, accountService);
  });

  describe('createTransaction', () => {
    it('creates a balanced transaction and updates account balances', async () => {
      // Create two accounts (both with sufficient balance)
      const cashAccount = await accountService.createAccount({
        direction: 'debit',
        balance: 100_00, // $100 in cents
      });
      const revenueAccount = await accountService.createAccount({
        direction: 'credit',
        balance: 0,
      });

      // Record $50 revenue received as cash
      // Debit Cash (increases debit account), Credit Revenue (increases credit account)
      const transaction = await transactionService.createTransaction({
        name: 'Record revenue',
        entries: [
          { account_id: cashAccount.id, direction: 'debit', amount: 50_00 },
          { account_id: revenueAccount.id, direction: 'credit', amount: 50_00 },
        ],
      });

      expect(transaction.id).toBeDefined();
      expect(transaction.name).toBe('Record revenue');
      expect(transaction.entries).toHaveLength(2);

      // Verify balances updated
      const updatedCash = await accountService.getAccount(cashAccount.id);
      const updatedRevenue = await accountService.getAccount(revenueAccount.id);

      // Debit account + debit entry = increase
      expect(updatedCash.balance).toBe(150_00);
      // Credit account + credit entry = increase
      expect(updatedRevenue.balance).toBe(50_00);
    });

    it('generates IDs for transaction and entries', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 25_00 },
          { account_id: account2.id, direction: 'credit', amount: 25_00 },
        ],
      });

      expect(transaction.id).toBeDefined();
      expect(transaction.entries[0].id).toBeDefined();
      expect(transaction.entries[1].id).toBeDefined();
    });

    it('throws ConflictError for duplicate transaction ID', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const id = '123e4567-e89b-12d3-a456-426614174000';

      await transactionService.createTransaction({
        id,
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 10_00 },
          { account_id: account2.id, direction: 'credit', amount: 10_00 },
        ],
      });

      await expect(
        transactionService.createTransaction({
          id,
          entries: [
            { account_id: account1.id, direction: 'debit', amount: 5_00 },
            { account_id: account2.id, direction: 'credit', amount: 5_00 },
          ],
        })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('balance validation', () => {
    it('rejects unbalanced transaction (debits > credits)', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: account1.id, direction: 'debit', amount: 100_00 },
            { account_id: account2.id, direction: 'credit', amount: 50_00 },
          ],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('rejects unbalanced transaction (credits > debits)', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: account1.id, direction: 'debit', amount: 50_00 },
            { account_id: account2.id, direction: 'credit', amount: 100_00 },
          ],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('allows transaction with multiple entries that balance', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });
      const account3 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });

      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 30_00 },
          { account_id: account2.id, direction: 'debit', amount: 20_00 },
          { account_id: account3.id, direction: 'credit', amount: 50_00 },
        ],
      });

      expect(transaction.entries).toHaveLength(3);
    });
  });

  describe('negative balance validation', () => {
    it('rejects transaction that would cause negative balance', async () => {
      const account1 = await accountService.createAccount({
        direction: 'debit',
        balance: 50_00, // Only $50
      });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      // Try to withdraw $100 (more than available from account1)
      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: account1.id, direction: 'credit', amount: 100_00 }, // Would make debit account go to -50
            { account_id: account2.id, direction: 'debit', amount: 100_00 },
          ],
        })
      ).rejects.toThrow(ValidationError);
    });

    it('allows transaction that results in zero balance', async () => {
      const account1 = await accountService.createAccount({
        direction: 'debit',
        balance: 100_00,
      });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'credit', amount: 100_00 }, // Empties debit account
          { account_id: account2.id, direction: 'debit', amount: 100_00 }, // Empties credit account
        ],
      });

      expect(transaction).toBeDefined();

      const updated = await accountService.getAccount(account1.id);
      expect(updated.balance).toBe(0);
    });

    it('considers multiple entries to same account', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 100_00,
      });
      const otherAccount = await accountService.createAccount({ direction: 'credit', balance: 200_00 });

      // Two withdrawals from same account totaling more than balance
      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: account.id, direction: 'credit', amount: 60_00 },
            { account_id: account.id, direction: 'credit', amount: 60_00 },
            { account_id: otherAccount.id, direction: 'debit', amount: 120_00 },
          ],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('account existence validation', () => {
    it('throws NotFoundError if account does not exist', async () => {
      const validAccount = await accountService.createAccount({ direction: 'debit', balance: 100_00 });

      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: validAccount.id, direction: 'debit', amount: 50_00 },
            { account_id: 'non-existent-id', direction: 'credit', amount: 50_00 },
          ],
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('timestamp behavior', () => {
    it('sets created_at on transaction creation', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const before = new Date();
      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 25_00 },
          { account_id: account2.id, direction: 'credit', amount: 25_00 },
        ],
      });
      const after = new Date();

      expect(transaction.created_at).toBeInstanceOf(Date);
      expect(transaction.created_at >= before && transaction.created_at <= after).toBe(true);
    });

    it('sets created_at on entries', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 25_00 },
          { account_id: account2.id, direction: 'credit', amount: 25_00 },
        ],
      });

      expect(transaction.entries[0].created_at).toBeInstanceOf(Date);
      expect(transaction.entries[1].created_at).toBeInstanceOf(Date);
    });

    it('defaults effective_date to current time when not provided', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const before = new Date();
      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 25_00 },
          { account_id: account2.id, direction: 'credit', amount: 25_00 },
        ],
      });
      const after = new Date();

      expect(transaction.effective_date).toBeInstanceOf(Date);
      expect(transaction.effective_date >= before && transaction.effective_date <= after).toBe(true);
    });

    it('uses provided effective_date', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      const customDate = new Date('2025-01-10T00:00:00.000Z');
      const transaction = await transactionService.createTransaction({
        effective_date: customDate,
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 25_00 },
          { account_id: account2.id, direction: 'credit', amount: 25_00 },
        ],
      });

      expect(transaction.effective_date.getTime()).toBe(customDate.getTime());
    });
  });

  describe('retry logic', () => {
    it('retries on ConflictError and succeeds', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      // Track how many times applyEntry is called
      let callCount = 0;
      const originalApplyEntry = accountService.applyEntry.bind(accountService);

      vi.spyOn(accountService, 'applyEntry').mockImplementation(
        async (entry: Entry, transactionId: string, effectiveDate: Date) => {
          callCount++;
          // Fail on first call, succeed on subsequent calls
          if (callCount === 1) {
            throw new ConflictError('Simulated concurrent modification');
          }
          return originalApplyEntry(entry, transactionId, effectiveDate);
        }
      );

      const transaction = await transactionService.createTransaction({
        entries: [
          { account_id: account1.id, direction: 'debit', amount: 25_00 },
          { account_id: account2.id, direction: 'credit', amount: 25_00 },
        ],
      });

      expect(transaction).toBeDefined();
      // Call count will be > 2 because we retry the whole transaction
      expect(callCount).toBeGreaterThan(1);
    });

    it('fails after max retries', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      let callCount = 0;

      vi.spyOn(accountService, 'applyEntry').mockImplementation(async () => {
        callCount++;
        throw new ConflictError('Simulated concurrent modification');
      });

      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: account1.id, direction: 'debit', amount: 25_00 },
            { account_id: account2.id, direction: 'credit', amount: 25_00 },
          ],
        })
      ).rejects.toThrow(ConflictError);

      // Should have attempted MAX_RETRIES (3) times
      // Each attempt calls applyEntry for the first entry, then fails
      expect(callCount).toBe(3);
    });

    it('does not retry on other errors', async () => {
      const account1 = await accountService.createAccount({ direction: 'debit', balance: 100_00 });
      const account2 = await accountService.createAccount({ direction: 'credit', balance: 100_00 });

      let callCount = 0;

      vi.spyOn(accountService, 'applyEntry').mockImplementation(async () => {
        callCount++;
        throw new ValidationError('Some validation error');
      });

      await expect(
        transactionService.createTransaction({
          entries: [
            { account_id: account1.id, direction: 'debit', amount: 25_00 },
            { account_id: account2.id, direction: 'credit', amount: 25_00 },
          ],
        })
      ).rejects.toThrow(ValidationError);

      // Should only have called once - no retry for ValidationError
      expect(callCount).toBe(1);
    });
  });
});

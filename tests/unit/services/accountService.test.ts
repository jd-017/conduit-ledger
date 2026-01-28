import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountService, calculateNewBalance } from '../../../src/services/accountService.js';
import { InMemoryAccountRepository } from '../../../src/repositories/accountRepository.js';
import { InMemoryBalanceHistoryRepository } from '../../../src/repositories/balanceHistoryRepository.js';
import { NotFoundError, ConflictError } from '../../../src/errors/index.js';
import type { IAccountRepository } from '../../../src/repositories/interfaces.js';
import type { IBalanceHistoryRepository } from '../../../src/repositories/balanceHistoryRepository.js';
import type { Account } from '../../../src/models/account.js';
import type { BalanceChange } from '../../../src/models/balanceHistory.js';

describe('calculateNewBalance', () => {
  describe('when account and entry directions match', () => {
    it('increases balance for debit account + debit entry', () => {
      const result = calculateNewBalance(10000, 'debit', 'debit', 5000);
      expect(result).toBe(15000);
    });

    it('increases balance for credit account + credit entry', () => {
      const result = calculateNewBalance(10000, 'credit', 'credit', 5000);
      expect(result).toBe(15000);
    });
  });

  describe('when account and entry directions differ', () => {
    it('decreases balance for debit account + credit entry', () => {
      const result = calculateNewBalance(10000, 'debit', 'credit', 5000);
      expect(result).toBe(5000);
    });

    it('decreases balance for credit account + debit entry', () => {
      const result = calculateNewBalance(10000, 'credit', 'debit', 5000);
      expect(result).toBe(5000);
    });
  });

  describe('edge cases', () => {
    it('handles zero starting balance', () => {
      const result = calculateNewBalance(0, 'debit', 'debit', 10000);
      expect(result).toBe(10000);
    });

    it('can result in zero balance', () => {
      const result = calculateNewBalance(10000, 'debit', 'credit', 10000);
      expect(result).toBe(0);
    });

    it('can result in negative balance (validation done elsewhere)', () => {
      const result = calculateNewBalance(5000, 'debit', 'credit', 10000);
      expect(result).toBe(-5000);
    });
  });
});

describe('AccountService', () => {
  let accountRepo: InMemoryAccountRepository;
  let accountService: AccountService;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    accountService = new AccountService(accountRepo);
  });

  describe('createAccount', () => {
    it('creates account with required fields', async () => {
      const account = await accountService.createAccount({ direction: 'debit' });

      expect(account.id).toBeDefined();
      expect(account.direction).toBe('debit');
      expect(account.balance).toBe(0);
      expect(account.name).toBeNull();
    });

    it('creates account with all fields', async () => {
      const account = await accountService.createAccount({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Account',
        direction: 'credit',
        balance: 10000,
      });

      expect(account.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(account.name).toBe('Test Account');
      expect(account.direction).toBe('credit');
      expect(account.balance).toBe(10000);
    });

    it('sets created_at and updated_at timestamps on creation', async () => {
      const before = new Date();
      const account = await accountService.createAccount({ direction: 'debit' });
      const after = new Date();

      expect(account.created_at).toBeInstanceOf(Date);
      expect(account.updated_at).toBeInstanceOf(Date);
      expect(account.created_at >= before && account.created_at <= after).toBe(true);
      expect(account.created_at.getTime()).toBe(account.updated_at.getTime());
    });

    it('throws ConflictError for duplicate ID', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      await accountService.createAccount({ id, direction: 'debit' });

      await expect(accountService.createAccount({ id, direction: 'credit' })).rejects.toThrow(
        ConflictError
      );
    });
  });

  describe('getAccount', () => {
    it('returns account by ID', async () => {
      const created = await accountService.createAccount({
        name: 'Test',
        direction: 'debit',
      });

      const found = await accountService.getAccount(created.id);

      expect(found).toEqual(created);
    });

    it('throws NotFoundError for non-existent account', async () => {
      await expect(accountService.getAccount('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('applyEntry', () => {
    const transactionId = 'tx-test-123';
    const effectiveDate = new Date();

    it('updates balance when applying entry', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      const updated = await accountService.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      expect(updated.balance).toBe(15000);
    });

    it('persists balance change', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      await accountService.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'credit',
          amount: 3000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      const fetched = await accountService.getAccount(account.id);
      expect(fetched.balance).toBe(7000);
    });

    it('throws NotFoundError for non-existent account', async () => {
      await expect(
        accountService.applyEntry(
          {
            id: 'entry-1',
            account_id: 'non-existent',
            direction: 'debit',
            amount: 1000,
            created_at: new Date(),
          },
          transactionId,
          effectiveDate
        )
      ).rejects.toThrow(NotFoundError);
    });

    it('updates updated_at when applying entry', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 10000,
      });
      const originalUpdatedAt = account.updated_at;

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await accountService.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      expect(updated.created_at.getTime()).toBe(account.created_at.getTime());
      expect(updated.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('optimistic locking', () => {
    const transactionId = 'tx-test-123';
    const effectiveDate = new Date();

    it('version starts at 1 for new accounts', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 100,
      });

      expect(account.version).toBe(1);
    });

    it('increments version when applying entry', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 10000,
      });
      expect(account.version).toBe(1);

      const updated = await accountService.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      expect(updated.version).toBe(2);
    });

    it('throws ConflictError on version mismatch', async () => {
      // Create a mock repository that simulates concurrent modification
      const mockRepo: IAccountRepository = {
        findById: vi.fn(),
        save: vi.fn(),
        exists: vi.fn(),
        clear: vi.fn(),
        saveWithVersion: vi.fn(),
      };

      const account: Account = {
        id: 'test-account-id',
        name: 'Test',
        direction: 'debit',
        balance: 10000,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock findById to return the account
      (mockRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...account });

      // Mock saveWithVersion to return null (simulating concurrent modification)
      (mockRepo.saveWithVersion as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const serviceWithMock = new AccountService(mockRepo);

      await expect(
        serviceWithMock.applyEntry(
          {
            id: 'entry-1',
            account_id: account.id,
            direction: 'debit',
            amount: 5000,
            created_at: new Date(),
          },
          transactionId,
          effectiveDate
        )
      ).rejects.toThrow(ConflictError);
    });

    it('increments version on each subsequent entry', async () => {
      const account = await accountService.createAccount({
        direction: 'debit',
        balance: 10000,
      });
      expect(account.version).toBe(1);

      const updated1 = await accountService.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 1000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );
      expect(updated1.version).toBe(2);

      const updated2 = await accountService.applyEntry(
        {
          id: 'entry-2',
          account_id: account.id,
          direction: 'debit',
          amount: 1000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );
      expect(updated2.version).toBe(3);
    });
  });

  describe('balance history', () => {
    let accountRepoWithHistory: InMemoryAccountRepository;
    let balanceHistoryRepo: InMemoryBalanceHistoryRepository;
    let accountServiceWithHistory: AccountService;
    const transactionId = 'tx-history-test';
    const effectiveDate = new Date('2025-01-15T12:00:00Z');

    beforeEach(() => {
      accountRepoWithHistory = new InMemoryAccountRepository();
      balanceHistoryRepo = new InMemoryBalanceHistoryRepository();
      accountServiceWithHistory = new AccountService(accountRepoWithHistory, balanceHistoryRepo);
    });

    it('records balance change when applying entry', async () => {
      const account = await accountServiceWithHistory.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      await accountServiceWithHistory.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      // Verify balance history was recorded
      const history = await balanceHistoryRepo.findByAccountId(account.id);
      expect(history).toHaveLength(1);
      expect(history[0].account_id).toBe(account.id);
      expect(history[0].transaction_id).toBe(transactionId);
      expect(history[0].entry_id).toBe('entry-1');
      expect(history[0].entry_direction).toBe('debit');
      expect(history[0].amount).toBe(5000);
    });

    it('captures correct before and after balances', async () => {
      const account = await accountServiceWithHistory.createAccount({
        direction: 'debit',
        balance: 10000, // 10000 cents = $100
      });

      await accountServiceWithHistory.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit', // Same direction = increase
          amount: 5000, // 5000 cents = $50
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      const history = await balanceHistoryRepo.findByAccountId(account.id);
      expect(history).toHaveLength(1);
      expect(history[0].balance_before).toBe(10000);
      expect(history[0].balance_after).toBe(15000);
    });

    it('records correct balances for decreasing entry', async () => {
      const account = await accountServiceWithHistory.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      await accountServiceWithHistory.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'credit', // Opposite direction = decrease
          amount: 3000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      const history = await balanceHistoryRepo.findByAccountId(account.id);
      expect(history).toHaveLength(1);
      expect(history[0].balance_before).toBe(10000);
      expect(history[0].balance_after).toBe(7000);
    });

    it('records effective_date in balance change', async () => {
      const account = await accountServiceWithHistory.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      await accountServiceWithHistory.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      const history = await balanceHistoryRepo.findByAccountId(account.id);
      expect(history[0].effective_date.getTime()).toBe(effectiveDate.getTime());
    });

    it('does not record balance history when repository not provided', async () => {
      // Create service without balance history repo
      const serviceWithoutHistory = new AccountService(accountRepoWithHistory);

      const account = await serviceWithoutHistory.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      // This should not throw, just skip recording
      const updated = await serviceWithoutHistory.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      expect(updated.balance).toBe(15000);
      // Balance history repo should still be empty
      const history = await balanceHistoryRepo.findByAccountId(account.id);
      expect(history).toHaveLength(0);
    });

    it('records balance changes with mock repository', async () => {
      const mockBalanceHistoryRepo: IBalanceHistoryRepository = {
        save: vi.fn().mockImplementation((change: BalanceChange) => Promise.resolve(change)),
        findByAccountId: vi.fn(),
        findByTransactionId: vi.fn(),
        getBalanceAtTime: vi.fn(),
        clear: vi.fn(),
      };

      const serviceWithMock = new AccountService(accountRepoWithHistory, mockBalanceHistoryRepo);

      const account = await serviceWithMock.createAccount({
        direction: 'debit',
        balance: 10000,
      });

      await serviceWithMock.applyEntry(
        {
          id: 'entry-1',
          account_id: account.id,
          direction: 'debit',
          amount: 5000,
          created_at: new Date(),
        },
        transactionId,
        effectiveDate
      );

      // Verify save was called with correct BalanceChange
      expect(mockBalanceHistoryRepo.save).toHaveBeenCalledTimes(1);
      const savedChange = (mockBalanceHistoryRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedChange.account_id).toBe(account.id);
      expect(savedChange.transaction_id).toBe(transactionId);
      expect(savedChange.entry_id).toBe('entry-1');
      expect(savedChange.entry_direction).toBe('debit');
      expect(savedChange.amount).toBe(5000);
      expect(savedChange.balance_before).toBe(10000);
      expect(savedChange.balance_after).toBe(15000);
      expect(savedChange.effective_date).toEqual(effectiveDate);
    });
  });
});

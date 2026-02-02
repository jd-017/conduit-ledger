import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { InMemoryAccountRepository } from '../../src/repositories/accountRepository.js';
import { InMemoryTransactionRepository } from '../../src/repositories/transactionRepository.js';
import { InMemoryBalanceHistoryRepository } from '../../src/repositories/balanceHistoryRepository.js';

// Test UUIDs
const UUID1 = 'fa967ec9-5be2-4c26-a874-7eeeabfc6da8';
const UUID2 = 'dbf17d00-8701-4c4e-9fc5-6ae33c324309';
const NON_EXISTENT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('Balance History', () => {
  let app: ReturnType<typeof createApp>;
  let accountRepo: InMemoryAccountRepository;
  let transactionRepo: InMemoryTransactionRepository;
  let balanceHistoryRepo: InMemoryBalanceHistoryRepository;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    transactionRepo = new InMemoryTransactionRepository();
    balanceHistoryRepo = new InMemoryBalanceHistoryRepository();
    app = createApp({ accountRepo, transactionRepo, balanceHistoryRepo });
  });

  const request = (method: string, path: string, body?: unknown) => {
    return app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe('GET /accounts/:id/history', () => {
    it('returns empty array for account with no transactions', async () => {
      // Create account
      const createRes = await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      expect(createRes.status).toBe(201);

      // Get history
      const historyRes = await request('GET', `/accounts/${UUID1}/history`);
      expect(historyRes.status).toBe(200);

      const history = await historyRes.json();
      expect(history).toEqual([]);
    });

    it('returns balance changes after transaction', async () => {
      // Create accounts
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 500,
      });

      // Create transaction (debit entry on debit account = increase, credit entry on credit account = increase)
      const txRes = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 200 },
          { account_id: UUID2, direction: 'credit', amount: 200 },
        ],
      });
      expect(txRes.status).toBe(201);

      // Get history for first account
      const historyRes = await request('GET', `/accounts/${UUID1}/history`);
      expect(historyRes.status).toBe(200);

      const history = await historyRes.json();
      expect(history).toHaveLength(1);
      expect(history[0].balance_before).toBe(1000); // Started with $1000
      expect(history[0].balance_after).toBe(1200); // Increased by $200
      expect(history[0].amount).toBe(200);
      expect(history[0].entry_direction).toBe('debit');
    });

    it('returns changes in chronological order', async () => {
      // Create accounts
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 500,
      });

      // Create first transaction
      await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Create second transaction
      await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 200 },
          { account_id: UUID2, direction: 'credit', amount: 200 },
        ],
      });

      // Get history
      const historyRes = await request('GET', `/accounts/${UUID1}/history`);
      const history = await historyRes.json();

      expect(history).toHaveLength(2);
      // Should be ordered chronologically (oldest first)
      expect(history[0].balance_before).toBe(1000);
      expect(history[0].balance_after).toBe(1100); // First transaction: +100
      expect(history[1].balance_before).toBe(1100);
      expect(history[1].balance_after).toBe(1300); // Second transaction: +200

      // Verify created_at is chronological
      const firstCreatedAt = new Date(history[0].created_at);
      const secondCreatedAt = new Date(history[1].created_at);
      expect(secondCreatedAt >= firstCreatedAt).toBe(true);
    });

    it('includes transaction and entry references', async () => {
      // Create accounts
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 500,
      });

      // Create transaction
      const txRes = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });
      const tx = await txRes.json();

      // Get history
      const historyRes = await request('GET', `/accounts/${UUID1}/history`);
      const history = await historyRes.json();

      expect(history).toHaveLength(1);
      expect(history[0].transaction_id).toBe(tx.id);
      expect(history[0].entry_id).toBe(tx.entries[0].id);
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request('GET', `/accounts/${NON_EXISTENT_UUID}/history`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /accounts/:id/balance', () => {
    it('returns current balance without as_of param', async () => {
      // Create account with balance
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });

      // Get balance
      const res = await request('GET', `/accounts/${UUID1}/balance`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.balance).toBe(1000);
      expect(body.as_of).toBeDefined();
    });

    it('returns historical balance with as_of param', async () => {
      // Create accounts
      const createRes = await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      expect(createRes.status).toBe(201);

      await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 500,
      });

      // Note time before transaction
      const beforeTransaction = new Date();

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create transaction reducing balance to 700 (credit entry on debit account = decrease)
      const txRes = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'credit', amount: 300 },
          { account_id: UUID2, direction: 'debit', amount: 300 },
        ],
      });
      expect(txRes.status).toBe(201);

      // Small delay to ensure we're after the transaction
      await new Promise((resolve) => setTimeout(resolve, 50));
      const afterTransaction = new Date();

      // Query balance as_of before transaction (should have no history yet, return 0)
      // Note: If the account was created before any transactions, and we're querying
      // a time after account creation but before any transactions, we get 0 (initial balance)
      const beforeRes = await request(
        'GET',
        `/accounts/${UUID1}/balance?as_of=${beforeTransaction.toISOString()}`
      );
      expect(beforeRes.status).toBe(200);
      const beforeBody = await beforeRes.json();
      // No balance history at this point, so returns 0 (initial)
      expect(beforeBody.balance).toBe(0);

      // Query balance as_of after transaction
      const afterRes = await request(
        'GET',
        `/accounts/${UUID1}/balance?as_of=${afterTransaction.toISOString()}`
      );
      expect(afterRes.status).toBe(200);
      const afterBody = await afterRes.json();
      expect(afterBody.balance).toBe(700); // 1000 - 300
    });

    it('returns 400 for invalid date format', async () => {
      // Create account
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });

      // Query with invalid date
      const res = await request('GET', `/accounts/${UUID1}/balance?as_of=invalid`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Invalid');
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request('GET', `/accounts/${NON_EXISTENT_UUID}/balance`);
      expect(res.status).toBe(404);
    });

    it('returns error for query before account creation', async () => {
      const beforeCreation = new Date();

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Create account
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });

      // Query balance before account existed
      const res = await request(
        'GET',
        `/accounts/${UUID1}/balance?as_of=${beforeCreation.toISOString()}`
      );
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('did not exist');
    });
  });

  describe('Balance history with multiple transactions', () => {
    it('tracks balance changes across multiple transactions', async () => {
      // Create accounts
      await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 0,
      });

      // Transaction 1: +500 (debit on debit account)
      await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 500 },
          { account_id: UUID2, direction: 'credit', amount: 500 },
        ],
      });

      // Transaction 2: -200 (credit on debit account)
      await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'credit', amount: 200 },
          { account_id: UUID2, direction: 'debit', amount: 200 },
        ],
      });

      // Transaction 3: +100 (debit on debit account)
      await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });

      // Get history
      const historyRes = await request('GET', `/accounts/${UUID1}/history`);
      const history = await historyRes.json();

      expect(history).toHaveLength(3);

      // Check the progression
      expect(history[0].balance_before).toBe(1000);
      expect(history[0].balance_after).toBe(1500); // +500

      expect(history[1].balance_before).toBe(1500);
      expect(history[1].balance_after).toBe(1300); // -200

      expect(history[2].balance_before).toBe(1300);
      expect(history[2].balance_after).toBe(1400); // +100

      // Verify current balance matches
      const accountRes = await request('GET', `/accounts/${UUID1}`);
      const account = await accountRes.json();
      expect(account.balance).toBe(1400);
    });
  });
});

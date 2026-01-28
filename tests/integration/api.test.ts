import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { InMemoryAccountRepository } from '../../src/repositories/accountRepository.js';
import { InMemoryTransactionRepository } from '../../src/repositories/transactionRepository.js';

// Test UUIDs
const UUID1 = 'fa967ec9-5be2-4c26-a874-7eeeabfc6da8';
const UUID2 = 'dbf17d00-8701-4c4e-9fc5-6ae33c324309';
const UUID3 = '71cde2aa-b9bc-496a-a6f1-34964d05e6fd';
const UUID4 = '3256dc3c-7b18-4a21-95c6-146747cf2971';
const NON_EXISTENT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('Ledger API', () => {
  let app: ReturnType<typeof createApp>;
  let accountRepo: InMemoryAccountRepository;
  let transactionRepo: InMemoryTransactionRepository;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    transactionRepo = new InMemoryTransactionRepository();
    app = createApp({ accountRepo, transactionRepo });
  });

  const request = (method: string, path: string, body?: unknown) => {
    return app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe('POST /accounts', () => {
    it('creates account with required fields', async () => {
      const res = await request('POST', '/accounts', { direction: 'debit' });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.direction).toBe('debit');
      expect(body.balance).toBe(0);
      expect(body.name).toBeNull();
      expect(body.version).toBe(1);
    });

    it('creates account with all fields', async () => {
      const res = await request('POST', '/accounts', {
        id: UUID3,
        name: 'test3',
        direction: 'debit',
        balance: 100,
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body).toMatchObject({
        id: UUID3,
        name: 'test3',
        direction: 'debit',
        balance: 100,
        version: 1,
      });
      expect(body.created_at).toBeDefined();
      expect(body.updated_at).toBeDefined();
    });

    it('returns 400 for invalid direction', async () => {
      const res = await request('POST', '/accounts', { direction: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing direction', async () => {
      const res = await request('POST', '/accounts', { name: 'test' });

      expect(res.status).toBe(400);
    });

    it('returns 409 for duplicate ID', async () => {
      await request('POST', '/accounts', { id: UUID3, direction: 'debit' });
      const res = await request('POST', '/accounts', { id: UUID3, direction: 'credit' });

      expect(res.status).toBe(409);
    });

    it('returns 400 for negative balance', async () => {
      const res = await request('POST', '/accounts', {
        direction: 'debit',
        balance: -100,
      });

      expect(res.status).toBe(400);
    });

    it('sets created_at and updated_at on account creation', async () => {
      const before = new Date();
      const res = await request('POST', '/accounts', { direction: 'debit' });
      const after = new Date();
      const body = await res.json();

      const createdAt = new Date(body.created_at);
      expect(createdAt >= before && createdAt <= after).toBe(true);
      expect(body.created_at).toBe(body.updated_at);
    });

    it('updates updated_at when balance changes', async () => {
      // Create account and note its timestamps
      const createRes = await request('POST', '/accounts', {
        direction: 'debit',
        balance: 1000,
      });
      const created = await createRes.json();
      const originalCreatedAt = created.created_at;
      const originalUpdatedAt = created.updated_at;

      // Create another account for the transaction
      await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 0,
      });

      // Small delay to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Create transaction that modifies the first account
      await request('POST', '/transactions', {
        entries: [
          { account_id: created.id, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });

      // Fetch the account again
      const updatedRes = await request('GET', `/accounts/${created.id}`);
      const updated = await updatedRes.json();

      // created_at should remain unchanged
      expect(updated.created_at).toBe(originalCreatedAt);
      // updated_at should have changed
      expect(updated.updated_at).not.toBe(originalUpdatedAt);
      expect(new Date(updated.updated_at) > new Date(originalUpdatedAt)).toBe(true);
    });
  });

  describe('GET /accounts/:id', () => {
    it('returns account by ID', async () => {
      // Create account first
      const createRes = await request('POST', '/accounts', {
        name: 'Test Account',
        direction: 'debit',
        balance: 100,
      });
      const created = await createRes.json();

      // Fetch it
      const res = await request('GET', `/accounts/${created.id}`);

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(created);
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request('GET', `/accounts/${NON_EXISTENT_UUID}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /transactions', () => {
    it('creates balanced transaction', async () => {
      // Create two accounts
      const acc1Res = await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      const acc2Res = await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
      });

      expect(acc1Res.status).toBe(201);
      expect(acc2Res.status).toBe(201);

      // Create transaction
      const res = await request('POST', '/transactions', {
        id: UUID4,
        name: 'test',
        entries: [
          {
            direction: 'debit',
            account_id: UUID1,
            amount: 100,
          },
          {
            direction: 'credit',
            account_id: UUID2,
            amount: 100,
          },
        ],
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBe(UUID4);
      expect(body.name).toBe('test');
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].id).toBeDefined();
      expect(body.entries[0].account_id).toBe(UUID1);
      expect(body.entries[0].amount).toBe(100);
      expect(body.entries[0].direction).toBe('debit');
    });

    it('updates account balances after transaction', async () => {
      // Create accounts
      const acc1Res = await request('POST', '/accounts', {
        id: UUID1,
        direction: 'debit',
        balance: 1000,
      });
      const acc2Res = await request('POST', '/accounts', {
        id: UUID2,
        direction: 'credit',
        balance: 0,
      });
      
      expect(acc1Res.status).toBe(201);
      expect(acc2Res.status).toBe(201);

      // Create transaction: debit entry on debit account (increases), credit entry on credit account (increases)
      const txRes = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });
      
      expect(txRes.status).toBe(201);

      // Check updated balances
      const acc1 = await (await request('GET', `/accounts/${UUID1}`)).json();
      const acc2 = await (await request('GET', `/accounts/${UUID2}`)).json();

      expect(acc1.balance).toBe(1100); // Debit account + debit entry = increase
      expect(acc2.balance).toBe(100); // Credit account + credit entry = increase
    });

    it('returns 400 for unbalanced transaction', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });
      await request('POST', '/accounts', { id: UUID2, direction: 'credit' });

      const res = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 50 },
        ],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('balance');
    });

    it('returns 404 for non-existent account', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });

      const res = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: NON_EXISTENT_UUID, direction: 'credit', amount: 100 },
        ],
      });

      expect(res.status).toBe(404);
    });

    it('returns 409 for duplicate transaction ID', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });
      await request('POST', '/accounts', { id: UUID2, direction: 'credit' });

      await request('POST', '/transactions', {
        id: UUID4,
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 50 },
          { account_id: UUID2, direction: 'credit', amount: 50 },
        ],
      });

      const res = await request('POST', '/transactions', {
        id: UUID4,
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 25 },
          { account_id: UUID2, direction: 'credit', amount: 25 },
        ],
      });

      expect(res.status).toBe(409);
    });

    it('returns 400 for transaction causing negative balance', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 50 });
      await request('POST', '/accounts', { id: UUID2, direction: 'credit', balance: 100 });

      const res = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'credit', amount: 100 }, // Would make balance -50
          { account_id: UUID2, direction: 'debit', amount: 100 },
        ],
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('negative');
    });

    it('returns 400 for empty entries array', async () => {
      const res = await request('POST', '/transactions', {
        entries: [],
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid entry direction', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });

      const res = await request('POST', '/transactions', {
        entries: [{ account_id: UUID1, direction: 'invalid', amount: 100 }],
      });

      expect(res.status).toBe(400);
    });

    it('uses provided effective_date', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });
      await request('POST', '/accounts', { id: UUID2, direction: 'credit' });

      const effectiveDate = '2025-01-10T00:00:00.000Z';
      const res = await request('POST', '/transactions', {
        effective_date: effectiveDate,
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.effective_date).toBe(effectiveDate);
    });

    it('defaults effective_date to current time', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });
      await request('POST', '/accounts', { id: UUID2, direction: 'credit' });

      const before = new Date();
      const res = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });
      const after = new Date();

      expect(res.status).toBe(201);
      const body = await res.json();
      const effectiveDate = new Date(body.effective_date);
      expect(effectiveDate >= before && effectiveDate <= after).toBe(true);
    });

    it('includes created_at and effective_date in transaction response', async () => {
      await request('POST', '/accounts', { id: UUID1, direction: 'debit', balance: 1000 });
      await request('POST', '/accounts', { id: UUID2, direction: 'credit' });

      const res = await request('POST', '/transactions', {
        entries: [
          { account_id: UUID1, direction: 'debit', amount: 100 },
          { account_id: UUID2, direction: 'credit', amount: 100 },
        ],
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.created_at).toBeDefined();
      expect(body.effective_date).toBeDefined();
      // Entries should also have created_at
      expect(body.entries[0].created_at).toBeDefined();
      expect(body.entries[1].created_at).toBeDefined();
    });
  });

  describe('Full workflow', () => {
    it('handles complete double-entry accounting scenario', async () => {
      // Scenario: Transfer $100 from Cash account to Expenses account
      
      // Create Cash account (debit direction, asset)
      const cashRes = await request('POST', '/accounts', {
        name: 'Cash',
        direction: 'debit',
        balance: 500, // $500 starting balance
      });
      const cash = await cashRes.json();

      // Create Expenses account (debit direction, expense)
      const expensesRes = await request('POST', '/accounts', {
        name: 'Expenses',
        direction: 'debit',
        balance: 0,
      });
      const expenses = await expensesRes.json();

      // Record expense: Credit Cash (decrease), Debit Expenses (increase)
      const txRes = await request('POST', '/transactions', {
        name: 'Office supplies purchase',
        entries: [
          { account_id: cash.id, direction: 'credit', amount: 100 },
          { account_id: expenses.id, direction: 'debit', amount: 100 },
        ],
      });
      expect(txRes.status).toBe(201);

      // Verify Cash decreased
      const updatedCash = await (await request('GET', `/accounts/${cash.id}`)).json();
      expect(updatedCash.balance).toBe(400);

      // Verify Expenses increased
      const updatedExpenses = await (await request('GET', `/accounts/${expenses.id}`)).json();
      expect(updatedExpenses.balance).toBe(100);
    });
  });

  describe('Optimistic locking', () => {
    it('returns version in account response', async () => {
      const res = await request('POST', '/accounts', { direction: 'debit' });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.version).toBe(1);
    });

    it('increments version after transaction', async () => {
      // Create two accounts
      const acc1Res = await request('POST', '/accounts', {
        direction: 'debit',
        balance: 1000,
      });
      const acc1 = await acc1Res.json();
      expect(acc1.version).toBe(1);

      const acc2Res = await request('POST', '/accounts', {
        direction: 'credit',
        balance: 0,
      });
      const acc2 = await acc2Res.json();
      expect(acc2.version).toBe(1);

      // Create transaction that affects both accounts
      const txRes = await request('POST', '/transactions', {
        entries: [
          { account_id: acc1.id, direction: 'debit', amount: 100 },
          { account_id: acc2.id, direction: 'credit', amount: 100 },
        ],
      });
      expect(txRes.status).toBe(201);

      // Verify versions are incremented
      const updated1 = await (await request('GET', `/accounts/${acc1.id}`)).json();
      expect(updated1.version).toBe(2);

      const updated2 = await (await request('GET', `/accounts/${acc2.id}`)).json();
      expect(updated2.version).toBe(2);
    });

    it('increments version for each transaction affecting an account', async () => {
      // Create accounts
      const acc1Res = await request('POST', '/accounts', {
        direction: 'debit',
        balance: 1000,
      });
      const acc1 = await acc1Res.json();

      const acc2Res = await request('POST', '/accounts', {
        direction: 'credit',
        balance: 0,
      });
      const acc2 = await acc2Res.json();

      // First transaction
      await request('POST', '/transactions', {
        entries: [
          { account_id: acc1.id, direction: 'debit', amount: 100 },
          { account_id: acc2.id, direction: 'credit', amount: 100 },
        ],
      });

      // Second transaction
      await request('POST', '/transactions', {
        entries: [
          { account_id: acc1.id, direction: 'debit', amount: 100 },
          { account_id: acc2.id, direction: 'credit', amount: 100 },
        ],
      });

      // Verify version is 3 (1 initial + 2 transactions)
      const updated1 = await (await request('GET', `/accounts/${acc1.id}`)).json();
      expect(updated1.version).toBe(3);

      const updated2 = await (await request('GET', `/accounts/${acc2.id}`)).json();
      expect(updated2.version).toBe(3);
    });
  });

  describe('Health check', () => {
    it('returns ok status', async () => {
      const res = await request('GET', '/health');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
    });
  });
});

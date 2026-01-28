import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { InMemoryAccountRepository } from '../../src/repositories/accountRepository.js';
import { InMemoryTransactionRepository } from '../../src/repositories/transactionRepository.js';
import { InMemoryIdempotencyRepository } from '../../src/repositories/idempotencyRepository.js';

const UUID1 = 'fa967ec9-5be2-4c26-a874-7eeeabfc6da8';
const UUID2 = 'dbf17d00-8701-4c4e-9fc5-6ae33c324309';

describe('Idempotency', () => {
  let app: ReturnType<typeof createApp>;
  let idempotencyRepo: InMemoryIdempotencyRepository;

  beforeEach(async () => {
    const accountRepo = new InMemoryAccountRepository();
    const transactionRepo = new InMemoryTransactionRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    app = createApp({ accountRepo, transactionRepo, idempotencyRepo });
    
    // Create test accounts
    // UUID1: debit account with 1000 balance
    // UUID2: credit account with 1000 balance
    await app.request('/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: UUID1, direction: 'debit', balance: 1000 }),
    });
    await app.request('/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: UUID2, direction: 'credit', balance: 1000 }),
    });
  });

  it('processes request normally without idempotency key', async () => {
    const res = await app.request('/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          { account_id: UUID1, direction: 'credit', amount: 100 },
          { account_id: UUID2, direction: 'debit', amount: 100 },
        ],
      }),
    });
    
    expect(res.status).toBe(201);
    expect(res.headers.get('X-Idempotency-Replayed')).toBeNull();
  });

  it('returns cached response for duplicate idempotency key', async () => {
    const idempotencyKey = 'unique-key-123';
    const txBody = {
      entries: [
        { account_id: UUID1, direction: 'credit', amount: 100 },
        { account_id: UUID2, direction: 'debit', amount: 100 },
      ],
    };

    // First request
    const res1 = await app.request('/transactions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(txBody),
    });
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    // Second request with same key
    const res2 = await app.request('/transactions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(txBody),
    });
    expect(res2.status).toBe(201);
    expect(res2.headers.get('X-Idempotency-Replayed')).toBe('true');
    const body2 = await res2.json();

    // Same transaction ID returned
    expect(body2.id).toBe(body1.id);
  });

  it('does not double-charge on retry', async () => {
    const idempotencyKey = 'payment-123';
    const txBody = {
      entries: [
        { account_id: UUID1, direction: 'credit', amount: 500 },
        { account_id: UUID2, direction: 'debit', amount: 500 },
      ],
    };

    // Simulate retry
    await app.request('/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(txBody),
    });
    await app.request('/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(txBody),
    });

    // Check balance only decreased once
    const accRes = await app.request(`/accounts/${UUID1}`);
    const account = await accRes.json();
    expect(account.balance).toBe(500); // 1000 - 500, not 1000 - 1000
  });

  it('processes different idempotency keys independently', async () => {
    const txBody = {
      entries: [
        { account_id: UUID1, direction: 'credit', amount: 100 },
        { account_id: UUID2, direction: 'debit', amount: 100 },
      ],
    };

    const res1 = await app.request('/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-1' },
      body: JSON.stringify(txBody),
    });
    const res2 = await app.request('/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'key-2' },
      body: JSON.stringify(txBody),
    });

    const body1 = await res1.json();
    const body2 = await res2.json();
    
    // Different transaction IDs
    expect(body1.id).not.toBe(body2.id);
  });
});

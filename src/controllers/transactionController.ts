import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createTransactionSchema } from '../schemas/index.js';
import { TransactionService } from '../services/transactionService.js';
import { dollarsToCents, centsToDollars } from '../utils/money.js';
import type { Transaction } from '../models/transaction.js';

/**
 * Convert internal Transaction (cents) to API response (dollars).
 */
const toApiResponse = (transaction: Transaction) => ({
  id: transaction.id,
  name: transaction.name,
  entries: transaction.entries.map((entry) => ({
    id: entry.id,
    account_id: entry.account_id,
    direction: entry.direction,
    amount: centsToDollars(entry.amount),
    created_at: entry.created_at.toISOString(),
  })),
  created_at: transaction.created_at.toISOString(),
  effective_date: transaction.effective_date.toISOString(),
});

/**
 * Create transaction routes.
 * Handles:
 * - POST /transactions - Create a new transaction
 */
export const createTransactionController = (transactionService: TransactionService) => {
  const router = new Hono();

  // POST /transactions - Create a new transaction
  router.post('/', zValidator('json', createTransactionSchema), async (c) => {
    const input = c.req.valid('json');

    const transaction = await transactionService.createTransaction({
      id: input.id,
      name: input.name,
      entries: input.entries.map((entry) => ({
        id: entry.id,
        account_id: entry.account_id,
        direction: entry.direction,
        amount: dollarsToCents(entry.amount),
      })),
      effective_date: input.effective_date ? new Date(input.effective_date) : undefined,
    });

    return c.json(toApiResponse(transaction), 201);
  });

  return router;
};

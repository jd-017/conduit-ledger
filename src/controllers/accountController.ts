import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createAccountSchema } from '../schemas/index.js';
import { AccountService } from '../services/accountService.js';
import { dollarsToCents, centsToDollars } from '../utils/money.js';
import type { Account } from '../models/account.js';
import type { BalanceChange } from '../models/balanceHistory.js';

/**
 * Convert internal Account (cents) to API response (dollars).
 */
const toApiResponse = (account: Account) => ({
  id: account.id,
  name: account.name,
  direction: account.direction,
  balance: centsToDollars(account.balance),
  version: account.version,
  created_at: account.created_at.toISOString(),
  updated_at: account.updated_at.toISOString(),
});

/**
 * Convert internal BalanceChange (cents) to API response (dollars).
 */
const toHistoryResponse = (change: BalanceChange) => ({
  id: change.id,
  transaction_id: change.transaction_id,
  entry_id: change.entry_id,
  entry_direction: change.entry_direction,
  amount: centsToDollars(change.amount),
  balance_before: centsToDollars(change.balance_before),
  balance_after: centsToDollars(change.balance_after),
  created_at: change.created_at.toISOString(),
  effective_date: change.effective_date.toISOString(),
});

/**
 * Create account routes.
 * Handles:
 * - POST /accounts - Create a new account
 * - GET /accounts/:id - Get an account by ID
 * - GET /accounts/:id/history - Get complete balance history
 * - GET /accounts/:id/balance - Get balance (current or at point in time)
 */
export const createAccountController = (accountService: AccountService) => {
  const router = new Hono();

  // POST /accounts - Create a new account
  router.post('/', zValidator('json', createAccountSchema), async (c) => {
    const input = c.req.valid('json');

    const account = await accountService.createAccount({
      id: input.id,
      name: input.name,
      direction: input.direction,
      balance: input.balance !== undefined ? dollarsToCents(input.balance) : 0,
    });

    return c.json(toApiResponse(account), 201);
  });

  // GET /accounts/:id - Get an account by ID
  router.get('/:id', async (c) => {
    const id = c.req.param('id');
    const account = await accountService.getAccount(id);
    return c.json(toApiResponse(account));
  });

  // GET /accounts/:id/history - Get complete balance history
  router.get('/:id/history', async (c) => {
    const id = c.req.param('id');
    const history = await accountService.getBalanceHistory(id);
    return c.json(history.map(toHistoryResponse));
  });

  // GET /accounts/:id/balance - Get balance (current or at point in time)
  router.get('/:id/balance', async (c) => {
    const id = c.req.param('id');
    const asOfParam = c.req.query('as_of');

    if (!asOfParam) {
      // Return current balance
      const account = await accountService.getAccount(id);
      return c.json({
        balance: centsToDollars(account.balance),
        as_of: new Date().toISOString(),
      });
    }

    // Parse and validate as_of date
    const asOf = new Date(asOfParam);
    if (isNaN(asOf.getTime())) {
      return c.json({ error: 'Invalid as_of date format. Use ISO 8601.' }, 400);
    }

    const balance = await accountService.getBalanceAtTime(id, asOf);
    return c.json({
      balance: centsToDollars(balance),
      as_of: asOf.toISOString(),
    });
  });

  return router;
};

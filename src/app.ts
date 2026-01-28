import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { ZodError } from 'zod';
import { AppError } from './errors/index.js';
import {
  InMemoryAccountRepository,
  InMemoryTransactionRepository,
  InMemoryIdempotencyRepository,
  InMemoryBalanceHistoryRepository,
  type IAccountRepository,
  type ITransactionRepository,
  type IIdempotencyRepository,
  type IBalanceHistoryRepository,
} from './repositories/index.js';
import { createIdempotencyMiddleware } from './middleware/index.js';
import { AccountService, TransactionService } from './services/index.js';
import { createAccountController, createTransactionController } from './controllers/index.js';

/**
 * Create and configure the Hono application.
 * Accepts optional repositories for dependency injection (useful for testing).
 */
export const createApp = (options?: {
  accountRepo?: IAccountRepository;
  transactionRepo?: ITransactionRepository;
  idempotencyRepo?: IIdempotencyRepository;
  balanceHistoryRepo?: IBalanceHistoryRepository;
}) => {
  const app = new Hono();

  // Initialize repositories (use provided ones or create new)
  const accountRepo: IAccountRepository = options?.accountRepo ?? new InMemoryAccountRepository();
  const transactionRepo: ITransactionRepository = options?.transactionRepo ?? new InMemoryTransactionRepository();
  const idempotencyRepo: IIdempotencyRepository = options?.idempotencyRepo ?? new InMemoryIdempotencyRepository();
  const balanceHistoryRepo: IBalanceHistoryRepository = options?.balanceHistoryRepo ?? new InMemoryBalanceHistoryRepository();

  // Initialize services
  const accountService = new AccountService(accountRepo, balanceHistoryRepo);
  const transactionService = new TransactionService(transactionRepo, accountService);

  // Middleware
  app.use('*', logger());

  // Apply idempotency middleware to POST /transactions only
  const idempotencyMiddleware = createIdempotencyMiddleware(idempotencyRepo);
  app.post('/transactions', idempotencyMiddleware);

  // Routes
  app.route('/accounts', createAccountController(accountService));
  app.route('/transactions', createTransactionController(transactionService));

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Global error handler
  app.onError((err, c) => {
    // Handle Zod validation errors
    if (err instanceof ZodError) {
      return c.json(
        {
          error: 'Validation error',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        400
      );
    }

    // Handle application errors (NotFoundError, ValidationError, ConflictError)
    if (err instanceof AppError) {
      return c.json({ error: err.message }, err.statusCode as 400 | 404 | 409 | 500);
    }

    // Log unexpected errors
    console.error('Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  return app;
};

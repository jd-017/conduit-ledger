import { Context, Next } from 'hono';
import type { IIdempotencyRepository, IdempotencyRecord } from '../repositories/idempotencyRepository.js';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const createIdempotencyMiddleware = (repo: IIdempotencyRepository) => {
  return async (c: Context, next: Next) => {
    const idempotencyKey = c.req.header('Idempotency-Key');

    // No key provided, process normally
    if (!idempotencyKey) {
      await next();
      return;
    }

    // Check for existing record
    const existing = await repo.get(idempotencyKey);

    if (existing) {
      // Return cached response
      c.header('X-Idempotency-Replayed', 'true');
      return c.json(existing.response, existing.status_code as 200 | 201 | 400 | 404 | 409);
    }

    // Process the request
    await next();

    // Only cache successful responses (2xx)
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      // Clone response to read body without consuming it
      const body = await c.res.clone().json();

      const record: IdempotencyRecord = {
        key: idempotencyKey,
        response: body,
        status_code: status,
        created_at: new Date(),
        expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      };

      await repo.set(record);
    }
  };
};

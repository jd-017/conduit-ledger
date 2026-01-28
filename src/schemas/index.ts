import { z } from 'zod';

/**
 * Direction must be either 'debit' or 'credit'.
 */
export const directionSchema = z.enum(['debit', 'credit']);

/**
 * Schema for creating a new account.
 * - id: Optional UUID, auto-generated if not provided
 * - name: Optional label
 * - direction: Required, must be 'debit' or 'credit'
 * - balance: Optional initial balance in dollars (converted to cents internally)
 */
export const createAccountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().optional(),
  direction: directionSchema,
  balance: z.number().min(0).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

/**
 * Schema for a single entry within a transaction.
 * - id: Optional UUID, auto-generated if not provided
 * - account_id: Required, must reference an existing account
 * - direction: Required, must be 'debit' or 'credit'
 * - amount: Required, positive number in dollars (converted to cents internally)
 */
export const entrySchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  direction: directionSchema,
  amount: z.number().positive(),
});

export type EntryInput = z.infer<typeof entrySchema>;

/**
 * Schema for creating a new transaction.
 * - id: Optional UUID, auto-generated if not provided
 * - name: Optional label
 * - entries: Required array of entry objects (must have at least 1)
 * - effective_date: Optional ISO 8601 datetime (defaults to current time in service layer)
 */
export const createTransactionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().optional(),
  entries: z.array(entrySchema).min(1, 'Transaction must have at least one entry'),
  effective_date: z.string().datetime().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

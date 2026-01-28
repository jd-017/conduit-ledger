import { v4 as uuidv4 } from 'uuid';

export type Direction = 'debit' | 'credit';

export interface Account {
  id: string;
  name: string | null;
  direction: Direction;
  balance: number; // Stored in cents
  version: number; // Optimistic locking version, starts at 1
  created_at: Date;
  updated_at: Date;
}

export interface CreateAccountParams {
  id?: string;
  name?: string | null;
  direction: Direction;
  balance?: number; // Input in cents
  created_at?: Date; // Optional for testing
}

export const createAccount = (params: CreateAccountParams): Account => {
  const now = params.created_at ?? new Date();
  return {
    id: params.id ?? uuidv4(),
    name: params.name ?? null,
    direction: params.direction,
    balance: params.balance ?? 0,
    version: 1, // Always starts at 1 for new accounts
    created_at: now,
    updated_at: now,
  };
};

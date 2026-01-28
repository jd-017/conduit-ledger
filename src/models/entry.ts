import { v4 as uuidv4 } from 'uuid';
import type { Direction } from './account.js';

export interface Entry {
  id: string;
  account_id: string; // snake_case to match API spec
  direction: Direction;
  amount: number; // Stored in cents
  created_at: Date;
}

export interface CreateEntryParams {
  id?: string;
  account_id: string;
  direction: Direction;
  amount: number; // Input in cents
}

export const createEntry = (params: CreateEntryParams): Entry => ({
  id: params.id ?? uuidv4(),
  account_id: params.account_id,
  direction: params.direction,
  amount: params.amount,
  created_at: new Date(),
});

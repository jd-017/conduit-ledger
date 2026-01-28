import { v4 as uuidv4 } from 'uuid';
import type { Entry, CreateEntryParams } from './entry.js';
import { createEntry } from './entry.js';

export interface Transaction {
  id: string;
  name: string | null;
  entries: Entry[];
  created_at: Date;
  effective_date: Date;
}

export interface CreateTransactionParams {
  id?: string;
  name?: string | null;
  entries: CreateEntryParams[];
  effective_date?: Date;
}

export const createTransaction = (params: CreateTransactionParams): Transaction => {
  const now = new Date();
  return {
    id: params.id ?? uuidv4(),
    name: params.name ?? null,
    entries: params.entries.map(createEntry),
    created_at: now,
    effective_date: params.effective_date ?? now,
  };
};

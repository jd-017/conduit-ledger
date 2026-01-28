import { v4 as uuidv4 } from 'uuid';
import type { Direction } from './account.js';

export interface BalanceChange {
  id: string;
  account_id: string;
  transaction_id: string;
  entry_id: string;
  entry_direction: Direction;
  amount: number;              // Entry amount (always positive, in cents)
  balance_before: number;      // Balance before this change (cents)
  balance_after: number;       // Balance after this change (cents)
  created_at: Date;            // When this record was created
  effective_date: Date;        // When the transaction occurred
}

export interface CreateBalanceChangeParams {
  account_id: string;
  transaction_id: string;
  entry_id: string;
  entry_direction: Direction;
  amount: number;
  balance_before: number;
  balance_after: number;
  effective_date: Date;
}

export const createBalanceChange = (params: CreateBalanceChangeParams): BalanceChange => ({
  id: uuidv4(),
  account_id: params.account_id,
  transaction_id: params.transaction_id,
  entry_id: params.entry_id,
  entry_direction: params.entry_direction,
  amount: params.amount,
  balance_before: params.balance_before,
  balance_after: params.balance_after,
  created_at: new Date(),
  effective_date: params.effective_date,
});

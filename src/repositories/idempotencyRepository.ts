/**
 * Idempotency record that maps a key to a cached response.
 */
export interface IdempotencyRecord {
  key: string;
  response: unknown;      // The JSON response body
  status_code: number;    // HTTP status code
  created_at: Date;
  expires_at: Date;
}

/**
 * Repository interface for idempotency records.
 */
export interface IIdempotencyRepository {
  get(key: string): Promise<IdempotencyRecord | undefined>;
  set(record: IdempotencyRecord): Promise<void>;
  clear(): Promise<void>;  // For testing
}

/**
 * In-memory implementation of IIdempotencyRepository.
 * Stores idempotency records in a Map for O(1) lookups.
 * Expired records are automatically cleaned up on access.
 */
export class InMemoryIdempotencyRepository implements IIdempotencyRepository {
  private store = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | undefined> {
    const record = this.store.get(key);

    // Check if expired
    if (record && record.expires_at < new Date()) {
      this.store.delete(key);
      return undefined;
    }

    // Return a copy to prevent external mutation
    return record ? { ...record } : undefined;
  }

  async set(record: IdempotencyRecord): Promise<void> {
    // Store a copy to prevent external mutation
    this.store.set(record.key, { ...record });
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

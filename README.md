# Conduit Ledger

A double-entry accounting ledger API.

## Quick Start

```bash
npm install
npm start        # Run server on port 5000
npm test         # Run tests
```

## API

### POST /accounts

```bash
curl -X POST http://localhost:5000/accounts \
  -H "Content-Type: application/json" \
  -d '{"name": "Cash", "direction": "debit", "balance": 1000}'
```

### GET /accounts/:id

```bash
curl http://localhost:5000/accounts/{id}
```

### POST /transactions

```bash
curl -X POST http://localhost:5000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {"account_id": "{debit-account-id}", "direction": "debit", "amount": 100},
      {"account_id": "{credit-account-id}", "direction": "credit", "amount": 100}
    ]
  }'
```

## Design

**Repository Pattern** — Data access abstracted behind interfaces for easy database swap.

**Service Layer** — Business logic isolated from HTTP concerns.

**Integer Storage** — Amounts stored as cents internally to avoid floating-point errors.

### Production-Ready Patterns

These patterns aren't strictly necessary for single-threaded Node.js with in-memory storage, but demonstrate production readiness:

**Optimistic Locking** — Version-based concurrency control prevents lost updates when backed by a real database with concurrent access.

**Idempotency** — `Idempotency-Key` header prevents duplicate transaction processing across distributed instances or network retries.

**Audit Trail** — Immutable balance history enables point-in-time reconstruction for compliance and debugging.

## Production Considerations

### Balance Locking and Holds

Real payment systems must handle funds that are committed but not yet finalized:

- **Blockchain**: Funds in mempool are "pending" until confirmed (may revert)
- **Fiat rails**: ACH/wire transfers have multi-day settlement with potential failures
- **Auth holds**: Credit card pre-auth reserves funds before capture

A production ledger would track `pending_balance` separately from `available_balance`, with a state machine for holds (pending → captured/released/expired).

### Horizontal Scaling

For horizontal scaling, the in-memory stores would be replaced with:

| Component | Purpose |
|-----------|---------|
| PostgreSQL | Primary data store with optimistic locking via version column |
| Redis | Balance cache + distributed idempotency keys |
| Message Queue | Async processing for webhooks, analytics, compliance |

**Sharding**: Partition by `account_id` hash. Cross-shard transactions require 2PC or saga pattern.

```
        ┌──────────────┐
        │ Load Balancer│
        └───────┬──────┘
       ┌────────┼────────┐
       ▼        ▼        ▼
   ┌───────┐┌───────┐┌───────┐
   │ App 1 ││ App 2 ││ App N │
   └───┬───┘└───┬───┘└───┬───┘
       └────────┼────────┘
       ┌────────┼────────┐
       ▼        ▼        ▼
   ┌───────┐┌───────┐┌───────┐
   │ Redis ││  PG   ││ Queue │
   └───────┘└───────┘└───────┘
```

The patterns implemented here (optimistic locking, idempotency, immutable audit log) form the foundation for this architecture.

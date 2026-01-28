# Conduit Ledger

A double-entry accounting ledger API. See [docs/problem.md](docs/problem.md) for the full specification.

## Features

- **Double-entry accounting**: Every transaction must balance (total debits = total credits)
- **Account directions**: Accounts can be either "debit" or "credit" type
- **Balance protection**: Transactions that would cause negative balances are rejected
- **Duplicate ID protection**: Returns 409 Conflict for duplicate account/transaction IDs

## Quick Start

```bash
# Install dependencies
npm install

# Run the server (default port 5000)
npm start

# Run in development mode (auto-reload)
npm run dev

# Run tests
npm test
```

## API Endpoints

### POST /accounts

Create a new account.

| Field     | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| id        | uuid   | No       | Auto-generated if not provided       |
| name      | string | No       | Optional label                       |
| direction | string | Yes      | Must be "debit" or "credit"          |
| balance   | number | No       | Initial balance in USD (default: 0)  |

**Example:**

```bash
curl -X POST http://localhost:5000/accounts \
  -H "Content-Type: application/json" \
  -d '{"name": "Cash", "direction": "debit", "balance": 1000}'
```

**Response (201):**

```json
{
  "id": "71cde2aa-b9bc-496a-a6f1-34964d05e6fd",
  "name": "Cash",
  "direction": "debit",
  "balance": 1000
}
```

### GET /accounts/:id

Retrieve an account by ID.

```bash
curl http://localhost:5000/accounts/71cde2aa-b9bc-496a-a6f1-34964d05e6fd
```

### POST /transactions

Create a new transaction with balanced entries.

| Field   | Type   | Required | Description                    |
|---------|--------|----------|--------------------------------|
| id      | uuid   | No       | Auto-generated if not provided |
| name    | string | No       | Optional label                 |
| entries | array  | Yes      | Array of entry objects         |

Each entry:

| Field      | Type   | Required | Description                 |
|------------|--------|----------|-----------------------------|
| id         | uuid   | No       | Auto-generated if not provided |
| account_id | uuid   | Yes      | Reference to an account     |
| direction  | string | Yes      | Must be "debit" or "credit" |
| amount     | number | Yes      | Positive amount in USD      |

**Example:**

```bash
curl -X POST http://localhost:5000/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Office supplies",
    "entries": [
      {"account_id": "cash-uuid", "direction": "credit", "amount": 100},
      {"account_id": "expenses-uuid", "direction": "debit", "amount": 100}
    ]
  }'
```

## Business Rules

### Transaction Balancing

Every transaction must balance: total debit amounts must equal total credit amounts.

### Balance Calculation

When an entry is applied to an account:
- **Same direction** (account & entry): Balance **increases**
- **Different direction**: Balance **decreases**

| Account Direction | Entry Direction | Effect on Balance |
|-------------------|-----------------|-------------------|
| debit             | debit           | +amount           |
| debit             | credit          | -amount           |
| credit            | debit           | -amount           |
| credit            | credit          | +amount           |

### Negative Balance Protection

Transactions that would cause any account balance to go negative are rejected with a 400 error.

## Architecture

```
src/
├── models/          # Data types and factory functions
├── repositories/    # Data access layer (in-memory)
├── services/        # Business logic
├── controllers/     # HTTP handlers
├── schemas/         # Zod validation schemas
├── errors/          # Custom error classes
├── utils/           # Helper functions (money conversion)
└── app.ts           # Hono app setup
```

### Key Design Decisions

1. **Repository Pattern**: Data access is abstracted behind interfaces, making it easy to swap in-memory storage for a real database.

2. **Service Layer**: Business logic is isolated in services, making it testable without HTTP concerns.

3. **Cents for Storage**: Amounts are stored as integers (cents) internally to avoid floating-point precision issues, converted to/from dollars at the API boundary.

4. **Dependency Injection**: Services receive repositories via constructor, enabling easy mocking for tests.

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Design Note: Multi-Currency

This ledger is USD-only as specified. Multi-currency would require:

- **Currency per account** — a ledger only balances within one currency
- **FX as a separate operation** — conversions link two single-currency transactions via a quote/rate
- **Currency-aware precision** — USD uses 2 decimals, but USDC uses 6, BTC uses 8, JPY uses 0

## Production Considerations

For a production deployment, consider:

- **Database**: Replace in-memory storage with a persistent database
- **Idempotency**: Add request idempotency for safe transaction retries
- **Audit Logging**: Record all balance changes with timestamps
- **Authentication**: Add user authentication and authorization
- **Rate Limiting**: Protect against abuse
- **Monitoring**: Add metrics and health checks

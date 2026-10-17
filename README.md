# Accounting demo

A TypeScript example of recording a supplier bill payment with double-entry accounting. The repository includes application and domain logic plus a Firestore transaction manager. Concrete repository adapters and an HTTP server are outside the current example.

## The bill payment workflow

`RecordBillPaymentCommandHandler` accepts a bill ID and payment details. It checks that the current user is an admin or accountant, loads the selected bank or cash account, and passes its chart-of-account ID and the bill ID to a payment strategy. `BillPaymentStrategy` performs the accounting work inside an `ITransactionManager.run` callback:

1. Load the bill and reject missing, paid, or cancelled bills and overpayments.
2. Load the selected bank or cash chart of account and the accounts payable chart. The selected account must be an asset. Confirm that the bill's supplier exists.
3. Create a journal entry linked to the bill. Debit accounts payable and credit the bank or cash account by the **same payment amount**.
4. Save the payment, reduce the bill's amount due, update its payment status, and increase the corresponding chart-of-account debit and credit totals.

For example, a bill with `amountPaid = 20` and `amountDue = 80` receives a payment of `40`:

| Record             | Debit | Credit | Result                                                       |
| ------------------ | ----: | -----: | ------------------------------------------------------------ |
| Accounts payable   |    40 |      0 | Liability decreases                                          |
| Bank or cash asset |     0 |     40 | Asset decreases                                              |
| Bill               |       |        | `amountPaid = 60`, `amountDue = 40`, status `Partially Paid` |

When a payment covers the full amount due, the bill status becomes `Paid`. The journal lines refer to the same journal entry and their debits and credits balance.

## Firestore transaction boundary

`TransactionManager.run` calls Firestore's `runTransaction` and gives the operation an opaque transaction ID. Repository adapters can call `TransactionManager.resolve(transactionId, db)` to access the active `ManagedTransaction`; the `db` argument must be the same Firestore instance used by the manager. The ID expires when the callback finishes or fails. Each Firestore retry receives a fresh managed context.

`ManagedTransaction` wraps Firestore's transaction `get`, `set`, and `update` methods. It caches document snapshots by path so `getBeforeWrite` can reuse a document already read. It rejects a new read after a write has started, matching Firestore's read-before-write requirement. Adapters should load every document they need before their first write and pass the same transaction ID through the workflow.

## Code layout

| Path                                                | Responsibility                                            |
| --------------------------------------------------- | --------------------------------------------------------- |
| `src/application/commands/`                         | Authorization and preparation of the bill payment request |
| `src/application/strategies/`                       | Bill payment rules and accounting writes                  |
| `src/application/dtos/`                             | Input shapes and decorator-based validation rules         |
| `src/domain/entities/` and `src/domain/enums/`      | Accounting records and their states                       |
| `src/domain/interfaces/` and `src/domain/services/` | Repository and transaction contracts                      |
| `src/infrastructure/`                               | Firestore transaction context and manager                 |
| `tests/`                                            | Unit tests with in-memory mocks for the contracts         |

The strategy receives repositories, a mapper, and a transaction manager through its constructor. This keeps business decisions separate from database code and makes the workflow testable without a live Firestore instance.

## Run the checks

Install dependencies with `npm install`, then run:

```sh
npm test
npm run test:typecheck
npm run test:format
npx tsc --noEmit
```

The tests use Node's test runner through `tsx`. The test command preloads `reflect-metadata` for the decorated DTOs. `test:typecheck` checks both tests and application source. The test suite covers access rules, DTO validation, balanced journal lines, partial and full payments, rejection paths that must make no writes, transaction ID lifetime and retries, and read-before-write behavior.

## Scope and production considerations

This repository demonstrates one workflow; it does not include repository implementations, an API entry point, or a complete ledger. The DTO validation decorators define rules, but a caller must explicitly run validation before invoking the command. The transaction manager delegates atomic commit and rollback to Firestore; the unit tests use mocks and do not verify behavior against a live database.

## Risks
- Concurrency issues when multiple transactions attempt to modify the same records simultaneously.
- Risk of duplicate payments if the same request is processed more than once.
- Potential for inconsistent state if validation is bypassed or fails silently.
- Limitations of using JavaScript `number` for monetary values, which may lead to rounding errors.

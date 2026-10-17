import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import ManagedTransaction from '../src/infrastructure/ManagedTransaction';

function createFixture() {
  const billRef = { path: 'bills/bill-1' } as DocumentReference;
  const accountRef = { path: 'accounts/bank-1' } as DocumentReference;
  const billSnapshot = { id: 'bill-1' } as DocumentSnapshot;
  const accountSnapshot = { id: 'bank-1' } as DocumentSnapshot;
  const get = mock.fn(async (ref: DocumentReference) =>
    ref.path === billRef.path ? billSnapshot : accountSnapshot,
  );
  const set = mock.fn((_ref: DocumentReference, _data: object) => undefined);
  const create = mock.fn((_ref: DocumentReference, _data: object) => undefined);
  const update = mock.fn((_ref: DocumentReference, _data: object) => undefined);
  const transaction = { get, set, create, update } as unknown as Transaction;
  const managed = new ManagedTransaction(transaction);

  return {
    billRef,
    accountRef,
    billSnapshot,
    accountSnapshot,
    get,
    set,
    create,
    update,
    transaction,
    managed,
  };
}

describe('ManagedTransaction', () => {
  it('delegates reads and caches snapshots by document path', async () => {
    const fixture = createFixture();

    const snapshot = await fixture.managed.get(fixture.billRef);
    const cached = await fixture.managed.getBeforeWrite(fixture.billRef);

    assert.strictEqual(snapshot, fixture.billSnapshot);
    assert.strictEqual(cached, fixture.billSnapshot);
    assert.deepEqual(
      fixture.get.mock.calls.map((call) => call.arguments[0]),
      [fixture.billRef],
    );
    assert.strictEqual(fixture.managed.transaction, fixture.transaction);
  });

  it('fetches an uncached document before any writes', async () => {
    const fixture = createFixture();

    assert.strictEqual(
      await fixture.managed.getBeforeWrite(fixture.accountRef),
      fixture.accountSnapshot,
    );
    assert.equal(fixture.get.mock.callCount(), 1);
  });

  it('delegates create, set and update to the Firestore transaction', () => {
    const fixture = createFixture();
    const billData = { amountDue: 40 };
    const accountData = { totalCredits: 52 };

    fixture.managed.set(fixture.billRef, billData);
    fixture.managed.create(fixture.billRef, billData);
    fixture.managed.update(fixture.accountRef, accountData);

    assert.deepEqual(fixture.set.mock.calls[0].arguments, [fixture.billRef, billData]);
    assert.deepEqual(fixture.create.mock.calls[0].arguments, [fixture.billRef, billData]);
    assert.deepEqual(fixture.update.mock.calls[0].arguments, [
      fixture.accountRef,
      accountData,
    ]);
  });

  for (const write of ['create', 'set', 'update'] as const) {
    it(`rejects new reads after ${write} and retains earlier cached reads`, async () => {
      const fixture = createFixture();
      await fixture.managed.get(fixture.billRef);
      fixture.managed[write](fixture.billRef, { amountDue: 40 });

      assert.strictEqual(
        await fixture.managed.getBeforeWrite(fixture.billRef),
        fixture.billSnapshot,
      );
      await assert.rejects(
        fixture.managed.get(fixture.accountRef),
        /reads must precede writes/,
      );
      await assert.rejects(
        fixture.managed.getBeforeWrite(fixture.accountRef),
        /reads must precede writes/,
      );
      assert.equal(fixture.get.mock.callCount(), 1);
    });
  }
});

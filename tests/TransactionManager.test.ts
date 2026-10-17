import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Firestore, Transaction } from 'firebase-admin/firestore';
import ManagedTransaction from '../src/infrastructure/ManagedTransaction';
import { TransactionManager } from '../src/infrastructure/TransactionManager';

function createFixture() {
  const firestoreTransaction = {} as Transaction;
  const runTransaction = mock.fn(
    async (callback: (transaction: Transaction) => Promise<unknown>) =>
      callback(firestoreTransaction),
  );
  const db = { runTransaction } as unknown as Firestore;
  const manager = new TransactionManager(db);

  return { db, manager, firestoreTransaction, runTransaction };
}

describe('TransactionManager', () => {
  it('exposes the active Firestore transaction and returns the operation result', async () => {
    const fixture = createFixture();
    let issuedId = '';

    const result = await fixture.manager.run(async (transactionId) => {
      issuedId = transactionId;
      const context = TransactionManager.resolve(transactionId, fixture.db);

      assert.ok(context instanceof ManagedTransaction);
      assert.strictEqual(context.transaction, fixture.firestoreTransaction);
      return { paymentId: 'payment-1' };
    });

    assert.match(
      issuedId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.deepEqual(result, { paymentId: 'payment-1' });
    assert.equal(fixture.runTransaction.mock.callCount(), 1);
    assert.throws(
      () => TransactionManager.resolve(issuedId, fixture.db),
      /Unknown or expired transaction ID/,
    );
  });

  it('rejects unknown IDs and IDs associated with another Firestore instance', async () => {
    const fixture = createFixture();
    const otherDb = {} as Firestore;

    assert.throws(
      () => TransactionManager.resolve('missing-id', fixture.db),
      /Unknown or expired transaction ID/,
    );

    await fixture.manager.run(async (transactionId) => {
      assert.throws(
        () => TransactionManager.resolve(transactionId, otherDb),
        /Unknown or expired transaction ID/,
      );
    });
  });

  it('expires the ID when the operation rejects', async () => {
    const fixture = createFixture();
    let issuedId = '';

    await assert.rejects(
      fixture.manager.run(async (transactionId) => {
        issuedId = transactionId;
        throw new Error('payment failed');
      }),
      /payment failed/,
    );

    assert.throws(
      () => TransactionManager.resolve(issuedId, fixture.db),
      /Unknown or expired transaction ID/,
    );
  });

  it('expires the ID when Firestore rejects after the callback returns', async () => {
    const fixture = createFixture();
    let issuedId = '';

    fixture.runTransaction.mock.mockImplementation(async (callback) => {
      await callback(fixture.firestoreTransaction);
      throw new Error('commit failed');
    });

    await assert.rejects(
      fixture.manager.run(async (transactionId) => {
        issuedId = transactionId;
      }),
      /commit failed/,
    );

    assert.throws(
      () => TransactionManager.resolve(issuedId, fixture.db),
      /Unknown or expired transaction ID/,
    );
  });

  it('creates a fresh context for each Firestore retry using the same ID', async () => {
    const fixture = createFixture();
    const contexts: ManagedTransaction[] = [];
    const issuedIds: string[] = [];

    fixture.runTransaction.mock.mockImplementation(async (callback) => {
      try {
        await callback({} as Transaction);
      } catch (error) {
        assert.match(String(error), /retry/);
        assert.throws(
          () => TransactionManager.resolve(issuedIds[0], fixture.db),
          /Unknown or expired transaction ID/,
        );
      }
      return callback(fixture.firestoreTransaction);
    });

    const result = await fixture.manager.run(async (transactionId) => {
      issuedIds.push(transactionId);
      contexts.push(TransactionManager.resolve(transactionId, fixture.db));

      if (contexts.length === 1) {
        throw new Error('retry');
      }
      return 'completed';
    });

    assert.equal(result, 'completed');
    assert.equal(issuedIds.length, 2);
    assert.equal(issuedIds[0], issuedIds[1]);
    assert.notStrictEqual(contexts[0], contexts[1]);
    assert.strictEqual(contexts[1].transaction, fixture.firestoreTransaction);
    assert.throws(() => TransactionManager.resolve(issuedIds[0], fixture.db));
  });
});

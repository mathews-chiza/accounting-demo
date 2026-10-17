import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DocumentReference,
  Firestore,
  Timestamp,
  Transaction,
} from 'firebase-admin/firestore';
import { ACCOUNTS_PAYABLE_ACCOUNT_ID } from '../src/application/constants';
import PaymentRequestDTO from '../src/application/dtos/PaymentRequestDTO';
import IAutoMapper from '../src/application/services/IAutoMapper';
import PaymentStrategyFactory from '../src/application/strategies/factory/PaymentStrategyFactory';
import Bill from '../src/domain/entities/Bill';
import ChartOfAccount from '../src/domain/entities/ChartOfAccount';
import JournalEntry from '../src/domain/entities/JournalEntry';
import JournalEntryLine from '../src/domain/entities/JournalEntryLine';
import Payment from '../src/domain/entities/Payment';
import Supplier from '../src/domain/entities/Supplier';
import BillStatus from '../src/domain/enums/BillStatus';
import ChartOfAccountType from '../src/domain/enums/ChartOfAccountType';
import PaymentMethod from '../src/domain/enums/PaymentMethod';
import PaymentType from '../src/domain/enums/PaymentType';
import FirestoreBaseRepository from '../src/infrastructure/FirestoreBaseRepository';
import { TransactionManager } from '../src/infrastructure/TransactionManager';

// Simulates Firestore's commit boundary: staged writes become visible only when
// the transaction callback resolves. It does not simulate Firestore contention.
function createFirestoreFixture() {
  const documents = new Map<string, Record<string, unknown>>();
  let nextId = 1;

  const snapshot = (path: string, source = documents) => {
    const data = source.get(path);
    return {
      id: path.split('/').at(-1),
      exists: data !== undefined,
      data: () => data && { ...data },
    };
  };

  const getAll = async (
    ref: DocumentReference,
    options: { fieldMask?: string[] },
    source = documents,
  ) => {
    assert.deepEqual(options.fieldMask, []);
    const result = snapshot(ref.path, source);
    return [{ ...result, data: () => undefined }];
  };

  const reference = (collection: string, id: string) => {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      get: async () => snapshot(path),
      create: async (data: object) => {
        if (documents.has(path)) throw new Error('Document already exists');
        documents.set(path, { ...data });
      },
      update: async (data: object) => {
        if (!documents.has(path)) throw new Error('Document does not exist');
        documents.set(path, { ...documents.get(path), ...data });
      },
    } as unknown as DocumentReference;
  };

  const db = {
    getAll: (ref: DocumentReference, options: { fieldMask?: string[] }) =>
      getAll(ref, options),
    collection: (name: string) => ({
      doc: (id?: string) => reference(name, id ?? `generated-${nextId++}`),
    }),
    batch: () => {
      const writes: Array<{ path: string; data: object }> = [];
      return {
        create: (ref: DocumentReference, data: object) => {
          writes.push({ path: ref.path, data });
        },
        commit: async () => {
          for (const write of writes) {
            if (documents.has(write.path)) throw new Error('Document already exists');
          }
          for (const write of writes) documents.set(write.path, { ...write.data });
        },
      };
    },
    runTransaction: async <T>(operation: (transaction: Transaction) => Promise<T>) => {
      const staged = new Map(documents);
      const transaction = {
        get: async (ref: DocumentReference) => snapshot(ref.path, staged),
        getAll: (ref: DocumentReference, options: { fieldMask?: string[] }) =>
          getAll(ref, options, staged),
        create: (ref: DocumentReference, data: object) => {
          if (staged.has(ref.path)) throw new Error('Document already exists');
          staged.set(ref.path, { ...data });
        },
        update: (ref: DocumentReference, data: object) => {
          if (!staged.has(ref.path)) throw new Error('Document does not exist');
          staged.set(ref.path, { ...staged.get(ref.path), ...data });
        },
      } as unknown as Transaction;

      const result = await operation(transaction);
      documents.clear();
      for (const [path, data] of staged) documents.set(path, data);
      return result;
    },
  } as unknown as Firestore;

  const bills = new FirestoreBaseRepository<Bill>(db, 'bills');
  const manager = new TransactionManager(db);
  const bill = (id = '') => Object.assign(new Bill(), { id, amountDue: 80 });
  return { db, bills, manager, documents, bill };
}

describe('FirestoreBaseRepository', () => {
  it('creates and reads documents with generated or supplied IDs', async () => {
    const fixture = createFirestoreFixture();
    const generated = await fixture.bills.create(fixture.bill());
    const supplied = await fixture.bills.create(fixture.bill('bill-2'));

    assert.equal(generated.id, 'generated-1');
    assert.equal(supplied.id, 'bill-2');
    assert.deepEqual(await fixture.bills.getById(generated.id), {
      id: 'generated-1',
      amountDue: 80,
    });
    assert.equal(await fixture.bills.exists('bill-2'), true);
    assert.equal(await fixture.bills.exists('missing'), false);
    assert.equal(await fixture.bills.getById('missing'), null);
    await assert.rejects(fixture.bills.create(fixture.bill('bill-2')), /already exists/);
  });

  it('updates and batch creates documents outside a transaction', async () => {
    const fixture = createFirestoreFixture();
    await fixture.bills.create(fixture.bill('bill-1'));

    const updated = await fixture.bills.update(
      'bill-1',
      Object.assign(fixture.bill('wrong-id'), { amountDue: 40 }),
    );
    const created = await fixture.bills.batchCreate([
      fixture.bill('bill-2'),
      fixture.bill(),
    ]);

    assert.equal(updated.id, 'bill-1');
    assert.equal((await fixture.bills.getById('bill-1'))?.amountDue, 40);
    assert.deepEqual(
      created.map((item) => item.id),
      ['bill-2', 'generated-1'],
    );
  });

  it('commits transactional creates and updates together', async () => {
    const fixture = createFirestoreFixture();
    await fixture.bills.create(fixture.bill('bill-1'));

    await fixture.manager.run(async (transactionId) => {
      assert.equal(await fixture.bills.exists('bill-1', transactionId), true);
      assert.equal(await fixture.bills.getById('bill-2', transactionId), null);
      await fixture.bills.create(fixture.bill('bill-2'), transactionId);
      await fixture.bills.update(
        'bill-1',
        Object.assign(fixture.bill('bill-1'), { amountDue: 40 }),
        transactionId,
      );
    });

    assert.equal((await fixture.bills.getById('bill-1'))?.amountDue, 40);
    assert.equal(await fixture.bills.exists('bill-2'), true);
  });

  it('rolls back all staged repository writes when an operation fails', async () => {
    const fixture = createFirestoreFixture();
    await fixture.bills.create(fixture.bill('bill-1'));

    await assert.rejects(
      fixture.manager.run(async (transactionId) => {
        await fixture.bills.batchCreate(
          [fixture.bill('bill-2'), fixture.bill('bill-3')],
          transactionId,
        );
        await fixture.bills.update(
          'bill-1',
          Object.assign(fixture.bill('bill-1'), { amountDue: 40 }),
          transactionId,
        );
        throw new Error('journal write failed');
      }),
      /journal write failed/,
    );

    assert.equal((await fixture.bills.getById('bill-1'))?.amountDue, 80);
    assert.equal(await fixture.bills.exists('bill-2'), false);
    assert.equal(await fixture.bills.exists('bill-3'), false);
  });

  it('rolls back earlier writes when a create precondition fails', async () => {
    const fixture = createFirestoreFixture();
    await fixture.bills.create(fixture.bill('bill-1'));

    await assert.rejects(
      fixture.manager.run(async (transactionId) => {
        await fixture.bills.update(
          'bill-1',
          Object.assign(fixture.bill('bill-1'), { amountDue: 40 }),
          transactionId,
        );
        await fixture.bills.create(fixture.bill('bill-1'), transactionId);
      }),
      /already exists/,
    );

    assert.equal((await fixture.bills.getById('bill-1'))?.amountDue, 80);
  });

  it('rejects a new read after a transactional write', async () => {
    const fixture = createFirestoreFixture();

    await assert.rejects(
      fixture.manager.run(async (transactionId) => {
        await fixture.bills.create(fixture.bill('bill-1'), transactionId);
        await fixture.bills.getById('bill-2', transactionId);
      }),
      /reads must precede writes/,
    );
    assert.equal(fixture.documents.size, 0);
  });

  it('posts a bill payment once through the factory and repository transaction', async () => {
    const fixture = createFirestoreFixture();
    const suppliers = new FirestoreBaseRepository<Supplier>(fixture.db, 'suppliers');
    const charts = new FirestoreBaseRepository<ChartOfAccount>(fixture.db, 'charts');
    const journals = new FirestoreBaseRepository<JournalEntry>(fixture.db, 'journals');
    const lines = new FirestoreBaseRepository<JournalEntryLine>(
      fixture.db,
      'journalLines',
    );
    const payments = new FirestoreBaseRepository<Payment>(fixture.db, 'payments');

    await fixture.bills.create(
      Object.assign(fixture.bill('bill-1'), {
        supplierId: 'supplier-1',
        expenseCategoryId: 'office',
        description: 'Office supplies',
        amountPaid: 20,
        status: BillStatus.PARTIALLY_PAID,
      }),
    );
    await suppliers.create(Object.assign(new Supplier(), { id: 'supplier-1' }));
    await charts.batchCreate([
      Object.assign(new ChartOfAccount(), {
        id: 'bank-chart',
        name: 'Bank',
        type: ChartOfAccountType.ASSET,
        totalDebits: 0,
        totalCredits: 0,
      }),
      Object.assign(new ChartOfAccount(), {
        id: ACCOUNTS_PAYABLE_ACCOUNT_ID,
        name: 'Accounts payable',
        type: ChartOfAccountType.LIABILITY,
        totalDebits: 0,
        totalCredits: 100,
      }),
    ]);

    const mapper = {
      map: (request: PaymentRequestDTO) =>
        Object.assign(new Payment(), {
          amountPaid: request.amount,
          paymentMethod: request.paymentMethod,
          paymentDate: Timestamp.fromDate(new Date(request.paymentDate!)),
          chartOfAccountId: request.chartOfAccountId,
        }),
    } as unknown as IAutoMapper<PaymentRequestDTO, Payment>;
    const factory = new PaymentStrategyFactory(
      fixture.bills,
      suppliers,
      charts,
      journals,
      lines,
      payments,
      fixture.manager,
      mapper,
    );
    const request = Object.assign(new PaymentRequestDTO(), {
      idempotencyKey: 'request-1',
      billId: 'bill-1',
      bankAccountId: 'bank-1',
      chartOfAccountId: 'bank-chart',
      amount: 40,
      paymentMethod: PaymentMethod.CASH,
      paymentDate: '2026-10-17',
      paymentType: PaymentType.BILL,
    });

    assert.equal((await factory.getStrategy(request).processPayment()).type, 'Success');
    assert.equal((await factory.getStrategy(request).processPayment()).type, 'Success');
    request.amount = 50;
    assert.equal((await factory.getStrategy(request).processPayment()).type, 'Conflict');

    assert.equal((await fixture.bills.getById('bill-1'))?.amountDue, 40);
    assert.equal(fixture.documents.get('charts/bank-chart')?.totalCredits, 40);
    assert.equal(
      fixture.documents.get(`charts/${ACCOUNTS_PAYABLE_ACCOUNT_ID}`)?.totalDebits,
      40,
    );
    assert.equal(
      [...fixture.documents.keys()].filter((path) => path.startsWith('payments/')).length,
      1,
    );
    assert.equal(
      [...fixture.documents.keys()].filter((path) => path.startsWith('journals/')).length,
      1,
    );
    assert.equal(
      [...fixture.documents.keys()].filter((path) => path.startsWith('journalLines/'))
        .length,
      2,
    );
  });
});

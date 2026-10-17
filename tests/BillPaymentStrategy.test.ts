import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import BillPaymentStrategy from '../src/application/strategies/implementations/BillPaymentStrategy';
import { ACCOUNTS_PAYABLE_ACCOUNT_ID, Collections } from '../src/application/constants';
import PaymentRequestDTO from '../src/application/dtos/PaymentRequestDTO';
import IAutoMapper from '../src/application/services/IAutoMapper';
import Bill from '../src/domain/entities/Bill';
import ChartOfAccount from '../src/domain/entities/ChartOfAccount';
import JournalEntry from '../src/domain/entities/JournalEntry';
import JournalEntryLine from '../src/domain/entities/JournalEntryLine';
import Payment from '../src/domain/entities/Payment';
import BillStatus from '../src/domain/enums/BillStatus';
import ChartOfAccountType from '../src/domain/enums/ChartOfAccountType';
import JournalType from '../src/domain/enums/JournalType';
import PaymentType from '../src/domain/enums/PaymentType';
import IBillsRepository from '../src/domain/interfaces/IBillsRepository';
import IChartOfAccountsRepository from '../src/domain/interfaces/IChartOfAccountsRepository';
import IJournalEntriesRepository from '../src/domain/interfaces/IJournalEntriesRepository';
import IJournalEntryLinesRepository from '../src/domain/interfaces/IJournalEntryLinesRepository';
import IPaymentsRepository from '../src/domain/interfaces/IPaymentsRepository';
import ISuppliersRepository from '../src/domain/interfaces/ISuppliersRepository';
import ITransactionManager from '../src/domain/services/ITransactionManager';

function createFixture(amountPaid = 40) {
  const date = Timestamp.fromDate(new Date('2026-10-17T00:00:00Z'));
  const dto = Object.assign(new PaymentRequestDTO(), {
    billId: 'bill-1',
    chartOfAccountId: 'bank-chart',
    amount: amountPaid,
  });
  const payment = Object.assign(new Payment(), {
    amountPaid,
    chartOfAccountId: 'bank-chart',
    paymentDate: date,
    paymentType: PaymentType.INCOME,
    feeId: 'old-fee',
    customerId: 'old-customer',
    categoryId: 'old-category',
  });
  const bill = Object.assign(new Bill(), {
    id: 'bill-1',
    supplierId: 'supplier-1',
    description: 'Office supplies',
    expenseCategoryId: 'office',
    amountPaid: 20,
    amountDue: 80,
    status: BillStatus.PARTIALLY_PAID,
  });
  let bankChart: ChartOfAccount | null = Object.assign(new ChartOfAccount(), {
    id: 'bank-chart',
    name: 'Current account',
    type: ChartOfAccountType.ASSET,
    totalDebits: 7,
    totalCredits: 12,
  });
  let apChart: ChartOfAccount | null = Object.assign(new ChartOfAccount(), {
    id: ACCOUNTS_PAYABLE_ACCOUNT_ID,
    name: 'Accounts payable',
    type: ChartOfAccountType.LIABILITY,
    totalDebits: 3,
    totalCredits: 100,
  });
  let billFound: Bill | null = bill;
  let supplierExists = true;
  const transactionId = 'tx-123';
  const run = mock.fn(async <T>(operation: (id: string) => Promise<T>) =>
    operation(transactionId),
  );
  const map = mock.fn((_source: PaymentRequestDTO) => payment);
  const getBill = mock.fn(async (_id: string, _tx?: string) => billFound);
  const getChart = mock.fn(async (id: string, _tx?: string) =>
    id === 'bank-chart' ? bankChart : id === ACCOUNTS_PAYABLE_ACCOUNT_ID ? apChart : null,
  );
  const exists = mock.fn(async (_id: string, _tx?: string) => supplierExists);
  const createJournal = mock.fn(async (entry: JournalEntry, _tx?: string) =>
    Object.assign(new JournalEntry(), entry, { id: 'journal-1' }),
  );
  const batchCreate = mock.fn(async (lines: JournalEntryLine[], _tx?: string) => lines);
  const createPayment = mock.fn(async (entity: Payment, _tx?: string) => entity);
  const updateBill = mock.fn(async (_id: string, entity: Bill, _tx?: string) => entity);
  const updateChart = mock.fn(
    async (_id: string, entity: ChartOfAccount, _tx?: string) => entity,
  );
  const strategy = new BillPaymentStrategy(
    dto,
    { getById: getBill, update: updateBill } as unknown as IBillsRepository,
    { exists } as unknown as ISuppliersRepository,
    { getById: getChart, update: updateChart } as unknown as IChartOfAccountsRepository,
    { create: createJournal } as unknown as IJournalEntriesRepository,
    { batchCreate } as unknown as IJournalEntryLinesRepository,
    { create: createPayment } as unknown as IPaymentsRepository,
    { run } as unknown as ITransactionManager,
    { map } as unknown as IAutoMapper<PaymentRequestDTO, Payment>,
  );
  const noWrites = () => {
    assert.equal(createJournal.mock.callCount(), 0);
    assert.equal(batchCreate.mock.callCount(), 0);
    assert.equal(createPayment.mock.callCount(), 0);
    assert.equal(updateBill.mock.callCount(), 0);
    assert.equal(updateChart.mock.callCount(), 0);
  };
  return {
    strategy,
    dto,
    payment,
    bill,
    date,
    transactionId,
    run,
    map,
    getBill,
    getChart,
    exists,
    createJournal,
    batchCreate,
    createPayment,
    updateBill,
    updateChart,
    noWrites,
    setBill(value: Bill | null) {
      billFound = value;
    },
    setBank(value: ChartOfAccount | null) {
      bankChart = value;
    },
    setAp(value: ChartOfAccount | null) {
      apChart = value;
    },
    setSupplierExists(value: boolean) {
      supplierExists = value;
    },
  };
}

describe('BillPaymentStrategy', () => {
  it('reads the bill and accounts within one transaction', async () => {
    const fixture = createFixture();
    const result = await fixture.strategy.processPayment();

    assert.equal(result.type, 'Success');
    assert.equal(fixture.run.mock.callCount(), 1);
    assert.deepEqual(fixture.getBill.mock.calls[0].arguments, [
      'bill-1',
      fixture.transactionId,
    ]);
    assert.deepEqual(
      fixture.getChart.mock.calls.map((call) => call.arguments),
      [
        ['bank-chart', fixture.transactionId],
        [ACCOUNTS_PAYABLE_ACCOUNT_ID, fixture.transactionId],
      ],
    );
    assert.deepEqual(fixture.exists.mock.calls[0].arguments, [
      'supplier-1',
      fixture.transactionId,
    ]);
    assert.strictEqual(fixture.map.mock.calls[0].arguments[0], fixture.dto);
  });

  it('creates a balanced accounts payable debit and bank credit', async () => {
    const fixture = createFixture();
    await fixture.strategy.processPayment();

    const journal = fixture.createJournal.mock.calls[0];
    assert.equal(journal.arguments[1], fixture.transactionId);
    assert.equal(journal.arguments[0].referenceId, 'bill-1');
    assert.equal(journal.arguments[0].referenceCollection, Collections.BILLS);
    assert.strictEqual(journal.arguments[0].date, fixture.date);
    const [lines, tx] = fixture.batchCreate.mock.calls[0].arguments;
    assert.equal(tx, fixture.transactionId);
    assert.equal(lines.length, 2);
    assert.deepEqual(
      lines.map((line) => ({
        account: line.chartOfAccountId,
        type: line.type,
        debit: line.debit,
        credit: line.credit,
        journal: line.journalEntryId,
      })),
      [
        {
          account: ACCOUNTS_PAYABLE_ACCOUNT_ID,
          type: JournalType.DEBIT,
          debit: 40,
          credit: 0,
          journal: 'journal-1',
        },
        {
          account: 'bank-chart',
          type: JournalType.CREDIT,
          debit: 0,
          credit: 40,
          journal: 'journal-1',
        },
      ],
    );
    assert.equal(
      lines.reduce((sum, line) => sum + line.debit, 0),
      lines.reduce((sum, line) => sum + line.credit, 0),
    );
  });

  it('records a partial payment and updates the bill and account totals', async () => {
    const fixture = createFixture();
    assert.equal((await fixture.strategy.processPayment()).type, 'Success');

    assert.strictEqual(fixture.createPayment.mock.calls[0].arguments[0], fixture.payment);
    assert.equal(fixture.createPayment.mock.calls[0].arguments[1], fixture.transactionId);
    assert.deepEqual(
      {
        type: fixture.payment.paymentType,
        bill: fixture.payment.billId,
        fee: fixture.payment.feeId,
        customer: fixture.payment.customerId,
        category: fixture.payment.categoryId,
        remaining: fixture.payment.remainingBalance,
        journal: fixture.payment.journalEntryId,
      },
      {
        type: PaymentType.BILL,
        bill: 'bill-1',
        fee: null,
        customer: 'supplier-1',
        category: 'office',
        remaining: 40,
        journal: 'journal-1',
      },
    );
    assert.deepEqual(fixture.updateBill.mock.calls[0].arguments, [
      'bill-1',
      fixture.bill,
      fixture.transactionId,
    ]);
    assert.deepEqual(
      {
        paid: fixture.bill.amountPaid,
        due: fixture.bill.amountDue,
        status: fixture.bill.status,
      },
      { paid: 60, due: 40, status: BillStatus.PARTIALLY_PAID },
    );
    assert.deepEqual(
      fixture.updateChart.mock.calls.map((call) => [
        call.arguments[0],
        call.arguments[2],
      ]),
      [
        [ACCOUNTS_PAYABLE_ACCOUNT_ID, fixture.transactionId],
        ['bank-chart', fixture.transactionId],
      ],
    );
    assert.equal(fixture.updateChart.mock.calls[0].arguments[1].totalDebits, 43);
    assert.equal(fixture.updateChart.mock.calls[1].arguments[1].totalCredits, 52);
  });

  it('marks a bill paid when payment exactly equals the remaining amount', async () => {
    const fixture = createFixture(80);
    assert.equal((await fixture.strategy.processPayment()).type, 'Success');
    assert.deepEqual(
      {
        paid: fixture.bill.amountPaid,
        due: fixture.bill.amountDue,
        status: fixture.bill.status,
      },
      { paid: 100, due: 0, status: BillStatus.PAID },
    );
    assert.equal(fixture.payment.remainingBalance, 0);
  });

  it('returns not found for a missing bill without writing', async () => {
    const fixture = createFixture();
    fixture.setBill(null);
    const result = await fixture.strategy.processPayment();
    assert.equal(result.type, 'Not Found');
    assert.equal(result.message, 'Bill not found.');
    assert.equal(fixture.getChart.mock.callCount(), 0);
    fixture.noWrites();
  });

  for (const [status, message] of [
    [BillStatus.PAID, 'This bill has already been fully paid.'],
    [BillStatus.CANCELLED, 'Cannot record payment for a cancelled bill.'],
  ] as const) {
    it(`rejects a ${status.toLowerCase()} bill without writing`, async () => {
      const fixture = createFixture();
      fixture.bill.status = status;
      const result = await fixture.strategy.processPayment();
      assert.equal(result.type, 'Validation');
      assert.equal(result.message, message);
      assert.equal(fixture.getChart.mock.callCount(), 0);
      fixture.noWrites();
    });
  }

  it('rejects overpayment before loading accounts or writing', async () => {
    const fixture = createFixture(81);
    const result = await fixture.strategy.processPayment();
    assert.equal(result.type, 'Validation');
    assert.match(result.message, /cannot exceed the amount due \(80\)/);
    assert.equal(fixture.getChart.mock.callCount(), 0);
    fixture.noWrites();
  });

  it('requires an existing bank chart of account', async () => {
    const fixture = createFixture();
    fixture.setBank(null);
    const result = await fixture.strategy.processPayment();
    assert.equal(result.type, 'Not Found');
    assert.match(result.message, /Bank\/cash chart/);
    assert.equal(fixture.exists.mock.callCount(), 0);
    fixture.noWrites();
  });

  it('requires the selected bank chart to be an asset', async () => {
    const fixture = createFixture();
    fixture.setBank(
      Object.assign(new ChartOfAccount(), {
        id: 'bank-chart',
        type: ChartOfAccountType.LIABILITY,
      }),
    );
    const result = await fixture.strategy.processPayment();
    assert.equal(result.type, 'Validation');
    assert.match(result.message, /not an asset/);
    assert.equal(fixture.exists.mock.callCount(), 0);
    fixture.noWrites();
  });

  it('requires the accounts payable chart', async () => {
    const fixture = createFixture();
    fixture.setAp(null);
    const result = await fixture.strategy.processPayment();
    assert.equal(result.type, 'Validation');
    assert.match(result.message, /Accounts payable/);
    assert.equal(fixture.exists.mock.callCount(), 0);
    fixture.noWrites();
  });

  it('requires the bill supplier', async () => {
    const fixture = createFixture();
    fixture.setSupplierExists(false);
    const result = await fixture.strategy.processPayment();
    assert.equal(result.type, 'Not Found');
    assert.equal(result.message, 'Supplier not found.');
    fixture.noWrites();
  });

  it('propagates repository failures through the transaction boundary', async () => {
    const fixture = createFixture();
    fixture.createJournal.mock.mockImplementation(async () => {
      throw new Error('journal unavailable');
    });
    await assert.rejects(fixture.strategy.processPayment(), /journal unavailable/);
    assert.equal(fixture.createPayment.mock.callCount(), 0);
    assert.equal(fixture.updateBill.mock.callCount(), 0);
  });
});

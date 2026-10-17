import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validate } from 'class-validator';
import BillPaymentWriteDTO from '../src/application/dtos/BillPaymentWriteDTO';
import PaymentRequestDTO from '../src/application/dtos/PaymentRequestDTO';
import Result from '../src/application/types/Result';
import PaymentMethod from '../src/domain/enums/PaymentMethod';
import PaymentType from '../src/domain/enums/PaymentType';

const billWrite = () =>
  Object.assign(new BillPaymentWriteDTO(), {
    amount: 25,
    paymentDate: '2026-10-17',
    paymentMethod: PaymentMethod.CASH,
    bankAccountId: 'bank-1',
    idempotencyKey: 'request-1',
  });
const paymentRequest = () =>
  Object.assign(new PaymentRequestDTO(), {
    amount: 25,
    paymentDate: '2026-10-17',
    paymentMethod: PaymentMethod.CASH,
    chartOfAccountId: 'bank-chart',
    paymentType: PaymentType.BILL,
    billId: 'bill-1',
    idempotencyKey: 'request-1',
  });

describe('BillPaymentWriteDTO validation', () => {
  it('accepts a valid payment with optional notes', async () => {
    assert.deepEqual(
      await validate(Object.assign(billWrite(), { notes: 'Settled' })),
      [],
    );
  });

  for (const [field, value] of [
    ['amount', undefined],
    ['amount', 0],
    ['amount', -1],
    ['amount', '25'],
    ['paymentDate', undefined],
    ['paymentDate', 'not-a-date'],
    ['paymentMethod', undefined],
    ['paymentMethod', 3],
    ['bankAccountId', undefined],
    ['bankAccountId', 3],
    ['idempotencyKey', undefined],
    ['idempotencyKey', ''],
    ['idempotencyKey', 'x'.repeat(129)],
    ['notes', 3],
  ] as const) {
    it(`rejects ${field}=${String(value)}`, async () => {
      const errors = await validate(Object.assign(billWrite(), { [field]: value }));
      assert.ok(errors.some((error) => error.property === field));
    });
  }
});

describe('PaymentRequestDTO validation', () => {
  it('accepts a bill payment', async () => {
    assert.deepEqual(await validate(paymentRequest()), []);
  });

  it('requires billId for a bill payment', async () => {
    const errors = await validate(Object.assign(paymentRequest(), { billId: undefined }));
    assert.ok(errors.some((error) => error.property === 'billId'));
  });

  it('requires a category for a non-fee income or expense', async () => {
    for (const type of [PaymentType.INCOME, PaymentType.EXPENSE]) {
      const errors = await validate(
        Object.assign(paymentRequest(), { paymentType: type, billId: undefined }),
      );
      assert.ok(errors.some((error) => error.property === 'categoryId'));
    }
  });

  it('accepts a fee payment without a payment type or category', async () => {
    assert.deepEqual(
      await validate(
        Object.assign(paymentRequest(), {
          billId: undefined,
          feeId: 'fee-1',
          paymentType: undefined,
        }),
      ),
      [],
    );
  });

  for (const [field, value] of [
    ['amount', 0],
    ['amount', -1],
    ['amount', '25'],
    ['paymentDate', 'bad-date'],
    ['chartOfAccountId', undefined],
    ['paymentMethod', 'cheque'],
    ['paymentType', 'refund'],
    ['externalReference', 5],
    ['comments', 5],
    ['files', 'attachment'],
    ['idempotencyKey', undefined],
    ['idempotencyKey', 'x'.repeat(129)],
  ] as const) {
    it(`rejects ${field}=${String(value)}`, async () => {
      const errors = await validate(Object.assign(paymentRequest(), { [field]: value }));
      assert.ok(errors.some((error) => error.property === field));
    });
  }
});

describe('Result', () => {
  it('calculates page count for a paginated success', () => {
    const result = Result.success(['payment'], 21, 10);
    assert.equal(result.success, true);
    assert.equal(result.type, 'Success');
    assert.deepEqual(result.data, ['payment']);
    assert.equal(result.totalCount, 21);
    assert.equal(result.pageSize, 10);
    assert.equal(result.totalPages, 3);
  });

  it('preserves success messages and omits pagination when it is not supplied', () => {
    const result = Result.successWithMessage('recorded', { id: 'payment-1' });
    assert.equal(result.message, 'recorded');
    assert.deepEqual(result.data, { id: 'payment-1' });
    assert.equal(result.totalPages, null);
  });

  it('formats not-found, unauthorized and conflict results', () => {
    assert.equal(Result.notFound().message, 'Entity not found');
    assert.equal(Result.notFound('Bill').message, 'Bill not found');
    assert.equal(Result.notFound('Bill not found.').message, 'Bill not found.');
    assert.equal(Result.unauthorized().type, 'Unauthorized');
    assert.equal(Result.conflict().type, 'Conflict');
    assert.equal(Result.failed('Validation', 'Invalid amount').success, false);
  });
});

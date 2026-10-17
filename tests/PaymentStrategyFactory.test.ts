import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import PaymentRequestDTO from '../src/application/dtos/PaymentRequestDTO';
import PaymentStrategyFactory from '../src/application/strategies/factory/PaymentStrategyFactory';
import BillPaymentStrategy from '../src/application/strategies/implementations/BillPaymentStrategy';
import PaymentType from '../src/domain/enums/PaymentType';

function createFactory() {
  // Selection is tested here; the strategy's dependencies are exercised in its own suite.
  const dependency = {} as never;
  return new PaymentStrategyFactory(
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
    dependency,
  );
}

describe('PaymentStrategyFactory', () => {
  it('creates a bill strategy for a bill payment request', () => {
    const request = Object.assign(new PaymentRequestDTO(), {
      paymentType: PaymentType.BILL,
      billId: 'bill-1',
    });

    assert.ok(createFactory().getStrategy(request) instanceof BillPaymentStrategy);
  });

  it('rejects an unsupported payment type or a bill request without a bill ID', () => {
    for (const request of [
      Object.assign(new PaymentRequestDTO(), {
        paymentType: PaymentType.INCOME,
        billId: 'bill-1',
      }),
      Object.assign(new PaymentRequestDTO(), { paymentType: PaymentType.BILL }),
    ]) {
      assert.throws(() => createFactory().getStrategy(request), /Only bill payments/);
    }
  });
});

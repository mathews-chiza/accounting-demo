import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  RecordBillPaymentCommand,
  RecordBillPaymentCommandHandler,
} from '../src/application/commands/RecordBillPaymentCommand';
import BillPaymentWriteDTO from '../src/application/dtos/BillPaymentWriteDTO';
import PaymentRequestDTO from '../src/application/dtos/PaymentRequestDTO';
import IAuthenticatedUserService from '../src/application/services/IAuthenticatedUserService';
import IAutoMapper from '../src/application/services/IAutoMapper';
import { IPaymentStrategyFactory } from '../src/application/strategies/factory/IPaymentStrategyFactory';
import Result from '../src/application/types/Result';
import BankAccount from '../src/domain/entities/BankAccount';
import IBankAccountsRepository from '../src/domain/interfaces/IBankAccountsRepository';

function createFixture(
  admin = false,
  accountant = false,
  account: BankAccount | null = { chartOfAccountId: 'bank-chart' } as BankAccount,
) {
  const dto = Object.assign(new BillPaymentWriteDTO(), {
    amount: 25,
    bankAccountId: 'bank-1',
    idempotencyKey: 'request-1',
    paymentDate: '2026-10-17',
    paymentMethod: 'Cash',
  });
  const mapped = { amount: 25 } as PaymentRequestDTO;
  const outcome = Result.successWithMessage('recorded');
  const isAdmin = mock.fn(() => admin);
  const isAccountant = mock.fn(() => accountant);
  const getById = mock.fn(async (_id: string) => account);
  const map = mock.fn((_source: BillPaymentWriteDTO) => mapped);
  const processPayment = mock.fn(async () => outcome);
  const getStrategy = mock.fn((_request: PaymentRequestDTO) => ({ processPayment }));
  const handler = new RecordBillPaymentCommandHandler(
    { isAdmin, isAccountant } as unknown as IAuthenticatedUserService,
    { getById } as unknown as IBankAccountsRepository,
    { getStrategy } as unknown as IPaymentStrategyFactory,
    { map } as unknown as IAutoMapper<BillPaymentWriteDTO, PaymentRequestDTO>,
  );
  return {
    handler,
    command: new RecordBillPaymentCommand('bill-1', dto),
    mapped,
    outcome,
    isAdmin,
    isAccountant,
    getById,
    map,
    getStrategy,
    processPayment,
  };
}

describe('RecordBillPaymentCommandHandler', () => {
  it('rejects users without accounting roles before reading or writing data', async () => {
    const fixture = createFixture();
    const result = await fixture.handler.handle(fixture.command);
    assert.equal(result.type, 'Unauthorized');
    assert.equal(fixture.getById.mock.callCount(), 0);
    assert.equal(fixture.map.mock.callCount(), 0);
    assert.equal(fixture.getStrategy.mock.callCount(), 0);
  });

  for (const [role, admin, accountant] of [
    ['admin', true, false],
    ['accountant', false, true],
  ] as const) {
    it(`allows an ${role} and passes the bill and bank chart to the strategy`, async () => {
      const fixture = createFixture(admin, accountant);
      const result = await fixture.handler.handle(fixture.command);
      assert.strictEqual(result, fixture.outcome);
      assert.deepEqual(fixture.getById.mock.calls[0].arguments, ['bank-1']);
      assert.strictEqual(fixture.map.mock.calls[0].arguments[0], fixture.command.dto);
      assert.strictEqual(fixture.getStrategy.mock.calls[0].arguments[0], fixture.mapped);
      assert.equal(fixture.mapped.billId, 'bill-1');
      assert.equal(fixture.mapped.chartOfAccountId, 'bank-chart');
      assert.equal(fixture.mapped.bankAccountId, 'bank-1');
      assert.equal(fixture.mapped.idempotencyKey, 'request-1');
      assert.equal(fixture.mapped.paymentType, 'Bill');
      assert.equal(fixture.processPayment.mock.callCount(), 1);
    });
  }

  it('stops when the requested bank account is missing', async () => {
    const fixture = createFixture(true, false, null);
    const result = await fixture.handler.handle(fixture.command);
    assert.equal(result.type, 'Not Found');
    assert.equal(result.message, 'Bank/Cash account not found.');
    assert.equal(fixture.map.mock.callCount(), 0);
    assert.equal(fixture.processPayment.mock.callCount(), 0);
  });

  it('propagates errors from the payment strategy', async () => {
    const fixture = createFixture(true);
    fixture.processPayment.mock.mockImplementation(async () => {
      throw new Error('transaction failed');
    });
    await assert.rejects(fixture.handler.handle(fixture.command), /transaction failed/);
  });
});

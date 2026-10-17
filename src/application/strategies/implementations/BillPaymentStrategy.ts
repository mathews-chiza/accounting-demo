import Bill from '../../../domain/entities/Bill';
import ChartOfAccount from '../../../domain/entities/ChartOfAccount';
import Payment from '../../../domain/entities/Payment';
import BillStatus from '../../../domain/enums/BillStatus';
import ChartOfAccountType from '../../../domain/enums/ChartOfAccountType';
import JournalType from '../../../domain/enums/JournalType';
import PaymentType from '../../../domain/enums/PaymentType';
import IBillsRepository from '../../../domain/interfaces/IBillsRepository';
import IChartOfAccountsRepository from '../../../domain/interfaces/IChartOfAccountsRepository';
import IJournalEntriesRepository from '../../../domain/interfaces/IJournalEntriesRepository';
import IJournalEntryLinesRepository from '../../../domain/interfaces/IJournalEntryLinesRepository';
import IPaymentsRepository from '../../../domain/interfaces/IPaymentsRepository';
import ISuppliersRepository from '../../../domain/interfaces/ISuppliersRepository';
import ITransactionManager from '../../../domain/services/ITransactionManager';
import { ACCOUNTS_PAYABLE_ACCOUNT_ID, Collections } from '../../constants';
import PaymentRequestDTO from '../../dtos/PaymentRequestDTO';
import IAutoMapper from '../../services/IAutoMapper';
import Result from '../../types/Result';
import IPaymentStrategy from '../IPaymentStrategy';
import { createHash } from 'node:crypto';

export default class BillPaymentStrategy implements IPaymentStrategy {
  constructor(
    private readonly dto: PaymentRequestDTO,
    private readonly billsRepository: IBillsRepository,
    private readonly suppliersRepository: ISuppliersRepository,
    private readonly chartOfAccountsRepository: IChartOfAccountsRepository,
    private readonly journalEntriesRepository: IJournalEntriesRepository,
    private readonly journalEntryLinesRepository: IJournalEntryLinesRepository,
    private readonly paymentsRepository: IPaymentsRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly mapper: IAutoMapper<PaymentRequestDTO, Payment>,
  ) {}

  async processPayment(): Promise<Result> {
    const key = this.dto.idempotencyKey?.trim();
    if (!key || key.length > 128) {
      return Result.failed('Validation', 'A valid idempotency key is required.');
    }

    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          this.dto.billId,
          this.dto.amount,
          this.dto.paymentDate,
          this.dto.paymentMethod,
          this.dto.bankAccountId,
          this.dto.chartOfAccountId,
          this.dto.comments,
          this.dto.externalReference,
          this.dto.attachmentUrl,
        ]),
      )
      .digest('hex');
    const paymentId = `bill_payment_${createHash('sha256').update(key).digest('hex')}`;

    return this.transactionManager.run(async (transactionId) => {
      const existing = await this.paymentsRepository.getById(paymentId, transactionId);
      if (existing) {
        return existing.idempotencyKey === key &&
          existing.idempotencyFingerprint === fingerprint
          ? Result.success()
          : Result.conflict('Idempotency key was already used for a different payment.');
      }

      const payment = this.mapper.map(this.dto);
      if (!Number.isFinite(payment.amountPaid) || payment.amountPaid <= 0) {
        return Result.failed('Validation', 'Payment amount must be positive.');
      }
      payment.id = paymentId;
      payment.idempotencyKey = key;
      payment.idempotencyFingerprint = fingerprint;

      const bill = await this.billsRepository.getById(this.dto.billId!, transactionId);
      if (!bill) {
        return Result.notFound('Bill not found.');
      }

      if (bill.status === BillStatus.PAID) {
        return Result.failed('Validation', 'This bill has already been fully paid.');
      }

      if (bill.status === BillStatus.CANCELLED) {
        return Result.failed('Validation', 'Cannot record payment for a cancelled bill.');
      }

      if (payment.amountPaid > bill.amountDue) {
        return Result.failed(
          'Validation',
          `Payment amount cannot exceed the amount due (${bill.amountDue}).`,
        );
      }

      const [bankChart, apChart] = await Promise.all([
        this.chartOfAccountsRepository.getById(payment.chartOfAccountId, transactionId),
        this.chartOfAccountsRepository.getById(
          ACCOUNTS_PAYABLE_ACCOUNT_ID,
          transactionId,
        ),
      ]);

      if (!bankChart) {
        return Result.notFound('Bank/cash chart of account was not found');
      }

      if (bankChart.type !== ChartOfAccountType.ASSET) {
        return Result.failed(
          'Validation',
          'Selected chart of account is not an asset account',
        );
      }

      if (!apChart) {
        return Result.failed(
          'Validation',
          'Accounts payable chart of account was not found. Please contact administrator.',
        );
      }

      // Load supplier to copy into payment customer
      const supplierExists = await this.suppliersRepository.exists(
        bill.supplierId,
        transactionId,
      );

      if (!supplierExists) {
        return Result.notFound('Supplier not found.');
      }

      return this.processBillPayment(payment, bill, bankChart, apChart, transactionId);
    });
  }

  private async processBillPayment(
    payment: Payment,
    bill: Bill,
    bankChart: ChartOfAccount,
    apChart: ChartOfAccount,
    transactionId: string,
  ): Promise<Result> {
    payment.paymentType = PaymentType.BILL;
    payment.billId = bill.id;
    payment.feeId = null;
    payment.customerId = bill.supplierId;
    payment.categoryId = bill.expenseCategoryId;
    payment.remainingBalance = bill.amountDue - payment.amountPaid;

    // Create journal entry: Debit AP, Credit bank
    const journalEntry = await this.journalEntriesRepository.create(
      {
        id: '',
        referenceId: bill.id,
        referenceCollection: Collections.BILLS,
        description: `Payment for bill: ${bill.description}`,
        date: payment.paymentDate,
      },
      transactionId,
    );

    await this.journalEntryLinesRepository.batchCreate(
      [
        {
          id: '',
          journalEntryId: journalEntry.id,
          chartOfAccountId: apChart.id,
          type: JournalType.DEBIT,
          debit: payment.amountPaid,
          credit: 0,
          description: `AP payment for bill: ${bill.description}`,
        },
        {
          id: '',
          journalEntryId: journalEntry.id,
          chartOfAccountId: bankChart.id,
          type: JournalType.CREDIT,
          debit: 0,
          credit: payment.amountPaid,
          description: `Payment from ${bankChart.name}`,
        },
      ],
      transactionId,
    );

    payment.journalEntryId = journalEntry.id;

    apChart.totalDebits += payment.amountPaid;
    bankChart.totalCredits += payment.amountPaid;

    // Update bill amounts and status
    bill.amountPaid += payment.amountPaid;
    bill.amountDue -= payment.amountPaid;
    bill.status = bill.amountDue === 0 ? BillStatus.PAID : BillStatus.PARTIALLY_PAID;

    await this.paymentsRepository.create(payment, transactionId);
    await this.billsRepository.update(bill.id, bill, transactionId);
    await this.chartOfAccountsRepository.update(apChart.id, apChart, transactionId);
    await this.chartOfAccountsRepository.update(bankChart.id, bankChart, transactionId);

    return Result.success();
  }
}

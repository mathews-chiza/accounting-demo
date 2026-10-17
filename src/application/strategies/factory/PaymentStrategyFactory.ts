import Payment from '../../../domain/entities/Payment';
import PaymentType from '../../../domain/enums/PaymentType';
import IBillsRepository from '../../../domain/interfaces/IBillsRepository';
import IChartOfAccountsRepository from '../../../domain/interfaces/IChartOfAccountsRepository';
import IJournalEntriesRepository from '../../../domain/interfaces/IJournalEntriesRepository';
import IJournalEntryLinesRepository from '../../../domain/interfaces/IJournalEntryLinesRepository';
import IPaymentsRepository from '../../../domain/interfaces/IPaymentsRepository';
import ISuppliersRepository from '../../../domain/interfaces/ISuppliersRepository';
import ITransactionManager from '../../../domain/services/ITransactionManager';
import PaymentRequestDTO from '../../dtos/PaymentRequestDTO';
import IAutoMapper from '../../services/IAutoMapper';
import IPaymentStrategy from '../IPaymentStrategy';
import BillPaymentStrategy from '../implementations/BillPaymentStrategy';
import { IPaymentStrategyFactory } from './IPaymentStrategyFactory';

export default class PaymentStrategyFactory implements IPaymentStrategyFactory {
  constructor(
    private readonly billsRepository: IBillsRepository,
    private readonly suppliersRepository: ISuppliersRepository,
    private readonly chartOfAccountsRepository: IChartOfAccountsRepository,
    private readonly journalEntriesRepository: IJournalEntriesRepository,
    private readonly journalEntryLinesRepository: IJournalEntryLinesRepository,
    private readonly paymentsRepository: IPaymentsRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly mapper: IAutoMapper<PaymentRequestDTO, Payment>,
  ) {}

  getStrategy(request: PaymentRequestDTO): IPaymentStrategy {
    // Only bill payments are supported for demonstration purposes
    if (request.paymentType !== PaymentType.BILL || !request.billId) {
      throw new Error('Only bill payments are supported.');
    }

    return new BillPaymentStrategy(
      request,
      this.billsRepository,
      this.suppliersRepository,
      this.chartOfAccountsRepository,
      this.journalEntriesRepository,
      this.journalEntryLinesRepository,
      this.paymentsRepository,
      this.transactionManager,
      this.mapper,
    );
  }
}

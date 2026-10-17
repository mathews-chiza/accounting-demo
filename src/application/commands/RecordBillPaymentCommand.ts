import IBankAccountsRepository from '../../domain/interfaces/IBankAccountsRepository';
import BillPaymentWriteDTO from '../dtos/BillPaymentWriteDTO';
import PaymentRequestDTO from '../dtos/PaymentRequestDTO';
import IAuthenticatedUserService from '../services/IAuthenticatedUserService';
import IAutoMapper from '../services/IAutoMapper';
import { IPaymentStrategyFactory } from '../strategies/factory/IPaymentStrategyFactory';
import Result from '../types/Result';
import PaymentType from '../../domain/enums/PaymentType';

export class RecordBillPaymentCommand {
  constructor(
    public readonly billId: string,
    public readonly dto: BillPaymentWriteDTO,
  ) {}
}

export class RecordBillPaymentCommandHandler {
  constructor(
    private readonly authService: IAuthenticatedUserService,
    private readonly bankAccountsRepository: IBankAccountsRepository,
    private readonly strategy: IPaymentStrategyFactory,
    private readonly mapper: IAutoMapper<BillPaymentWriteDTO, PaymentRequestDTO>,
  ) {}

  async handle(command: RecordBillPaymentCommand): Promise<Result> {
    if (!this.authService.isAdmin() && !this.authService.isAccountant()) {
      return Result.unauthorized('You do not have permission to record bill payments.');
    }

    // Look up bank account to get chartOfAccountId
    const bankAccount = await this.bankAccountsRepository.getById(
      command.dto.bankAccountId,
    );
    if (!bankAccount) {
      return Result.notFound('Bank/Cash account not found.');
    }

    // Construct PaymentRequestDTO for the strategy
    const paymentRequest: PaymentRequestDTO = this.mapper.map(command.dto);
    paymentRequest.billId = command.billId;
    paymentRequest.bankAccountId = command.dto.bankAccountId;
    paymentRequest.idempotencyKey = command.dto.idempotencyKey;
    paymentRequest.chartOfAccountId = bankAccount.chartOfAccountId;
    paymentRequest.paymentType = PaymentType.BILL;

    const strategy = this.strategy.getStrategy(paymentRequest);

    return strategy.processPayment();
  }
}

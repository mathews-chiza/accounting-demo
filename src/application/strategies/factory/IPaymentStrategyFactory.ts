import PaymentRequestDTO from "../../dtos/PaymentRequestDTO";
import IPaymentStrategy from "../IPaymentStrategy";

export interface IPaymentStrategyFactory {
  getStrategy(request: PaymentRequestDTO): IPaymentStrategy;
}

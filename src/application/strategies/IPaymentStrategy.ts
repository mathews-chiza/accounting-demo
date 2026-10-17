import Result from "../types/Result";

export default interface IPaymentStrategy {
  processPayment(): Promise<Result>;
}

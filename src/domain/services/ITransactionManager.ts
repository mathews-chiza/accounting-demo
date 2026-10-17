export default interface ITransactionManager {
  run<T>(operation: (transactionId: string) => Promise<T>): Promise<T>;
}

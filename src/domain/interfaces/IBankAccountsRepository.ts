import BankAccount from "../entities/BankAccount";
import IBaseRepository from "./base/IBaseRepository";

export default interface IBankAccountsRepository extends IBaseRepository<BankAccount> {}
  
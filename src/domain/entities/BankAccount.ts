import BankAccountType from "../enums/BankAccountType";
import BaseEntity from "./base/BaseEntity";

export default class BankAccount extends BaseEntity
{
  name!: string;
  type!: BankAccountType;
  bankName?: string;
  accountNumber?: string;
  openingBalance!: number;
  openingBalanceDate!: string;
  chartOfAccountId!: string;
}

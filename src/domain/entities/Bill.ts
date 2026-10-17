import { Timestamp } from "firebase-admin/firestore";
import BaseEntity from "./base/BaseEntity";
import BillStatus from "../enums/BillStatus";

export default class Bill extends BaseEntity
{
  supplierId!: string;
  description!: string;
  invoiceNumber!: string;
  amount!: number;
  amountPaid!: number;
  amountDue!: number;
  billDate!: Timestamp;
  dueDate!: Timestamp;
  expenseCategoryId!: string;
  notes?: string;
  attachments!: string[];
  status!: BillStatus;
  chartOfAccountId!: string;
  journalEntryId?: string;
}

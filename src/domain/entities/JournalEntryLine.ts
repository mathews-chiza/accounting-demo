import BaseEntity from "./base/BaseEntity";
import JournalType from "../enums/JournalType";

export default class JournalEntryLine extends BaseEntity {
  type!: JournalType;
  debit!: number;
  credit!: number;
  description?: string;
  chartOfAccountId!: string;
  journalEntryId!: string;
}

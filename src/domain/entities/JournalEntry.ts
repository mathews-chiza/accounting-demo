import { Timestamp } from "firebase-admin/firestore";
import BaseEntity from "./base/BaseEntity";

export default class JournalEntry extends BaseEntity {
  referenceId!: string;
  referenceCollection!: string;
  description?: string;
  date!: Timestamp;
}

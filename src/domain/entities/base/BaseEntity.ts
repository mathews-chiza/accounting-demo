import { Timestamp } from "firebase-admin/firestore";

export default class BaseEntity {
  id!: string;
  createdAt?: Timestamp;
  createdBy?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

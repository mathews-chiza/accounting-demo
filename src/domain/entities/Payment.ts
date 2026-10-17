import { Timestamp } from 'firebase-admin/firestore';
import PaymentMethod from '../enums/PaymentMethod';
import BaseEntity from './base/BaseEntity';
import PaymentType from '../enums/PaymentType';

export default class Payment extends BaseEntity {
  paymentMethod!: PaymentMethod;

  amountPaid!: number;

  receiptNumber?: number;

  idempotencyKey!: string;

  idempotencyFingerprint!: string;

  paymentDate!: Timestamp;

  remainingBalance!: number;

  paymentType!: PaymentType;

  comments?: string;

  attachmentUrl?: string;

  externalReference?: string | null;

  customerId!: string | null;

  feeId!: string | null;

  billId!: string | null;

  categoryId!: string | null;

  chartOfAccountId!: string;

  journalEntryId?: string;
}

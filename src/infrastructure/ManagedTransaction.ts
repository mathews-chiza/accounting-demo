import { DocumentReference, DocumentSnapshot, Transaction } from "firebase-admin/firestore";

export default class ManagedTransaction {
  private readonly reads = new Map<string, DocumentSnapshot>();
  private hasWrites = false;

  constructor(readonly transaction: Transaction) {}

  async get(ref: DocumentReference): Promise<DocumentSnapshot> {
    if (this.hasWrites) {
      throw new Error('Transaction reads must precede writes.');
    }
    const snapshot = await this.transaction.get(ref);
    this.reads.set(ref.path, snapshot);
    return snapshot;
  }

  async getBeforeWrite(ref: DocumentReference): Promise<DocumentSnapshot> {
    const cached = this.reads.get(ref.path);
    return cached ?? this.get(ref);
  }

  set(ref: DocumentReference, data: object): void {
    this.hasWrites = true;
    this.transaction.set(ref, data);
  }

  update(ref: DocumentReference, data: object): void {
    this.hasWrites = true;
    this.transaction.update(ref, data);
  }
}

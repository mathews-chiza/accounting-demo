import {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';

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

  async exists(ref: DocumentReference): Promise<boolean> {
    if (this.hasWrites) {
      throw new Error('Transaction reads must precede writes.');
    }
    const [snapshot] = await this.transaction.getAll(ref, { fieldMask: [] });
    return snapshot.exists;
  }

  async getBeforeWrite(ref: DocumentReference): Promise<DocumentSnapshot> {
    const cached = this.reads.get(ref.path);
    return cached ?? this.get(ref);
  }

  set(ref: DocumentReference, data: object): void {
    this.hasWrites = true;
    this.transaction.set(ref, data);
  }

  create(ref: DocumentReference, data: object): void {
    this.hasWrites = true;
    this.transaction.create(ref, data);
  }

  update(ref: DocumentReference, data: object): void {
    this.hasWrites = true;
    this.transaction.update(ref, data);
  }
}

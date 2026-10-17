import { Firestore } from "firebase-admin/firestore";
import ITransactionManager from "../domain/services/ITransactionManager";
import ManagedTransaction from "./ManagedTransaction";
import { randomUUID } from "node:crypto";

export class TransactionManager implements ITransactionManager {
  private static readonly active = new Map<
    string,
    { db: Firestore; context: ManagedTransaction }
  >();

  constructor(private readonly db: Firestore) {}

  async run<T>(operation: (transactionId: string) => Promise<T>): Promise<T> {
    const transactionId = randomUUID();
    try {
      return await this.db.runTransaction(async (transaction) => {
        const context = new ManagedTransaction(transaction);
        TransactionManager.active.set(transactionId, { db: this.db, context });
        try {
          return await operation(transactionId);
        } finally {
          TransactionManager.active.delete(transactionId);
        }
      });
    } finally {
      TransactionManager.active.delete(transactionId);
    }
  }

  static resolve(transactionId: string, db: Firestore): ManagedTransaction {
    const active = TransactionManager.active.get(transactionId);
    if (!active || active.db !== db) {
      throw new Error('Unknown or expired transaction ID.');
    }
    return active.context;
  }
}

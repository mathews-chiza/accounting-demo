import { Firestore } from 'firebase-admin/firestore';
import BaseEntity from '../domain/entities/base/BaseEntity';
import IBaseRepository from '../domain/interfaces/base/IBaseRepository';
import { TransactionManager } from './TransactionManager';

export default class FirestoreBaseRepository<
  TEntity extends BaseEntity,
> implements IBaseRepository<TEntity> {
  constructor(
    protected readonly db: Firestore,
    protected readonly collectionName: string,
  ) {}

  async getById(id: string, transactionId?: string): Promise<TEntity | null> {
    const ref = this.db.collection(this.collectionName).doc(id);
    const snapshot = transactionId
      ? await TransactionManager.resolve(transactionId, this.db).get(ref)
      : await ref.get();

    return snapshot.exists ? ({ ...snapshot.data(), id: snapshot.id } as TEntity) : null;
  }

  async exists(id: string, transactionId?: string): Promise<boolean> {
    const ref = this.db.collection(this.collectionName).doc(id);
    if (transactionId) {
      return TransactionManager.resolve(transactionId, this.db).exists(ref);
    }

    const [snapshot] = await this.db.getAll(ref, { fieldMask: [] });
    return snapshot.exists;
  }

  async create(entity: TEntity, transactionId?: string): Promise<TEntity> {
    const collection = this.db.collection(this.collectionName);
    const ref = entity.id ? collection.doc(entity.id) : collection.doc();
    const created = { ...entity, id: ref.id } as TEntity;
    const data = this.toDocument(created);

    if (transactionId) {
      TransactionManager.resolve(transactionId, this.db).create(ref, data);
    } else {
      await ref.create(data);
    }

    return created;
  }

  async update(id: string, entity: TEntity, transactionId?: string): Promise<TEntity> {
    const ref = this.db.collection(this.collectionName).doc(id);
    const updated = { ...entity, id } as TEntity;
    const data = this.toDocument(updated);

    if (transactionId) {
      TransactionManager.resolve(transactionId, this.db).update(ref, data);
    } else {
      await ref.update(data);
    }

    return updated;
  }

  async batchCreate(entities: TEntity[], transactionId?: string): Promise<TEntity[]> {
    const collection = this.db.collection(this.collectionName);
    const records = entities.map((entity) => {
      const ref = entity.id ? collection.doc(entity.id) : collection.doc();
      const value = { ...entity, id: ref.id } as TEntity;
      return { ref, value, data: this.toDocument(value) };
    });

    if (transactionId) {
      const transaction = TransactionManager.resolve(transactionId, this.db);
      for (const { ref, data } of records) {
        transaction.create(ref, data);
      }
    } else if (records.length > 0) {
      const batch = this.db.batch();
      for (const { ref, data } of records) {
        batch.create(ref, data);
      }
      await batch.commit();
    }

    return records.map(({ value }) => value);
  }

  private toDocument(entity: TEntity): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(entity).filter(([, value]) => value !== undefined),
    );
  }
}

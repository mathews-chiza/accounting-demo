import BaseEntity from "../../entities/base/BaseEntity";

export default interface IBaseRepository<TEntity extends BaseEntity> {
  getById(id: string, transactionId?: string): Promise<TEntity | null>;
  create(entity: TEntity, transactionId?: string): Promise<TEntity>;
  update(id: string, entity: TEntity, transactionId?: string): Promise<TEntity>;
  batchCreate(entities: TEntity[], transactionId?: string): Promise<TEntity[]>;
  exists(id: string, transactionId?: string): Promise<boolean>;
}

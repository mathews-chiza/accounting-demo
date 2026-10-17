import Payment from "../entities/Payment";
import IBaseRepository from "./base/IBaseRepository";

export default interface IPaymentsRepository extends IBaseRepository<Payment> {}

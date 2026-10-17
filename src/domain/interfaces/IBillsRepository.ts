import Bill from "../entities/Bill";
import IBaseRepository from "./base/IBaseRepository";

export default interface IBillsRepository extends IBaseRepository<Bill> {}

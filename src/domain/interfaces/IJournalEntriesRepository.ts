import JournalEntry from "../entities/JournalEntry";
import IBaseRepository from "./base/IBaseRepository";

export default interface IJournalEntriesRepository extends IBaseRepository<JournalEntry> {}

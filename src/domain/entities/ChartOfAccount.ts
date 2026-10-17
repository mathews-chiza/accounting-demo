import ChartOfAccountType from "../enums/ChartOfAccountType";
import BaseEntity from "./base/BaseEntity";

export default class ChartOfAccount extends BaseEntity {
  name!: string;
  code!: string;
  type!: ChartOfAccountType;
  description?: string;
  isSystemGenerated?: boolean;
  totalDebits!: number;
  totalCredits!: number;
}
